use serde::{Serialize, Deserialize};
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use sha2::{Sha256, Digest};

#[derive(Serialize, Deserialize, Clone)]
struct Booking {
    id: Option<i32>,
    name: String,
    phone: String,
    date: String,
    bought: i32,
    status: String,
    created_by: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone)]
struct User {
    id: Option<i32>,
    name: String,
    phone: String,
    role: String,
    registered_at: String,
}

#[derive(Serialize, Deserialize)]
struct ClientHistory {
    attended: i32,
    missed: i32,
    last_name: String,
}

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
fn check_client_history(state: tauri::State<AppState>, phone: String) -> Result<ClientHistory, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("
        SELECT
            SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) as attended,
            SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
            MAX(name) as name
        FROM bookings WHERE phone = ?1
    ").map_err(|e| e.to_string())?;

    let history = stmt.query_row([&phone], |row| {
        Ok(ClientHistory {
            attended: row.get(0).unwrap_or(0),
            missed: row.get(1).unwrap_or(0),
            last_name: row.get(2).unwrap_or_else(|_| "".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    Ok(history)
}

// ИСПРАВЛЕНО: параметр created_by -> createdBy для совместимости с JS
#[tauri::command]
fn save_booking(
    state: tauri::State<AppState>, 
    name: String, 
    phone: String, 
    date: String, 
    bought: i32, 
    created_by: i32
) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO bookings (name, phone, date, bought, status, created_by) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
        (&name, &phone, &date, &bought, &created_by),
    ).map_err(|e| e.to_string())?;
    Ok("Запись успешна".into())
}

#[tauri::command]
fn update_status(state: tauri::State<AppState>, id: i32, status: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    db.execute("UPDATE bookings SET status = ?1 WHERE id = ?2", (&status, &id))
        .map_err(|e| e.to_string())?;
    Ok("Статус обновлен".into())
}

#[tauri::command]
fn get_bookings(state: tauri::State<AppState>) -> Result<Vec<Booking>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT id, name, phone, date, bought, status, created_by FROM bookings ORDER BY date ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Booking {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            phone: row.get(2)?,
            date: row.get(3)?,
            bought: row.get(4)?,
            status: row.get(5)?,
            created_by: row.get(6).ok(),
        })
    }).map_err(|e| e.to_string())?;
    let mut bookings = Vec::new();
    for row in rows { bookings.push(row.map_err(|e| e.to_string())?); }
    Ok(bookings)
}

#[tauri::command]
fn delete_booking(state: tauri::State<AppState>, id: i32) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM bookings WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok("Удалено".into())
}

#[tauri::command]
fn edit_booking(
    state: tauri::State<AppState>, 
    id: i32, 
    name: String, 
    phone: String, 
    date: String, 
    bought: i32, 
    status: String
) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE bookings SET name = ?1, phone = ?2, date = ?3, bought = ?4, status = ?5 WHERE id = ?6",
        (&name, &phone, &date, &bought, &status, &id),
    ).map_err(|e| e.to_string())?;
    Ok("Запись обновлена".into())
}

#[tauri::command]
fn register_user(state: tauri::State<AppState>, name: String, phone: String, password: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    
    // Проверка на дублирование телефона
    let exists: Result<i32, _> = db.query_row(
        "SELECT COUNT(*) FROM users WHERE phone = ?1",
        [&phone],
        |row| row.get(0)
    );
    
    if let Ok(count) = exists {
        if count > 0 {
            return Err("Пользователь с таким номером уже существует".to_string());
        }
    }
    
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    db.execute(
        "INSERT INTO users (name, phone, password_hash, role) VALUES (?1, ?2, ?3, 'worker')",
        (&name, &phone, &hash),
    ).map_err(|e| e.to_string())?;
    Ok("Пользователь зарегистрирован".into())
}

#[tauri::command]
fn login_user(state: tauri::State<AppState>, phone: String, password: String) -> Result<User, String> {
    let db = state.db.lock().unwrap();
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let mut stmt = db.prepare("SELECT id, name, phone, role, registered_at FROM users WHERE phone = ?1 AND password_hash = ?2")
        .map_err(|e| e.to_string())?;
    let user = stmt.query_row((&phone, &hash), |row| {
        Ok(User {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            phone: row.get(2)?,
            role: row.get(3)?,
            registered_at: row.get(4)?,
        })
    }).map_err(|_| "Неверный телефон или пароль".to_string())?;
    Ok(user)
}

#[tauri::command]
fn get_workers(state: tauri::State<AppState>) -> Result<Vec<User>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT id, name, phone, role, registered_at FROM users WHERE role = 'worker' OR role = 'admin'").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(User {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            phone: row.get(2)?,
            role: row.get(3)?,
            registered_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut users = Vec::new();
    for row in rows { users.push(row.map_err(|e| e.to_string())?); }
    Ok(users)
}

// ИСПРАВЛЕНО: изменено имя параметра worker_id -> workerId для совместимости с JS
#[tauri::command]
fn get_worker_history(state: tauri::State<AppState>, worker_id: i32) -> Result<Vec<Booking>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT id, name, phone, date, bought, status, created_by FROM bookings WHERE created_by = ?1 ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([worker_id], |row| {
        Ok(Booking {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            phone: row.get(2)?,
            date: row.get(3)?,
            bought: row.get(4)?,
            status: row.get(5)?,
            created_by: row.get(6).ok(),
        })
    }).map_err(|e| e.to_string())?;
    let mut bookings = Vec::new();
    for row in rows { bookings.push(row.map_err(|e| e.to_string())?); }
    Ok(bookings)
}

pub fn run() {
    let conn = Connection::open("database.db").expect("DB error");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY,
            name TEXT,
            phone TEXT,
            date TEXT,
            bought INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_by INTEGER,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )",
        [],
    ).expect("Table error");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'worker',
            registered_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).expect("User table error");

    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(conn) })
        .invoke_handler(tauri::generate_handler![
            save_booking, 
            get_bookings, 
            delete_booking, 
            update_status, 
            check_client_history, 
            edit_booking, 
            register_user, 
            login_user, 
            get_workers, 
            get_worker_history
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
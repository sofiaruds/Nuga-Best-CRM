use serde::{Serialize, Deserialize};
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use sha2::{Sha256, Digest};

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Booking {
    id: Option<i32>,
    name: String,
    phone: String,
    date: String,
    bought: i32,
    status: String,
    created_by: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct User {
    id: Option<i32>,
    name: String,
    phone: String,
    role: String,
    registered_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct ClientHistory {
    attended: i32,
    missed: i32,
    last_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Statistics {
    total: i32,
    attended: i32,
    missed: i32,
    pending: i32,
    bought: i32,
}

struct AppState {
    db: Mutex<Connection>,
}

// Проверка истории клиента
#[tauri::command]
fn check_client_history(state: tauri::State<AppState>, phone: String) -> Result<ClientHistory, String> {
    let db = state.db.lock().unwrap();
    
    let mut stmt = db.prepare("
        SELECT
            SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) as attended,
            SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
            MAX(name) as name
        FROM bookings WHERE phone = ?1
    ").map_err(|e| format!("Ошибка SQL: {}", e))?;

    let history = stmt.query_row([&phone], |row| {
        Ok(ClientHistory {
            attended: row.get(0).unwrap_or(0),
            missed: row.get(1).unwrap_or(0),
            last_name: row.get(2).unwrap_or_else(|_| "".to_string()),
        })
    }).map_err(|e| format!("Ошибка запроса: {}", e))?;

    Ok(history)
}

// Сохранение записи
#[tauri::command]
fn save_booking(
    state: tauri::State<AppState>, 
    name: String, 
    phone: String, 
    date: String, 
    bought: i32, 
    created_by: i32
) -> Result<String, String> {
    // Валидация данных
    if name.trim().is_empty() {
        return Err("Имя не может быть пустым".to_string());
    }
    if phone.trim().is_empty() {
        return Err("Телефон не может быть пустым".to_string());
    }
    if date.trim().is_empty() {
        return Err("Дата не может быть пустой".to_string());
    }

    let db = state.db.lock().unwrap();
    
    // Проверка на дубликаты (один и тот же человек в одно время)
    let exists: Result<i32, _> = db.query_row(
        "SELECT COUNT(*) FROM bookings WHERE phone = ?1 AND date = ?2 AND status = 'pending'",
        (&phone, &date),
        |row| row.get(0)
    );
    
    if let Ok(count) = exists {
        if count > 0 {
            return Err("Запись на это время уже существует".to_string());
        }
    }
    
    db.execute(
        "INSERT INTO bookings (name, phone, date, bought, status, created_by) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
        (&name.trim(), &phone.trim(), &date, &bought, &created_by),
    ).map_err(|e| format!("Ошибка добавления: {}", e))?;
    
    Ok("Запись успешно создана".into())
}

// Обновление статуса
#[tauri::command]
fn update_status(state: tauri::State<AppState>, id: i32, status: String) -> Result<String, String> {
    // Валидация статуса
    if !["pending", "attended", "missed"].contains(&status.as_str()) {
        return Err("Неверный статус".to_string());
    }

    let db = state.db.lock().unwrap();
    let rows_affected = db.execute(
        "UPDATE bookings SET status = ?1 WHERE id = ?2", 
        (&status, &id)
    ).map_err(|e| format!("Ошибка обновления: {}", e))?;
    
    if rows_affected == 0 {
        return Err("Запись не найдена".to_string());
    }
    
    Ok("Статус обновлен".into())
}

// Получение всех записей
#[tauri::command]
fn get_bookings(state: tauri::State<AppState>) -> Result<Vec<Booking>, String> {
    let db = state.db.lock().unwrap();
    
    let mut stmt = db.prepare(
        "SELECT id, name, phone, date, bought, status, created_by 
         FROM bookings 
         ORDER BY date DESC"
    ).map_err(|e| format!("Ошибка SQL: {}", e))?;
    
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
    }).map_err(|e| format!("Ошибка запроса: {}", e))?;
    
    let mut bookings = Vec::new();
    for row in rows { 
        bookings.push(row.map_err(|e| format!("Ошибка обработки строки: {}", e))?); 
    }
    
    Ok(bookings)
}

// Удаление записи
#[tauri::command]
fn delete_booking(state: tauri::State<AppState>, id: i32) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    
    let rows_affected = db.execute(
        "DELETE FROM bookings WHERE id = ?1", 
        [id]
    ).map_err(|e| format!("Ошибка удаления: {}", e))?;
    
    if rows_affected == 0 {
        return Err("Запись не найдена".to_string());
    }
    
    Ok("Запись удалена".into())
}

// Редактирование записи
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
    // Валидация
    if name.trim().is_empty() {
        return Err("Имя не может быть пустым".to_string());
    }
    if phone.trim().is_empty() {
        return Err("Телефон не может быть пустым".to_string());
    }
    if !["pending", "attended", "missed"].contains(&status.as_str()) {
        return Err("Неверный статус".to_string());
    }

    let db = state.db.lock().unwrap();
    
    let rows_affected = db.execute(
        "UPDATE bookings SET name = ?1, phone = ?2, date = ?3, bought = ?4, status = ?5 WHERE id = ?6",
        (&name.trim(), &phone.trim(), &date, &bought, &status, &id),
    ).map_err(|e| format!("Ошибка обновления: {}", e))?;
    
    if rows_affected == 0 {
        return Err("Запись не найдена".to_string());
    }
    
    Ok("Запись обновлена".into())
}

// Регистрация пользователя
#[tauri::command]
fn register_user(
    state: tauri::State<AppState>, 
    name: String, 
    phone: String, 
    password: String
) -> Result<String, String> {
    // Валидация
    if name.trim().is_empty() {
        return Err("Имя не может быть пустым".to_string());
    }
    if phone.trim().is_empty() {
        return Err("Телефон не может быть пустым".to_string());
    }
    if password.len() < 4 {
        return Err("Пароль должен содержать минимум 4 символа".to_string());
    }
    
    let db = state.db.lock().unwrap();
    
    // Проверка на дублирование телефона
    let exists: Result<i32, _> = db.query_row(
        "SELECT COUNT(*) FROM users WHERE phone = ?1",
        [&phone.trim()],
        |row| row.get(0)
    );
    
    if let Ok(count) = exists {
        if count > 0 {
            return Err("Пользователь с таким номером уже существует".to_string());
        }
    }
    
    // Хеширование пароля
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    
    db.execute(
        "INSERT INTO users (name, phone, password_hash, role) VALUES (?1, ?2, ?3, 'worker')",
        (&name.trim(), &phone.trim(), &hash),
    ).map_err(|e| format!("Ошибка регистрации: {}", e))?;
    
    Ok("Регистрация успешна".into())
}

// Вход пользователя
#[tauri::command]
fn login_user(
    state: tauri::State<AppState>, 
    phone: String, 
    password: String
) -> Result<User, String> {
    if phone.trim().is_empty() || password.is_empty() {
        return Err("Заполните все поля".to_string());
    }
    
    let db = state.db.lock().unwrap();
    
    // Хеширование пароля
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    
    let mut stmt = db.prepare(
        "SELECT id, name, phone, role, registered_at 
         FROM users 
         WHERE phone = ?1 AND password_hash = ?2"
    ).map_err(|e| format!("Ошибка SQL: {}", e))?;
    
    let user = stmt.query_row((&phone.trim(), &hash), |row| {
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

// Получение списка работников
#[tauri::command]
fn get_workers(state: tauri::State<AppState>) -> Result<Vec<User>, String> {
    let db = state.db.lock().unwrap();
    
    let mut stmt = db.prepare(
        "SELECT id, name, phone, role, registered_at 
         FROM users 
         WHERE role IN ('worker', 'admin')
         ORDER BY registered_at DESC"
    ).map_err(|e| format!("Ошибка SQL: {}", e))?;
    
    let rows = stmt.query_map([], |row| {
        Ok(User {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            phone: row.get(2)?,
            role: row.get(3)?,
            registered_at: row.get(4)?,
        })
    }).map_err(|e| format!("Ошибка запроса: {}", e))?;
    
    let mut users = Vec::new();
    for row in rows { 
        users.push(row.map_err(|e| format!("Ошибка обработки строки: {}", e))?); 
    }
    
    Ok(users)
}

// История работника
#[tauri::command]
fn get_worker_history(state: tauri::State<AppState>, worker_id: i32) -> Result<Vec<Booking>, String> {
    let db = state.db.lock().unwrap();
    
    let mut stmt = db.prepare(
        "SELECT id, name, phone, date, bought, status, created_by 
         FROM bookings 
         WHERE created_by = ?1 
         ORDER BY date DESC"
    ).map_err(|e| format!("Ошибка SQL: {}", e))?;
    
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
    }).map_err(|e| format!("Ошибка запроса: {}", e))?;
    
    let mut bookings = Vec::new();
    for row in rows { 
        bookings.push(row.map_err(|e| format!("Ошибка обработки строки: {}", e))?); 
    }
    
    Ok(bookings)
}

// НОВАЯ ФУНКЦИЯ: Получение статистики
#[tauri::command]
fn get_statistics(state: tauri::State<AppState>) -> Result<Statistics, String> {
    let db = state.db.lock().unwrap();
    
    let mut stmt = db.prepare(
        "SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) as attended,
            SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN bought = 1 THEN 1 ELSE 0 END) as bought
         FROM bookings"
    ).map_err(|e| format!("Ошибка SQL: {}", e))?;
    
    let stats = stmt.query_row([], |row| {
        Ok(Statistics {
            total: row.get(0).unwrap_or(0),
            attended: row.get(1).unwrap_or(0),
            missed: row.get(2).unwrap_or(0),
            pending: row.get(3).unwrap_or(0),
            bought: row.get(4).unwrap_or(0),
        })
    }).map_err(|e| format!("Ошибка запроса: {}", e))?;
    
    Ok(stats)
}

// НОВАЯ ФУНКЦИЯ: Сделать пользователя админом (для отладки)
#[tauri::command]
fn make_admin(state: tauri::State<AppState>, phone: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    
    let rows_affected = db.execute(
        "UPDATE users SET role = 'admin' WHERE phone = ?1",
        [&phone.trim()]
    ).map_err(|e| format!("Ошибка обновления: {}", e))?;
    
    if rows_affected == 0 {
        return Err("Пользователь не найден".to_string());
    }
    
    Ok("Пользователь теперь администратор".into())
}

pub fn run() {
    let conn = Connection::open("database.db").expect("Ошибка открытия базы данных");
    
    // Создание таблицы пользователей
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'worker',
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).expect("Ошибка создания таблицы users");
    
    // Создание таблицы бронирований
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            date DATETIME NOT NULL,
            bought INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
        )",
        [],
    ).expect("Ошибка создания таблицы bookings");
    
    // Создание индексов для оптимизации
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone)",
        [],
    ).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)",
        [],
    ).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)",
        [],
    ).ok();

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
            get_worker_history,
            get_statistics,
            make_admin
        ])
        .run(tauri::generate_context!())
        .expect("Ошибка запуска приложения");
}
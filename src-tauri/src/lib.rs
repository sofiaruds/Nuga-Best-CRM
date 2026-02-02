use serde::{Serialize, Deserialize};
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use bcrypt::{hash, verify, DEFAULT_COST};
use sha2::{Sha256, Digest};
use tauri::Manager;

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

fn hash_password(password: &str) -> Result<String, String> {
    hash(password, DEFAULT_COST).map_err(|e| format!("Ошибка хеширования пароля: {}", e))
}

fn verify_password(password: &str, password_hash: &str) -> Result<bool, String> {
    verify(password, password_hash).map_err(|e| format!("Ошибка проверки пароля: {}", e))
}

fn is_legacy_sha256_hash(password_hash: &str) -> bool {
    password_hash.len() == 64 && password_hash.chars().all(|c| c.is_ascii_hexdigit())
}

fn verify_legacy_sha256(password: &str, password_hash: &str) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    hash == password_hash
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
    created_by: Option<i32>
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
    
    // Проверка, что пользователь существует (если передан id)
    if let Some(user_id) = created_by {
        let exists: Result<i32, _> = db.query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        );
        if let Ok(count) = exists {
            if count == 0 {
                return Err("Пользователь не найден".to_string());
            }
        }
    }

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
    
    let password_hash = hash_password(&password)?;
    
    db.execute(
        "INSERT INTO users (name, phone, password_hash, role) VALUES (?1, ?2, ?3, 'worker')",
        (&name.trim(), &phone.trim(), &password_hash),
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
    
    let (user, user_id, password_hash) = {
        let mut stmt = db.prepare(
            "SELECT id, name, phone, role, registered_at, password_hash
             FROM users 
             WHERE phone = ?1"
        ).map_err(|e| format!("Ошибка SQL: {}", e))?;
        
        stmt.query_row((&phone.trim(),), |row| {
            let user_id: i32 = row.get(0)?;
            Ok((
                User {
                    id: Some(user_id),
                    name: row.get(1)?,
                    phone: row.get(2)?,
                    role: row.get(3)?,
                    registered_at: row.get(4)?,
                },
                user_id,
                row.get::<_, String>(5)?,
            ))
        }).map_err(|_| "Неверный телефон или пароль".to_string())?
    };
    
    let is_valid = if password_hash.starts_with("$2") {
        verify_password(&password, &password_hash)?
    } else if is_legacy_sha256_hash(&password_hash) {
        let legacy_ok = verify_legacy_sha256(&password, &password_hash);
        if legacy_ok {
            let new_hash = hash_password(&password)?;
            db.execute(
                "UPDATE users SET password_hash = ?1 WHERE id = ?2",
                (&new_hash, &user_id),
            ).map_err(|e| format!("Ошибка обновления пароля: {}", e))?;
        }
        legacy_ok
    } else {
        false
    };

    if !is_valid {
        return Err("Неверный телефон или пароль".to_string());
    }
    
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
    if !cfg!(debug_assertions) && std::env::var("ALLOW_MAKE_ADMIN").ok().as_deref() != Some("1") {
        return Err("Команда отключена в релизе".to_string());
    }

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
    tauri::Builder::default()
        .setup(|app| -> std::result::Result<(), Box<dyn std::error::Error>> {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("database.db");
            let conn = Connection::open(db_path)?;

            conn.execute("PRAGMA foreign_keys = ON", [])?;

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
            )?;
            
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
            )?;
            
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

            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_pending 
                 ON bookings(phone, date) 
                 WHERE status = 'pending'",
                [],
            )?;

            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
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

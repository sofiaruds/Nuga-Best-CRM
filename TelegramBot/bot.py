import logging
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ConversationHandler, ContextTypes
import sqlite3
import os
import hashlib
from datetime import datetime, timedelta

# --- Настройки ---
DB_PATH = os.path.join(os.path.dirname(__file__), '../src-tauri/database.db')
TOKEN = '8451352199:AAHhGX3CXRcqNWLkcebYv6ZX5w0WNojRjdc'  # <-- Вставьте сюда токен вашего бота

# --- Состояния для ConversationHandler ---
NAME, PHONE, DATE = range(3)
LOGIN_PHONE, LOGIN_PASSWORD = range(10, 12)
DATE_SELECT, TIME_SELECT = range(20, 22)

# --- Логирование ---
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

# --- Авторизация ---
USERS = {}

# --- Кнопки для времени ---
SCHEDULE_TIMES = [
    '8:00', '8:40', '9:20', '10:00', '10:40', '11:20',
    '12:00', '12:40', '13:20', '14:00', '14:40'
]

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        'Привет! Я бот для записи клиентов в Nuga Best CRM.\n'\
        'Для работы необходимо войти.\n'\
        'Используйте команду /login для входа.\n'\
        'Доступные команды после входа:\n'\
        '/new — добавить клиента\n/list — посмотреть клиентов\n/cancel — отменить ввод\n/help — помощь'
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        'Доступные команды:\n'\
        '/login — войти в систему\n/new — добавить клиента\n/list — посмотреть клиентов\n/cancel — отменить ввод\n/help — помощь'
    )

async def login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text('Введите номер телефона:')
    return LOGIN_PHONE

async def login_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['login_phone'] = update.message.text.strip()
    await update.message.reply_text('Введите пароль:')
    return LOGIN_PASSWORD

async def login_password(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = context.user_data['login_phone']
    password = update.message.text.strip()
    # Хешируем пароль как в CRM
    hash = hashlib.sha256(password.encode()).hexdigest()
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE phone = ? AND password_hash = ?", (phone, hash))
        row = cur.fetchone()
        conn.close()
        if row:
            USERS[update.effective_user.id] = phone
            await update.message.reply_text('✅ Вход выполнен! Теперь вы можете использовать команды для работы с клиентами.')
            await help_command(update, context)
        else:
            await update.message.reply_text('❌ Неверный телефон или пароль. Попробуйте снова через /login.')
    except Exception as e:
        await update.message.reply_text(f'Ошибка при входе: {e}')
    return ConversationHandler.END

# --- Проверка авторизации ---
def is_logged_in(user_id):
    return user_id in USERS

# --- Команды ---
async def new_booking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_logged_in(update.effective_user.id):
        await update.message.reply_text('Сначала войдите с помощью /login')
        return ConversationHandler.END
    await update.message.reply_text('Введите имя клиента:')
    return NAME

async def get_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text.strip()
    await update.message.reply_text('Введите телефон клиента:')
    return PHONE

async def get_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['phone'] = update.message.text.strip()
    # Генерируем кнопки с датами на ближайшие 7 дней
    today = datetime.now()
    date_buttons = [[(today + timedelta(days=i)).strftime('%Y-%m-%d')] for i in range(7)]
    reply_markup = ReplyKeyboardMarkup(date_buttons, one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text('Выберите дату приёма:', reply_markup=reply_markup)
    return DATE_SELECT

async def get_date_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['date'] = update.message.text.strip()
    # Кнопки для выбора времени
    keyboard = [[t] for t in SCHEDULE_TIMES]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text('Выберите время приёма:', reply_markup=reply_markup)
    return TIME_SELECT

async def get_time_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    time = update.message.text.strip()
    date = context.user_data['date']
    name = context.user_data['name']
    phone = context.user_data['phone']
    datetime_str = f"{date} {time}"
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("INSERT INTO bookings (name, phone, date, bought, status) VALUES (?, ?, ?, 0, 'pending')", (name, phone, datetime_str))
        conn.commit()
        conn.close()
        await update.message.reply_text(f'✅ Клиент записан!\nИмя: {name}\nТелефон: {phone}\nДата и время: {datetime_str}', reply_markup=ReplyKeyboardRemove())
    except Exception as e:
        await update.message.reply_text(f'❌ Ошибка при записи: {e}', reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text('Запись отменена.')
    return ConversationHandler.END

async def list_bookings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_logged_in(update.effective_user.id):
        await update.message.reply_text('Сначала войдите с помощью /login')
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name, phone, date, status FROM bookings ORDER BY date DESC LIMIT 20")
        rows = cur.fetchall()
        conn.close()
        if not rows:
            await update.message.reply_text('Нет записей.')
            return
        msg = 'Последние записи клиентов:\n\n'
        for i, (name, phone, date, status) in enumerate(rows, 1):
            msg += f"{i}. {name} | {phone} | {date} | {status}\n"
        await update.message.reply_text(msg)
    except Exception as e:
        await update.message.reply_text(f'Ошибка при получении записей: {e}')

# --- Основной запуск ---
def main():
    app = ApplicationBuilder().token(TOKEN).build()

    login_conv = ConversationHandler(
        entry_points=[CommandHandler('login', login)],
        states={
            LOGIN_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, login_phone)],
            LOGIN_PASSWORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, login_password)],
        },
        fallbacks=[CommandHandler('cancel', cancel)]
    )

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('new', new_booking)],
        states={
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_name)],
            PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_phone)],
            DATE_SELECT: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_date_select)],
            TIME_SELECT: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_time_select)],
        },
        fallbacks=[CommandHandler('cancel', cancel)]
    )

    app.add_handler(CommandHandler('start', start))
    app.add_handler(CommandHandler('help', help_command))
    app.add_handler(CommandHandler('list', list_bookings))
    app.add_handler(login_conv)
    app.add_handler(conv_handler)
    app.add_handler(CommandHandler('cancel', cancel))

    print('Бот запущен!')
    app.run_polling()

if __name__ == '__main__':
    main()

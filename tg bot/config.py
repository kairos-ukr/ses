# config.py
"""
Налаштування бота.

Секрети — токен бота, ключ Supabase і ключ Нової Пошти — лише у файлі
.env поруч із цим файлом. .env не потрапляє в git: ключ service_role
відкриває всю базу в обхід будь-яких обмежень, і опинитись у
репозиторії він не повинен. Шаблон — .env.example.
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    # Без python-dotenv змінні можна задати в оточенні сервера напряму
    pass


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Не задано {name}. Додайте його у файл .env поруч із config.py "
            f"(зразок — .env.example)."
        )
    return value


# --- Секрети (з .env) ---
BOT_TOKEN = _required("BOT_TOKEN")
SUPABASE_URL = _required("SUPABASE_URL")
SUPABASE_KEY = _required("SUPABASE_SERVICE_KEY")
NOVAPOSHTA_API_KEY = os.getenv("NOVAPOSHTA_API_KEY", "").strip()

# --- Налаштування модуля "Створення Топіків" ---
TOPIC_SUPERGROUP_ID = -1002391318453  # ID групи для створення топіків
CHECK_INTERVAL = 30  # Інтервал перевірки нових клієнтів у секундах
BIRTHDAY_TOPIC_ID = 252
# --- Налаштування модуля "Розклад Робіт" ---
SCHEDULE_SUPERGROUP_ID = -1002391318453  # ID групи для надсилання розкладу
SCHEDULE_TOPIC_ID = 252
# для мікрозадач
POLLING_INTERVAL_SECONDS = 60
TELEGRAM_SUPERGROUP_ID = -1002391318453
TELEGRAM_TOPIC_ID = 6244

# для посилок
PARCEL_SUPERGROUP_ID = -1002391318453
# ID "гілки" (топіку) всередині цієї групи, куди будуть йти повідомлення
PARCEL_TOPIC_ID = 4795
# --- Налаштування фонових завдань (APScheduler) ---
# Як часто перевіряти нові/оновлені записи (напр. 'pending_tth')
NEW_CHECK_INTERVAL_SECONDS = 30
# Як часто перевіряти статуси посилок, що вже в дорозі ('notified', 'at_branch')
ACTIVE_CHECK_INTERVAL_SECONDS = 1800  # (раз на 30 хвилин)


ADMIN_ID = 1690568504  # ВАШ ОСОБИСТИЙ TELEGRAM ID
TZ = "Europe/Kyiv"   # Ваша часова зона

# --- Особисті повідомлення ---
# Адреса сайту для посилань у повідомленнях (HashRouter — тому з #)
SITE_URL = "https://kairos-ukr.github.io/ses/#"
# Не турбуємо людей уночі: особисті повідомлення — лише в цей проміжок
# за Києвом. Те, що назбиралось уночі, піде зранку.
PERSONAL_DAY_START_HOUR = 8
PERSONAL_DAY_END_HOUR = 22

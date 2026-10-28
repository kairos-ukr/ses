import asyncio
from datetime import datetime
import pytz

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from supabase import create_client, Client

# Імпорт налаштувань
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TELEGRAM_SUPERGROUP_ID,
    POLLING_INTERVAL_SECONDS,
)
from notifier import esc, report_error

# Ініціалізація Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KYIV_TZ = pytz.timezone('Europe/Kyiv')

MODULE = "Додаткова інформація по обʼєктах"


async def check_new_notes(bot: Bot):
    """
    Періодично перевіряє таблицю project_additional_info на нові повідомлення.
    """
    print("✅ Моніторинг додаткової інформації (Notes) запущено.")

    while True:
        try:
            # 1. Шукаємо повідомлення, які ще не відправлені (is_sent_to_telegram = FALSE)
            # Використовуємо join, щоб отримати внутрішній id інсталяції для пошуку топіка
            response = supabase.table("project_additional_info")\
                .select("*, installations!inner(id, name)")\
                .eq("is_sent_to_telegram", False)\
                .execute()
        except Exception as e:
            await report_error(bot, MODULE, "читання нової додаткової інформації", e)
            await asyncio.sleep(POLLING_INTERVAL_SECONDS)
            continue

        for note in response.data or []:
            note_id = note['id']
            custom_id = note['installation_custom_id']
            inst_name = (note.get('installations') or {}).get('name') or 'без назви'
            text_content = note['message_text']
            author = note.get('author_name') or "Невідомо"
            created_at_str = note['created_at']
            context = {"Обʼєкт": f"{inst_name} #{custom_id}", "Автор": author, "Запис": note_id}

            try:
                # Внутрішній ID об'єкта (потрібен для пошуку thread_id)
                inst_internal_id = note['installations']['id']

                # 2. Шукаємо ID топіка (thread_id) в таблиці installation_messages
                msg_rows = supabase.table("installation_messages")\
                    .select("thread_id")\
                    .eq("installation_id", inst_internal_id)\
                    .limit(1)\
                    .execute().data

                thread_id = msg_rows[0].get('thread_id') if msg_rows else None

                # Якщо топіка немає — ми не можемо відправити в гілку.
                # Позначаємо як відправлене, щоб не зациклити бота.
                if not thread_id:
                    print(f"⚠️ Топік для об'єкта #{custom_id} не знайдено. Пропускаю повідомлення.")
                    supabase.table("project_additional_info").update({"is_sent_to_telegram": True}).eq("id", note_id).execute()
                    continue

                # 3. Формуємо час та повідомлення
                try:
                    dt_object = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    time_str = dt_object.astimezone(KYIV_TZ).strftime("%d.%m %H:%M")
                except (TypeError, ValueError):
                    time_str = datetime.now(KYIV_TZ).strftime("%d.%m %H:%M")

                final_msg = (
                    f"ℹ️ <b>Додаткова інформація:</b>\n\n"
                    f"{esc(text_content)}\n\n"
                    f"👤 <b>Від:</b> {esc(author)}\n"
                    f"🕒 <i>{time_str}</i>"
                )

                # 4. Відправляємо в Telegram
                await bot.send_message(
                    chat_id=TELEGRAM_SUPERGROUP_ID,
                    message_thread_id=thread_id,
                    text=final_msg,
                    parse_mode=ParseMode.HTML
                )

                # 5. Оновлюємо статус в БД (успіх)
                supabase.table("project_additional_info").update({"is_sent_to_telegram": True}).eq("id", note_id).execute()

                # Невелика пауза, щоб не спамити API
                await asyncio.sleep(0.5)

            except TelegramRetryAfter as e:
                print(f"⏳ Flood limit. Чекаю {e.retry_after} сек.")
                await asyncio.sleep(e.retry_after)
                # Не оновлюємо статус, спробуємо в наступному циклі

            except TelegramBadRequest as e:
                # Топік видалено або інша помилка запиту — повтор не допоможе
                await report_error(bot, MODULE, "надсилання додаткової інформації в гілку об'єкта", e, context)
                supabase.table("project_additional_info").update({"is_sent_to_telegram": True}).eq("id", note_id).execute()

            except Exception as e:
                # Статус не міняємо — спробуємо пізніше; повтори стримує notifier
                await report_error(bot, MODULE, "надсилання додаткової інформації в гілку об'єкта", e, context)

        await asyncio.sleep(POLLING_INTERVAL_SECONDS)

def register_notes_monitor(dp, bot):
    asyncio.create_task(check_new_notes(bot))

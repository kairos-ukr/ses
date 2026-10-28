# microtask_manager.py
import asyncio
import re
import traceback
from datetime import datetime, time, timedelta
import pytz

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest
from supabase import create_client, Client

# --- ІМПОРТ НАЛАШТУВАНЬ ---
# Переконайтеся, що файл config.py існує і містить ці змінні
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TELEGRAM_SUPERGROUP_ID,
    POLLING_INTERVAL_SECONDS,
    TELEGRAM_TOPIC_ID,
)
from notifier import report_error

MODULE = "Мікрозадачі"

# --- ІНІЦІАЛІЗАЦІЯ ---
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KYIV_TZ = pytz.timezone('Europe/Kyiv')


# ==============================================================================
# ДОПОМІЖНІ ФУНКЦІЇ (ФОРМАТУВАННЯ ТА ОТРИМАННЯ ДАНИХ)
# ==============================================================================

def format_task_message_html(task: dict, related_info: dict | None = None) -> str:
    """Форматує текст головного повідомлення задачі (HTML)."""
    icon = "📝"
    message_parts = []

    # 1. Заголовок
    message_parts.append(f"{icon} <b>Мікрозадача #{task['custom_id']}</b>")
    message_parts.append("------------------------------------")

    # 2. Блок "Від кого" та "Кому"
    people_block = []
    
    # Від кого
    creator_text = task.get('creator_email')
    if related_info and related_info.get('creator_name'):
        creator_text = related_info['creator_name']
    
    if creator_text:
        people_block.append(f"👤 <b>Від:</b> {creator_text}")
    
    # Кому
    if related_info and related_info.get('assigned_employee_name'):
        people_block.append(f"👉 <b>Кому:</b> {related_info['assigned_employee_name']}")
    
    if people_block:
        message_parts.append("\n".join(people_block))
        message_parts.append("------------------------------------")

    # 3. Блок інформації про об'єкт/клієнта
    if related_info:
        related_block = []
        if related_info.get("installation_name"):
            related_block.append(f"<b>Об'єкт:</b> {related_info['installation_name']}")
        if related_info.get("client_name"):
            related_block.append(f"<b>Клієнт:</b> {related_info['client_name']}")
        if related_info.get("client_phone"):
            related_block.append(f"<b>📞 Телефон:</b> {related_info['client_phone']}")
        if related_info.get("location"):
            related_block.append(f"<b>📍 Локація:</b> {related_info['location']}")
        
        if related_block:
            message_parts.append("\n".join(related_block))
            message_parts.append("------------------------------------")

    # 4. Текст задачі
    message_parts.append(task['task_text'])
    message_parts.append("------------------------------------")
    
    # 5. Метадані (дата створення та дедлайн)
    metadata_parts = []
    
    try:
        created_at_naive = datetime.fromisoformat(task['created_at']).replace(tzinfo=None)
        created_at_kyiv = KYIV_TZ.localize(created_at_naive)
    except Exception:
        created_at_kyiv = datetime.now(KYIV_TZ)

    metadata_parts.append(f"🗓️ <b>Створена:</b> {created_at_kyiv.strftime('%Y-%m-%d %H:%M')}")
    
    if task.get('due_date'):
        try:
            due_date = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
            metadata_parts.append(f"⏳ <b>Дедлайн:</b> {due_date.strftime('%Y-%m-%d')}")
        except Exception:
            pass

    message_parts.append("\n".join(metadata_parts))
        
    return "\n".join(message_parts)


async def get_related_info_for_task(task: dict) -> dict | None:
    """Отримує імена співробітників, дані клієнта та об'єкта."""
    result = {}

    # 1. Виконавець
    if task.get('assigned_to'):
        try:
            emp_resp = supabase.table("employees").select("name").eq("custom_id", task['assigned_to']).single().execute()
            if emp_resp.data:
                result["assigned_employee_name"] = emp_resp.data.get("name")
        except Exception: pass

    # 2. Автор
    if task.get('creator_email'):
        try:
            creator_resp = supabase.table("employees").select("name").eq("email", task['creator_email']).maybe_single().execute()
            if creator_resp.data:
                result["creator_name"] = creator_resp.data.get("name")
        except Exception: pass

    # 3. Об'єкт та Клієнт
    if task.get('installation_id'):
        try:
            inst_resp = supabase.table("installations").select("*").eq("id", task['installation_id']).single().execute()
            if inst_resp.data:
                installation = inst_resp.data
                result["installation_name"] = installation.get('name')
                
                if installation.get('client_id'):
                    client_resp = supabase.table("clients").select("*").eq("custom_id", installation['client_id']).single().execute()
                    if client_resp.data:
                        client = client_resp.data
                        result["client_name"] = client.get('name')
                        result["client_phone"] = client.get('phone')
                        location_parts = filter(None, [client.get('oblast'), client.get('populated_place')])
                        result["location"] = ", ".join(location_parts)
        except Exception as e:
            print(f"[ERROR] Related info error: {e}")

    return result if result else None


async def delete_all_reminders(bot: Bot, task_id: str):
    """
    Знаходить всі нагадування для задачі, видаляє їх з чату та очищає таблицю task_reminders.
    """
    try:
        # 1. Отримуємо список нагадувань з БД
        rem_resp = supabase.table("task_reminders").select("*").eq("task_id", task_id).execute()
        
        if rem_resp.data:
            # 2. Видаляємо повідомлення в Telegram
            for reminder in rem_resp.data:
                try:
                    await bot.delete_message(
                        chat_id=reminder['chat_id'], 
                        message_id=reminder['message_id']
                    )
                except Exception:
                    # Ігноруємо помилки (наприклад, повідомлення вже видалено користувачем)
                    pass
            
            # 3. Видаляємо записи з БД
            supabase.table("task_reminders").delete().eq("task_id", task_id).execute()
            
    except Exception as e:
        print(f"[ERROR] delete_all_reminders error #{task_id}: {e}")


# ==============================================================================
# ФОНОВІ ЗАДАЧІ (LOOPS)
# ==============================================================================

async def check_new_tasks(bot: Bot):
    """Моніторинг нових задач (status='нове') і публікація в чат."""
    while True:
        task_id = None
        try:
            response = supabase.table("microtasks").select("*").eq("status", "нове").execute()

            for task in response.data:
                task_id = task['custom_id']
                # Перевірка, чи вже є повідомлення для цієї задачі
                msg_check = supabase.table("task_messages").select("message_id").eq("task_id", task_id).execute()

                if not msg_check.data:
                    related_info = await get_related_info_for_task(task)
                    message_to_send = format_task_message_html(task, related_info)
                    
                    sent_message = await bot.send_message(
                        chat_id=TELEGRAM_SUPERGROUP_ID,
                        text=message_to_send,
                        parse_mode=ParseMode.HTML,
                        message_thread_id=TELEGRAM_TOPIC_ID
                    )
                    
                    supabase.table("task_messages").insert({
                        "task_id": task_id,
                        "message_id": sent_message.message_id,
                        "chat_id": TELEGRAM_SUPERGROUP_ID,
                        "last_message_sync_at": datetime.now(pytz.utc).isoformat(),
                        "is_closed_in_telegram": False
                    }).execute()
        except Exception as e:
            await report_error(bot, MODULE, "публікація нової задачі в гілку «Мікрозадачі»", e,
                               {"Задача": f"#{task_id}" if task_id else None})
        
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


async def check_updated_tasks(bot: Bot):
    """Моніторинг змін у задачах (оновлення тексту/дедлайну)."""
    while True:
        try:
            resp = supabase.table("microtasks").select(
                "*, task_messages(message_id, chat_id, last_message_sync_at)"
            ).in_("status", ["нове", "в процесі"]).eq(
                "task_messages.is_closed_in_telegram", False
            ).execute()

            if resp.data:
                for task in resp.data:
                    task_id = task.get('custom_id')
                    msg_info = task.get('task_messages')
                    
                    if not msg_info or not task.get('updated_at'): continue
                    
                    # Порівняння часу оновлення
                    db_updated_at = datetime.fromisoformat(task.get('updated_at'))
                    last_sync_at_str = msg_info.get('last_message_sync_at')
                    
                    should_edit = False
                    if not last_sync_at_str:
                        should_edit = True
                    else:
                        last_sync_at = datetime.fromisoformat(last_sync_at_str)
                        if db_updated_at > last_sync_at:
                            should_edit = True
                    
                    if should_edit:
                        related_info = await get_related_info_for_task(task)
                        new_text = format_task_message_html(task, related_info)
                        
                        try:
                            await bot.edit_message_text(
                                chat_id=msg_info['chat_id'],
                                message_id=msg_info['message_id'],
                                text=new_text,
                                parse_mode=ParseMode.HTML
                            )
                            
                            supabase.table("task_messages").update(
                                {"last_message_sync_at": datetime.now(pytz.utc).isoformat()}
                            ).eq("task_id", task_id).execute()
                        except TelegramBadRequest as e:
                            if "message is not modified" not in str(e):
                                await report_error(bot, MODULE, "оновлення тексту задачі в гілці «Мікрозадачі»", e,
                                                   {"Задача": f"#{task_id}"})
                        except Exception as e:
                            await report_error(bot, MODULE, "оновлення тексту задачі в гілці «Мікрозадачі»", e,
                                               {"Задача": f"#{task_id}"})

        except Exception as e:
            await report_error(bot, MODULE, "пошук змінених задач", e)
        
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


async def check_closed_tasks(bot: Bot):
    """
    Закриває задачі в Telegram (закреслює текст) і ВИДАЛЯЄ НАГАДУВАННЯ,
    якщо статус в БД змінився на 'виконано' або 'скасовано'.
    """
    while True:
        try:
            resp = supabase.table("microtasks").select(
                "*, task_messages(*)"
            ).in_("status", ["виконано", "скасовано"]).eq(
                "task_messages.is_closed_in_telegram", False
            ).execute()

            if resp.data:
                for task in resp.data:
                    task_id = task.get('custom_id')
                    msg_info = task.get('task_messages')
                    if not task_id or not msg_info: continue

                    # 1. Оновлюємо основне повідомлення (закреслюємо)
                    try:
                        related_info = await get_related_info_for_task(task)
                        original_message_text = format_task_message_html(task, related_info)
                        
                        completion_time = datetime.now(KYIV_TZ).strftime('%Y-%m-%d %H:%M')
                        new_status = task['status']
                        status_line = (f"✅ <b>Виконано:</b> {completion_time}" if new_status == 'виконано' 
                                       else f"❌ <b>Скасовано:</b> {completion_time}")
                        
                        new_text = f"<s>{original_message_text}</s>\n\n{status_line}"
                        
                        await bot.edit_message_text(
                            chat_id=msg_info['chat_id'],
                            message_id=msg_info['message_id'],
                            text=new_text,
                            parse_mode=ParseMode.HTML
                        )
                    except Exception as e:
                        if "message is not modified" not in str(e):
                            await report_error(bot, MODULE, "закреслення виконаної/скасованої задачі в гілці", e,
                                               {"Задача": f"#{task_id}", "Статус": task.get('status')})

                    # 2. Видаляємо всі нагадування
                    await delete_all_reminders(bot, task_id)

                    # 3. Маркуємо як закрите в БД
                    supabase.table("task_messages").update({"is_closed_in_telegram": True}).eq("task_id", task_id).execute()

        except Exception as e:
            await report_error(bot, MODULE, "закриття виконаних і скасованих задач у Telegram", e)
        
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


async def send_task_reminders(bot: Bot):
    """
    Логіка нагадувань (запускається за розкладом).
    - Якщо немає дедлайну: нагадуємо кожні 3 дні.
    - Якщо є дедлайн:
        - Прострочено: нагадуємо кожні 3 дні.
        - Сьогодні/Завтра: нагадуємо один раз.
    - Формат: коротке повідомлення-відповідь (Reply).
    """
    today = datetime.now(KYIV_TZ).date()
    
    try:
        # Обираємо активні задачі, які мають прив'язку до повідомлення в Telegram
        resp = supabase.table("microtasks").select(
            "*, task_messages(message_id, chat_id)"
        ).in_("status", ["нове", "в процесі"]).not_.is_("task_messages", "null").execute()
        
        if not resp.data: return

        for task in resp.data:
            task_id = task['custom_id']
            msg_info = task.get('task_messages')
            
            if not msg_info: continue # Без прив'язки не можемо зробити Reply

            # --- Визначення дат ---
            last_reminder_date = None
            last_reminder_at_str = task.get('last_reminder_sent_at')
            if last_reminder_at_str:
                # Конвертуємо UTC з БД в Kyiv time
                dt_utc = datetime.fromisoformat(last_reminder_at_str).replace(tzinfo=pytz.utc)
                last_reminder_date = dt_utc.astimezone(KYIV_TZ).date()

            # Якщо вже нагадували СЬОГОДНІ — пропускаємо
            if last_reminder_date == today:
                continue

            # Дата створення (для задач без дедлайну)
            created_at_dt = datetime.fromisoformat(task['created_at']).replace(tzinfo=None)
            created_at_date = created_at_dt.replace(tzinfo=pytz.utc).astimezone(KYIV_TZ).date()

            reminder_text = ""
            should_send = False

            # === ГІЛКА 1: Є ДЕДЛАЙН ===
            if task.get('due_date'):
                due_date = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
                days_diff = (due_date - today).days # < 0 = прострочено

                if days_diff < 0:
                    # ПРОСТРОЧЕНО (Кожні 3 дні)
                    days_since_last = (today - last_reminder_date).days if last_reminder_date else 999
                    
                    if days_since_last >= 3:
                        should_send = True
                        reminder_text = (
                            f"🚨 <b>ПРОСТРОЧЕНО!</b>\n"
                            f"Дедлайн був: {due_date.strftime('%d.%m.%Y')}\n"
                            f"Прохання виконати або актуалізувати статус."
                        )

                elif days_diff == 0:
                    # СЬОГОДНІ
                    should_send = True
                    reminder_text = "⏰ <b>Нагадування:</b> Дедлайн задачі СЬОГОДНІ!"
                
                elif days_diff == 1:
                    # ЗАВТРА
                    should_send = True
                    reminder_text = "🔥 <b>Нагадування:</b> Дедлайн задачі завтра."

            # === ГІЛКА 2: НЕМАЄ ДЕДЛАЙНУ ===
            else:
                # Кожні 3 дні від останнього нагадування або від створення
                check_date = last_reminder_date if last_reminder_date else created_at_date
                days_passed = (today - check_date).days

                if days_passed >= 3:
                    should_send = True
                    reminder_text = (
                        "🔔 <b>Нагадування</b>\n"
                        "Задача висить в роботі понад 3 дні.\n"
                        "Прохання взяти до уваги або виконати."
                    )

            # === ВІДПРАВКА ===
            if should_send and reminder_text:
                try:
                    reply_to_msg_id = msg_info['message_id']
                    chat_id = msg_info['chat_id']

                    # Відправляємо Reply
                    sent_reminder = await bot.send_message(
                        chat_id=chat_id,
                        text=reminder_text,
                        parse_mode=ParseMode.HTML,
                        message_thread_id=TELEGRAM_TOPIC_ID,
                        reply_to_message_id=reply_to_msg_id
                    )
                    
                    # Записуємо час нагадування (в UTC для стандартизації)
                    supabase.table("microtasks").update(
                        {"last_reminder_sent_at": datetime.now(pytz.utc).isoformat()}
                    ).eq("custom_id", task_id).execute()

                    # Зберігаємо ID нагадування для подальшого видалення
                    supabase.table("task_reminders").insert({
                        "task_id": task_id,
                        "message_id": sent_reminder.message_id,
                        "chat_id": sent_reminder.chat.id
                    }).execute()
                    
                    await asyncio.sleep(1) # Уникнення лімітів API

                except Exception as e:
                    await report_error(bot, MODULE, "надсилання нагадування про задачу в гілку", e,
                                       {"Задача": f"#{task_id}", "Дедлайн": task.get('due_date')})

    except Exception as e:
        await report_error(bot, MODULE, "ранкова перевірка нагадувань по задачах", e)


async def schedule_daily_reminders(bot: Bot):
    """Планувальник: запускає перевірку нагадувань щодня о 8:00 за Києвом."""
    REMINDER_TIME = time(8, 0, 0)
    while True:
        try:
            now_kyiv = datetime.now(KYIV_TZ)
            next_run = now_kyiv.replace(hour=REMINDER_TIME.hour, minute=REMINDER_TIME.minute, second=0, microsecond=0)
            
            if now_kyiv > next_run:
                next_run += timedelta(days=1)
            
            wait_seconds = (next_run - now_kyiv).total_seconds()
            await asyncio.sleep(wait_seconds)
            
            await send_task_reminders(bot)
            
            # Чекаємо трохи, щоб не запустити двічі в одну секунду
            await asyncio.sleep(60)
        except Exception as e:
            print(f"[ERROR] Scheduler: {e}")
            await asyncio.sleep(60)


# ==============================================================================
# ОБРОБНИКИ КОМАНД (HANDLERS)
# ==============================================================================

async def handle_list_active_tasks(message: types.Message, bot: Bot):
    """Команда /zadachi - виводить список активних задач."""
    if message.message_thread_id != TELEGRAM_TOPIC_ID: return
    
    try:
        resp = supabase.table("microtasks").select("custom_id, task_text, due_date").in_("status", ["нове", "в процесі"]).order("due_date").execute()

        text = ""
        if not resp.data:
            text = "👍 <b>Немає активних мікрозадач.</b>"
        else:
            parts = [f"<b>📋 Активні задачі ({len(resp.data)}):</b>\n"]
            for task in resp.data:
                tid = task['custom_id']
                short_text = (task['task_text'][:70] + '...') if len(task['task_text']) > 70 else task['task_text']
                clean_text = re.sub(r'<[^>]+>', '', short_text).replace('\n', ' ')
                
                status_icon = "⏳"
                if task.get('due_date'):
                    try:
                        dd = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
                        today = datetime.now(KYIV_TZ).date()
                        diff = (dd - today).days
                        if diff < 0: status_icon = f"🚨 {dd.strftime('%d.%m')}"
                        elif diff == 0: status_icon = f"⏰ {dd.strftime('%d.%m')}"
                        else: status_icon = f"📅 {dd.strftime('%d.%m')}"
                    except: pass
                
                parts.append(f"• <b>#{tid}</b> {status_icon}\n <i>{clean_text}</i>")
            text = "\n\n".join(parts)

        # Логіка оновлення щоденного повідомлення (запобігає спаму списками)
        today_str = datetime.now(KYIV_TZ).date().isoformat()
        exist = supabase.table("daily_list_messages").select("*").eq("list_date", today_str).execute()

        if exist.data:
            try:
                await bot.edit_message_text(
                    chat_id=exist.data[0]['chat_id'],
                    message_id=exist.data[0]['message_id'],
                    text=text,
                    parse_mode=ParseMode.HTML
                )
            except: pass
        else:
            old = supabase.table("daily_list_messages").select("*").lt("list_date", today_str).execute()
            for o in old.data:
                try: await bot.delete_message(chat_id=o['chat_id'], message_id=o['message_id'])
                except: pass
            supabase.table("daily_list_messages").delete().lt("list_date", today_str).execute()

            new_msg = await message.reply(text, parse_mode=ParseMode.HTML)
            supabase.table("daily_list_messages").insert({
                "list_date": today_str,
                "message_id": new_msg.message_id,
                "chat_id": new_msg.chat.id
            }).execute()
        
        await message.react([types.ReactionTypeEmoji(emoji="👍")])

    except Exception as e:
        print(f"[ERROR] /zadachi: {e}")
        await message.react([types.ReactionTypeEmoji(emoji="👎")])


async def handle_status_update(message: types.Message, bot: Bot):
    """
    Обробка повідомлень типу 'мікрозадача 1234 виконана/скасовано'.
    Закриває задачу, оновлює БД та ВИДАЛЯЄ НАГАДУВАННЯ.
    """
    if message.message_thread_id != TELEGRAM_TOPIC_ID: return

    match = re.search(r"мікрозадача\s*(\d{4})\s*(виконана|скасовано)", message.text, re.IGNORECASE)
    if not match: return

    task_id = match.group(1)
    new_status = "виконано" if match.group(2).lower() == "виконана" else "скасовано"
    
    try:
        msg_resp = supabase.table("task_messages").select("*").eq("task_id", task_id).single().execute()
        if not msg_resp.data: 
            await message.react([types.ReactionTypeEmoji(emoji="👎")])
            return

        task_resp = supabase.table("microtasks").select("*").eq("custom_id", task_id).single().execute()
        if not task_resp.data: return
        
        # 1. Оновлення статусу в БД
        supabase.table("microtasks").update({
            "status": new_status,
            "last_reminder_sent_at": datetime.now(pytz.utc).isoformat()
        }).eq("custom_id", task_id).execute()

        # 2. Оновлення тексту повідомлення
        related_info = await get_related_info_for_task(task_resp.data)
        original_text = format_task_message_html(task_resp.data, related_info)
        completion_time = datetime.now(KYIV_TZ).strftime('%Y-%m-%d %H:%M')
        status_line = (f"✅ <b>Виконано:</b> {completion_time}" if new_status == 'виконано' else f"❌ <b>Скасовано:</b> {completion_time}")
        new_text = f"<s>{original_text}</s>\n\n{status_line}"
        
        await bot.edit_message_text(
            chat_id=msg_resp.data['chat_id'],
            message_id=msg_resp.data['message_id'],
            text=new_text,
            parse_mode=ParseMode.HTML
        )
        
        # 3. ВИДАЛЕННЯ ВСІХ НАГАДУВАНЬ
        await delete_all_reminders(bot, task_id)
        
        # 4. Фіналізація
        supabase.table("task_messages").update({"is_closed_in_telegram": True}).eq("task_id", task_id).execute()
        await message.react([types.ReactionTypeEmoji(emoji="👍")])

    except Exception as e:
        print(f"[ERROR] Handle status update #{task_id}: {e}")
        await message.react([types.ReactionTypeEmoji(emoji="👎")])


def register_handlers_microtasks(dp: Dispatcher, bot: Bot):
    """Реєстрація хендлерів та запуск фонових задач."""
    dp.message.register(handle_list_active_tasks, Command("zadachi"))
    dp.message.register(handle_status_update, F.text.regexp(r'мікрозадача\s*(\d{4})\s*(виконана|скасовано)', flags=re.I))
    
    asyncio.create_task(check_new_tasks(bot))
    asyncio.create_task(check_updated_tasks(bot))
    asyncio.create_task(check_closed_tasks(bot))
    asyncio.create_task(schedule_daily_reminders(bot))
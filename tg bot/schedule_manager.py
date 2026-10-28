import asyncio
import re
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional, Set, Tuple

import pytz
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject
from aiogram.exceptions import TelegramBadRequest
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from supabase import create_client, Client

# Припускається, що у вас є файл config.py з цими змінними
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    SCHEDULE_SUPERGROUP_ID,
    SCHEDULE_TOPIC_ID
)

# Ініціалізація клієнта Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- РОБОТА З БД ---


async def get_schedule_for_date(work_date: date) -> Optional[Dict[str, Any]]:
    """Отримує розклад на вказану дату (разом із транспортом з Календаря)."""
    date_str = work_date.strftime('%Y-%m-%d')
    try:
        response = supabase.rpc('get_daily_schedule', {'target_date': date_str}).execute()
        if not response.data or not isinstance(response.data, dict):
            return {"objects": [], "tasks_without_object": [], "off_duty": []}
        data = response.data
        attach_transport(work_date, data)
        return data
    except Exception as e:
        print(f"Критична помилка отримання розкладу на {date_str}: {e!r}")
        return None


def attach_transport(work_date: date, data: Dict[str, Any]) -> None:
    """
    Дописує до об'єктів і завдань, на чому їде бригада: авто компанії
    або власне авто працівника, і хто за кермом (поїздки з Календаря).
    """
    try:
        trips = (
            supabase.table("trips")
            .select("vehicle_id, own_car_custom_id, driver_custom_id, vehicles(name, plate), trip_stops(installation_custom_id, place)")
            .eq("trip_date", work_date.strftime('%Y-%m-%d'))
            .neq("status", "cancelled")
            .execute()
        ).data or []
        if not trips:
            return
        ids = {t.get("driver_custom_id") for t in trips} | {t.get("own_car_custom_id") for t in trips}
        ids = [i for i in ids if i]
        names = {}
        if ids:
            emp = supabase.table("employees").select("custom_id, name").in_("custom_id", ids).execute().data or []
            names = {e["custom_id"]: e["name"] for e in emp}

        by_object: Dict[Any, str] = {}
        by_place: Dict[str, str] = {}
        for t in trips:
            veh = t.get("vehicles") or {}
            if veh.get("name"):
                what = veh["name"] + (f" {veh['plate']}" if veh.get("plate") else "")
            elif t.get("own_car_custom_id"):
                what = f"власне авто: {names.get(t['own_car_custom_id'], t['own_car_custom_id'])}"
            else:
                what = "транспорт"
            if t.get("driver_custom_id"):
                what += f" · водій {names.get(t['driver_custom_id'], t['driver_custom_id'])}"
            for s in t.get("trip_stops") or []:
                if s.get("installation_custom_id"):
                    by_object[s["installation_custom_id"]] = what
                elif s.get("place"):
                    by_place[s["place"].strip()] = what

        for obj in data.get("objects") or []:
            if obj.get("custom_id") in by_object:
                obj["transport"] = by_object[obj["custom_id"]]
        data["transport_by_task"] = by_place
    except Exception as e:
        print(f"Не вдалося додати транспорт до графіка на {work_date}: {e!r}")


async def add_day_off_requests(employee_id: int, dates: List[date]) -> bool:
    """
    Додає або оновлює записи про вихідні для працівника,
    також додає позначку 'source', що це з телеграму.
    """
    records = [
        {
            "employee_custom_id": employee_id,
            "work_date": d.strftime('%Y-%m-%d'),
            "status": "OFF",
            "source": "telegram"
        }
        for d in dates
    ]
    try:
        supabase.table("attendance").upsert(records, on_conflict="employee_custom_id, work_date").execute()
        return True
    except Exception as e:
        print(f"Помилка додавання вихідних для {employee_id}: {e}")
        return False


async def save_schedule_message(work_date: date, message_id: int):
    """Зберігає або оновлює ID повідомлення з розкладом + last_updated_at."""
    try:
        supabase.table("daily_schedule_messages").upsert(
            {
                "work_date": work_date.strftime('%Y-%m-%d'),
                "message_id": message_id,
                "last_updated_at": datetime.utcnow().isoformat() + "Z",
            },
            on_conflict="work_date"
        ).execute()
    except Exception as e:
        print(f"Помилка збереження ID повідомлення для {work_date}: {e}")


async def get_schedule_message_id(work_date: date) -> Optional[int]:
    """Отримує ID існуючого повідомлення з розкладом."""
    try:
        response = supabase.table("daily_schedule_messages") \
            .select("message_id") \
            .eq("work_date", work_date.strftime('%Y-%m-%d')) \
            .single().execute()
        return response.data['message_id'] if response.data else None
    except Exception:
        return None


# --- ФОРМАТУВАННЯ ТА ВІДПРАВКА ---

MONTHS_UA = {
    1: "січня", 2: "лютого", 3: "березня", 4: "квітня", 5: "травня", 6: "червня",
    7: "липня", 8: "серпня", 9: "вересня", 10: "жовтня", 11: "листопада", 12: "грудня"
}

# Кеш останніх повідомлень по вихідних для конкретного тижня в конкретному чаті
# ключ: (chat_id, f"{start}_{end}"), значення: message_id
LAST_WEEKENDS_MESSAGES: Dict[Tuple[int, str], int] = {}


def get_next_week(today: Optional[date] = None) -> Tuple[date, date]:
    """
    Визначає наступний календарний тиждень (понеділок–неділя) відносно поточного дня.
    Приклади:
      20.11 -> 24–30.11
      23.11 -> 24–30.11
      30.11 -> 01–07.12
    """
    if today is None:
        today = date.today()

    # Початок поточного тижня (понеділок)
    start_current_week = today - timedelta(days=today.weekday())
    # Початок наступного тижня
    start_next_week = start_current_week + timedelta(days=7)
    end_next_week = start_next_week + timedelta(days=6)
    return start_next_week, end_next_week


def parse_period(period_str: str, today: Optional[date] = None) -> Tuple[date, date]:
    """
    Парсинг рядка формату:
      - "17-23.11.2025"
      - "17-23.11"        (поточний рік)
      - "17.11-23.11.2025"
      - "28.10-3.11.2025" тощо

    Логіка:
      start_day[.start_month] - end_day.end_month[.year]
    Якщо start_month не вказаний — беремо end_month.
    Якщо рік не вказаний — беремо поточний.
    """
    if today is None:
        today = date.today()

    import re as _re

    pattern = _re.compile(
        r"""
        ^\s*
        (?P<start_day>\d{1,2})
        (?:\.(?P<start_month>\d{1,2}))?
        \s*-\s*
        (?P<end_day>\d{1,2})
        \.(?P<end_month>\d{1,2})
        (?:\.(?P<year>\d{4}))?
        \s*$
        """,
        _re.VERBOSE,
    )

    m = pattern.match(period_str.strip())
    if not m:
        raise ValueError("Неможливо розібрати період")

    start_day = int(m.group("start_day"))
    start_month = m.group("start_month")
    end_day = int(m.group("end_day"))
    end_month = int(m.group("end_month"))
    year = m.group("year")

    year_int = int(year) if year else today.year
    start_month_int = int(start_month) if start_month else int(end_month)
    end_month_int = int(end_month)

    try:
        start_date = date(year_int, start_month_int, start_day)
        end_date = date(year_int, end_month_int, end_day)
    except ValueError as e:
        raise ValueError(f"Невалідні дати в періоді: {e}")

    if end_date < start_date:
        raise ValueError("Дата закінчення менша за дату початку")

    return start_date, end_date


def escape_html(text: Optional[str]) -> str:
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if text else ""


def numbered_workers_lines(workers: List[Dict[str, Any]]) -> str:
    """Формує нумерований список працівників: 1., 2., 3., ... (із custom_id якщо є)."""
    sorted_ws = sorted(workers, key=lambda x: x.get('name', '') or '')
    lines = []
    for idx, w in enumerate(sorted_ws, start=1):
        name = escape_html(w.get('name', "Ім'я невідоме"))
        cid = w.get('custom_id')
        if cid:
            lines.append(f"{idx}. {name} ({cid})")
        else:
            lines.append(f"{idx}. {name}")
    return "\n".join(lines)


def format_schedule_message(work_date: date, data: Dict[str, Any]) -> str:
    """Форматує повідомлення з розкладом за новими вимогами."""
    date_str = f"{work_date.day} {MONTHS_UA[work_date.month]}"
    header = f"<b>🗓️ {date_str}</b>"
    separator = "____________________"

    if not data.get('objects') and not data.get('off_duty') and not data.get('tasks_without_object'):
        return f"{header}\n{separator}\n\nІнформація відсутня."

    message_parts = [header]

    # 1) Блок об'єктів (залишаємо заголовок як був, але працівників нумеруємо)
    if data.get('objects'):
        for obj in sorted(data['objects'], key=lambda x: x.get('name', '') or ''):
            message_parts.append(separator)

            obj_name = escape_html(obj.get('name'))
            obj_id = obj.get('custom_id')
            obj_head = f"<b>📍 Об'єкт:</b> {obj_name} ({obj_id})" if obj_id else f"<b>📍 Об'єкт:</b> {obj_name}"

            obj_part = [obj_head]
            if obj.get('notes'):
                obj_part.append(escape_html(obj['notes']))

            if obj.get('workers'):
                workers_text = numbered_workers_lines(obj.get('workers', []))
                if workers_text:
                    obj_part.append(workers_text)

            if obj.get('transport'):
                obj_part.append(f"🚐 {escape_html(obj['transport'])}")

            message_parts.append("\n".join(obj_part))

    # 2) Блок інших завдань
    if data.get('tasks_without_object'):
        message_parts.append(separator)

        # Групуємо працівників за однаковим notes
        grouped_tasks: Dict[str, List[Dict[str, Any]]] = {}
        for task in data['tasks_without_object']:
            task_note = task['notes']
            worker_info = {'name': task['worker_name'], 'custom_id': task.get('worker_id')}
            grouped_tasks.setdefault(task_note, []).append(worker_info)

        tasks_block = ["<b>📝 Інші завдання:</b>"]
        # Завдання без нумерації, тільки маркер • ; працівники всередині — нумеровані
        transport_by_task = data.get('transport_by_task') or {}
        for task_name, workers in sorted(grouped_tasks.items(), key=lambda kv: kv[0] or ''):
            title_line = f"• {escape_html(task_name)}"
            workers_list = numbered_workers_lines(workers)
            lines = [title_line, workers_list]
            transport = transport_by_task.get((task_name or '').strip())
            if transport:
                lines.append(f"🚐 {escape_html(transport)}")
            tasks_block.append("\n".join(lines))

        message_parts.append("\n\n".join(tasks_block))

    # 3) Блок вихідних (включаємо нумерацію)
    if data.get('off_duty'):
        message_parts.append(separator)
        off_duty_text = numbered_workers_lines(data.get('off_duty', []))
        message_parts.append(f"<b>😴 Вихідні:</b>\n{off_duty_text}")

    return "\n\n".join(message_parts)


def format_weekends_message(
    start_date: date,
    end_date: date,
    weekends_by_day: Dict[date, List[Dict[str, Any]]],
) -> str:
    """
    Формує повідомлення формату:

    Вихідні 24–30 листопада

    24.11
    1. Іванов
    2. Петренко

    25.11
    1. Сидоренко

    26.11
    – немає записів
    """

    # Заголовок
    if start_date.month == end_date.month and start_date.year == end_date.year:
        range_str = f"{start_date.day}–{end_date.day} {MONTHS_UA[start_date.month]}"
    else:
        range_str = (
            f"{start_date.day} {MONTHS_UA[start_date.month]} – "
            f"{end_date.day} {MONTHS_UA[end_date.month]}"
        )

    lines: List[str] = [f"Вихідні {range_str}", ""]

    cur = start_date
    while cur <= end_date:
        lines.append(cur.strftime("%d.%m"))

        workers = weekends_by_day.get(cur, [])
        if workers:
            # Нумерований список працівників
            workers_sorted = sorted(workers, key=lambda x: x.get("name", "") or "")
            for idx, w in enumerate(workers_sorted, start=1):
                name = w.get("name") or f"ID: {w.get('custom_id')}"
                lines.append(f"{idx}. {name}")
        else:
            lines.append("– немає записів")

        lines.append("")  # Порожній рядок між днями
        cur += timedelta(days=1)

    return "\n".join(lines).rstrip()


# ---- ВІДПРАВКА / ОНОВЛЕННЯ ПОВІДОМЛЕНЬ ----

async def send_or_update_schedule(bot: Bot, work_date: date, chat_id: int, topic_id: int):
    """
    Базова поведінка (для планувальника): оновлює існуюче повідомлення,
    якщо є — редагує; якщо нема — надсилає нове.
    """
    schedule_data = await get_schedule_for_date(work_date)
    if schedule_data is None:
        try:
            await bot.send_message(
                chat_id,
                "Не вдалося отримати дані розкладу через помилку.",
                message_thread_id=topic_id
            )
        except Exception as e:
            print(f"Помилка відправки повідомлення про помилку: {e}")
        return

    message_text = format_schedule_message(work_date, schedule_data)
    msg_id = await get_schedule_message_id(work_date)

    try:
        if msg_id:
            await bot.edit_message_text(
                text=message_text,
                chat_id=chat_id,
                message_id=msg_id,
                parse_mode="HTML",
                disable_web_page_preview=True
            )
        else:
            sent_msg = await bot.send_message(
                chat_id,
                message_text,
                message_thread_id=topic_id,
                parse_mode="HTML",
                disable_web_page_preview=True
            )
            await save_schedule_message(work_date, sent_msg.message_id)

    except TelegramBadRequest as e:
        # Якщо не змінилось — просто повертаємося; інакше пробуємо відправити нове
        if "message is not modified" not in e.message:
            try:
                sent_msg = await bot.send_message(
                    chat_id,
                    message_text,
                    message_thread_id=topic_id,
                    parse_mode="HTML",
                    disable_web_page_preview=True
                )
                await save_schedule_message(work_date, sent_msg.message_id)
            except Exception as e2:
                print(f"Помилка повторної відправки розкладу: {e2}")
    except Exception as e:
        print(f"Помилка відправки/оновлення розкладу: {e}")


async def send_new_and_replace_old(bot: Bot, work_date: date, chat_id: int, topic_id: int):
    """
    (!!! НОВА ПОВЕДІНКА ДЛЯ КОМАНДИ !!!)
    Завжди надсилає НОВЕ повідомлення з розкладом, а старе (якщо було) — видаляє.
    """
    schedule_data = await get_schedule_for_date(work_date)
    if schedule_data is None:
        try:
            await bot.send_message(
                chat_id,
                "Не вдалося отримати дані розкладу через помилку.",
                message_thread_id=topic_id
            )
        except Exception as e:
            print(f"Помилка відправки повідомлення про помилку: {e}")
        return

    message_text = format_schedule_message(work_date, schedule_data)
    old_msg_id = await get_schedule_message_id(work_date)

    # 1) Надсилаємо нове
    try:
        sent_msg = await bot.send_message(
            chat_id,
            message_text,
            message_thread_id=topic_id,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        await save_schedule_message(work_date, sent_msg.message_id)
    except Exception as e:
        print(f"Не вдалося відправити новий розклад: {e}")
        return

    # 2) Пробуємо видалити попереднє (якщо було)
    if old_msg_id:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=old_msg_id)
        except TelegramBadRequest as e:
            # Наприклад, якщо повідомлення вже видалили вручну або занадто старе
            if "message to delete not found" not in str(e):
                print(f"Помилка видалення старого повідомлення {old_msg_id}: {e}")
        except Exception as e:
            print(f"Невідома помилка видалення старого повідомлення {old_msg_id}: {e}")


# --- ДОДАТКОВІ ФУНКЦІЇ ДЛЯ ВИХІДНИХ ---

async def get_weekends_for_period(start_date: date, end_date: date) -> Dict[date, List[Dict[str, Any]]]:
    """
    Отримує з БД працівників зі статусом OFF у діапазоні дат [start_date; end_date].
    Повертає dict: { date: [ { "name": str, "custom_id": int }, ... ], ... }
    """
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    try:
        response = (
            supabase
            .table("attendance")
            .select("employee_custom_id, work_date")
            .eq("status", "OFF")
            .gte("work_date", start_str)
            .lte("work_date", end_str)
            .execute()
        )
        rows = response.data or []
    except Exception as e:
        print(f"Помилка отримання вихідних з {start_str} по {end_str}: {e}")
        return {}

    if not rows:
        return {}

    employee_ids = sorted({row["employee_custom_id"] for row in rows})
    try:
        emp_response = (
            supabase
            .table("employees")
            .select("custom_id, name")
            .in_("custom_id", employee_ids)
            .execute()
        )
        employees = emp_response.data or []
    except Exception as e:
        print(f"Помилка отримання працівників для вихідних: {e}")
        employees = []

    emp_map = {emp["custom_id"]: emp["name"] for emp in employees}

    result: Dict[date, List[Dict[str, Any]]] = {}
    for row in rows:
        try:
            d = datetime.strptime(row["work_date"], "%Y-%m-%d").date()
        except Exception:
            continue

        emp_id = row["employee_custom_id"]
        emp_name = emp_map.get(emp_id, f"ID: {emp_id}")

        result.setdefault(d, []).append(
            {"name": emp_name, "custom_id": emp_id}
        )

    return result


def format_day_off_dates_list(dates: List[date]) -> str:
    """
    Форматує список дат у вигляді:
      "14, 16, 18 листопада"
    або, якщо різні місяці:
      "30 жовтня, 1, 2 листопада"
    """
    if not dates:
        return ""

    dates_sorted = sorted(dates)

    from collections import defaultdict
    groups: Dict[Tuple[int, int], List[int]] = defaultdict(list)
    for d in dates_sorted:
        groups[(d.month, d.year)].append(d.day)

    parts = []
    for (month, year), days in groups.items():
        days_str = ", ".join(str(x) for x in days)
        month_name = MONTHS_UA.get(month, "")
        parts.append(f"{days_str} {month_name}")

    return ", ".join(parts)


# --- ОБРОБНИКИ КОМАНД ---

async def handle_schedule_command(message: types.Message, command: CommandObject, bot: Bot):
    """Обробник команди /schedule — завжди нове повідомлення, старе видаляємо."""
    target_date = date.today() + timedelta(days=1)
    if command.args:
        try:
            target_date = datetime.strptime(command.args, "%d-%m-%Y").date()
        except (ValueError, TypeError):
            await message.reply("Невірний формат дати. Введіть: <code>/schedule ДД-ММ-РРРР</code>")
            return

    await send_new_and_replace_old(
        bot,
        target_date,
        SCHEDULE_SUPERGROUP_ID,
        SCHEDULE_TOPIC_ID
    )
    if message.chat.id != SCHEDULE_SUPERGROUP_ID or message.message_thread_id != SCHEDULE_TOPIC_ID:
        try:
            await message.react([types.ReactionTypeEmoji(emoji="👍")])
        except Exception:
            pass


def parse_dates_from_string(text: str) -> Set[date]:
    """Парсить дати з рядка, підтримує формати "15.10", "15.10, 16.10", "15.10-20.10".""" 
    dates = set()
    current_year = date.today().year
    parts = text.replace(" ", "").split(',')

    for part in parts:
        if not part:
            continue

        if '-' in part:
            try:
                start_str, end_str = part.split('-')
                start_date = datetime.strptime(f"{start_str}.{current_year}", "%d.%m.%Y").date()
                end_date = datetime.strptime(f"{end_str}.{current_year}", "%d.%m.%Y").date()

                delta = end_date - start_date
                for i in range(delta.days + 1):
                    day = start_date + timedelta(days=i)
                    dates.add(day)
            except ValueError:
                continue
        else:
            try:
                d = datetime.strptime(f"{part}.{current_year}", "%d.%m.%Y").date()
                dates.add(d)
            except ValueError:
                continue

    return dates


async def process_day_off_request(message: types.Message):
    """Обробляє запит на вихідний від працівника (з телеграму)."""
    try:
        lines = message.text.split('\n')
        employee_id = int(lines[0].strip())
        dates_str = lines[1].lower().replace("вихідний:", "").strip()

        dates_to_add = parse_dates_from_string(dates_str)

        if dates_to_add and await add_day_off_requests(employee_id, list(dates_to_add)):
            await message.react([types.ReactionTypeEmoji(emoji="👍")])
        else:
            await message.react([types.ReactionTypeEmoji(emoji="👎")])

    except Exception as e:
        print(f"Помилка обробки запиту на вихідний: {e}")
        await message.react([types.ReactionTypeEmoji(emoji="👎")])

# --- ХЕНДЛЕРИ ДЛЯ ВИХІДНИХ (ТИЖНІ/ПЕРІОДИ) ---


async def send_weekends_and_replace_old(
    message: types.Message,
    bot: Bot,
    start_date: date,
    end_date: date,
):
    """
    Надсилає звіт по вихідних за період і
    видаляє попереднє повідомлення для цього ж періоду в цьому чаті.
    """
    period_key = f"{start_date.isoformat()}_{end_date.isoformat()}"
    key = (message.chat.id, period_key)

    old_msg_id = LAST_WEEKENDS_MESSAGES.get(key)
    if old_msg_id:
        try:
            await bot.delete_message(chat_id=message.chat.id, message_id=old_msg_id)
        except TelegramBadRequest:
            pass
        except Exception as e:
            print(f"Помилка видалення попереднього повідомлення про вихідні: {e}")

    weekends_by_day = await get_weekends_for_period(start_date, end_date)
    text = format_weekends_message(start_date, end_date, weekends_by_day)

    sent = await message.answer(text)
    LAST_WEEKENDS_MESSAGES[key] = sent.message_id


async def handle_weekends_next_command(message: types.Message, bot: Bot):
    """
    /weekends_next – наступний календарний тиждень (понеділок–неділя)
    """
    start_date, end_date = get_next_week()
    await send_weekends_and_replace_old(message, bot, start_date, end_date)


async def handle_weekends_command(message: types.Message, command: CommandObject, bot: Bot):
    """
    /weekends 17-23.11.2025
    /weekends 17-23.11   (поточний рік)
    """
    if not command.args:
        await message.reply(
            "Вкажіть період у форматі:\n"
            "<code>/weekends 17-23.11.2025</code>\n"
            "або\n"
            "<code>/weekends 17-23.11</code>",
            parse_mode="HTML",
        )
        return

    try:
        start_date, end_date = parse_period(command.args)
    except ValueError:
        await message.reply(
            "Невірний формат періоду.\n"
            "Приклади:\n"
            "<code>/weekends 17-23.11.2025</code>\n"
            "<code>/weekends 17-23.11</code>",
            parse_mode="HTML",
        )
        return

    await send_weekends_and_replace_old(message, bot, start_date, end_date)


# --- ПЛАНУВАЛЬНИК ---


async def scheduled_task(bot: Bot):
    """(Залишено для можливого використання, але в планувальник більше не додається)."""
    tomorrow = date.today() + timedelta(days=1)
    await send_or_update_schedule(
        bot,
        tomorrow,
        SCHEDULE_SUPERGROUP_ID,
        SCHEDULE_TOPIC_ID
    )


async def check_for_web_day_offs(bot: Bot):
    """
    Перевіряє БД на нові вихідні (додані з сайту),
    надсилає сповіщення та позначає їх як оброблені.

    Якщо в одного працівника є кілька дат вихідних — об'єднуємо в одне повідомлення:
      ℹ️ Новий вихідний (з сайту)

      Імʼя Прізвище (123)
      Вихідні: 14, 16, 18 листопада
    """
    try:
        response = (
            supabase.table("attendance")
            .select("id, employee_custom_id, work_date")
            .eq("status", "OFF")
            .is_("source", None)
            .execute()
        )

        new_day_offs = response.data
        if not new_day_offs:
            return

        print(f"Знайдено {len(new_day_offs)} нових записів про вихідні з сайту.")

        # Групуємо записи за працівником
        from collections import defaultdict

        by_employee: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for record in new_day_offs:
            by_employee[record["employee_custom_id"]].append(record)

        employee_ids = list(by_employee.keys())

        emp_response = (
            supabase.table("employees")
            .select("custom_id, name")
            .in_("custom_id", employee_ids)
            .execute()
        )
        employee_map = {emp["custom_id"]: emp["name"] for emp in emp_response.data}

        record_ids_to_mark: List[int] = []

        # Проходимо по кожному працівнику
        for emp_id, records in by_employee.items():
            try:
                emp_name = employee_map.get(emp_id, f"ID: {emp_id}")

                dates: List[date] = []
                for record in records:
                    try:
                        d = datetime.strptime(record["work_date"], "%Y-%m-%d").date()
                        dates.append(d)
                        record_ids_to_mark.append(record["id"])
                    except Exception as e_date:
                        print(f"Помилка парсингу дати для запису {record['id']}: {e_date}")

                if not dates:
                    continue

                dates_str = format_day_off_dates_list(dates)
                label = "Вихідні" if len(dates) > 1 else "Вихідний"

                message_text = (
                    f"ℹ️ <b>Новий вихідний (з сайту)</b>\n\n"
                    f"<b>{escape_html(emp_name)}</b> ({emp_id})\n"
                    f"{label}: <b>{dates_str}</b>"
                )

                await bot.send_message(
                    chat_id=SCHEDULE_SUPERGROUP_ID,
                    message_thread_id=SCHEDULE_TOPIC_ID,
                    text=message_text,
                    parse_mode="HTML",
                )

                await asyncio.sleep(0.5)

            except Exception as e_inner:
                print(f"Помилка надсилання сповіщення для працівника {emp_id}: {e_inner}")

        # Позначаємо всі використані записи як оброблені
        if record_ids_to_mark:
            supabase.table("attendance").update({"source": "web_notified"}).in_(
                "id", record_ids_to_mark
            ).execute()
            print(f"Позначено {len(record_ids_to_mark)} записів як 'web_notified'.")

    except Exception as e:
        print(f"Критична помилка у 'check_for_web_day_offs': {e}")


async def check_schedule_publications(bot: Bot):
    """
    Графік, надісланий з Календаря кнопкою «Зберегти й надіслати»:
    публікуємо в гілці графіка (як /schedule — нове повідомлення замість старого)
    і позначаємо, що надіслано.
    """
    try:
        rows = (
            supabase.table("schedule_publications")
            .select("work_date, published_at")
            .not_.is_("published_at", "null")
            .is_("sent_at", "null")
            .execute()
        ).data or []
        for row in rows:
            work_date = datetime.strptime(row["work_date"], "%Y-%m-%d").date()
            await send_new_and_replace_old(bot, work_date, SCHEDULE_SUPERGROUP_ID, SCHEDULE_TOPIC_ID)
            supabase.table("schedule_publications").update(
                {"sent_at": datetime.utcnow().isoformat() + "Z"}
            ).eq("work_date", row["work_date"]).execute()
            await asyncio.sleep(0.5)
    except Exception as e:
        print(f"Помилка публікації графіка з Календаря: {e!r}")


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    """
    Планувальник завдань.
    Графік публікується, коли його надсилають з Календаря (перевірка щохвилини);
    плюс перевірка вихідних із сайту.
    """
    scheduler = AsyncIOScheduler(timezone=pytz.timezone('Europe/Kyiv'))

    # Раніше: автооновлення розкладу (scheduled_task) - тепер не використовуємо
    # scheduler.add_job(scheduled_task, 'cron', minute='*/15', hour='20-23', args=[bot])

    # Графік, надісланий з Календаря
    scheduler.add_job(check_schedule_publications, 'interval', minutes=1, args=[bot])

    # Перевірка нових вихідних з сайту (кожні 5 хвилин)
    scheduler.add_job(check_for_web_day_offs, 'cron', minute='*/5', args=[bot])

    return scheduler


# --- РЕЄСТРАЦІЯ ---


def register_handlers_schedule(dp: Dispatcher):
    """Реєструє обробники для модуля розкладу."""
    dp.message.register(handle_schedule_command, Command("schedule"))
    dp.message.register(
        process_day_off_request,
        F.text.regexp(r'^\d+\s*\n\s*Вихідний\s*:\s*.*$', flags=re.I | re.M)
    )

    # Нові хендлери вихідних
    dp.message.register(handle_weekends_next_command, Command("weekends_next"))
    dp.message.register(handle_weekends_command, Command("weekends"))

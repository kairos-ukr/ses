import logging
import traceback
from datetime import date, timedelta, datetime
from typing import List, Dict, Optional

import pytz
from aiogram import Bot
from aiogram.enums import ParseMode
from supabase import Client, create_client

# --- Імпорт з конфігурації ---
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    ADMIN_ID,      # ID адміна для ескалації
    TZ,            # Часова зона, напр. 'Europe/Kyiv'
    TELEGRAM_SUPERGROUP_ID  # ID супергрупи з топіками, де лежать всі об'єкти
)

# --- Налаштування ---
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
log = logging.getLogger(__name__)
TIMEZONE = pytz.timezone(TZ)

# ----------------------------------------------------------------------------
# Форматування текстів (HTML, бо parse_mode = HTML)
# ----------------------------------------------------------------------------

def fmt_reminder_1(object_id: int) -> str:
    oid = f"{object_id:04d}"
    return (
        f"\u2728 <b>Нагадування про звіт (Об'єкт №{oid})</b>\n\n"
        f"Будь ласка, підготуйте і надішліть щоденний звіт.\n\n"
        f"<b>ВАЖЛИВО! Формат:</b>\n"
        f"1) Якщо це фотозвіт: надішліть фото з підписом <code>Фотозвіт {oid}</code>\n"
        f"2) Якщо це текстовий звіт: почніть повідомлення з <code>Звіт {oid}</code>"
    )

def fmt_reminder_2(object_id: int) -> str:
    oid = f"{object_id:04d}"
    return (
        f"\u26a0\ufe0f <b>Повторне нагадування (Об'єкт №{oid})</b>\n\n"
        f"Ми досі не отримали звіт за сьогодні. Просимо надіслати.\n\n"
        f"<b>Формат для фото:</b> <code>Фотозвіт {oid}</code>\n"
        f"<b>Формат для тексту:</b> <code>Звіт {oid}</code>"
    )

def fmt_admin_escalation(object_id: int, object_name: str) -> str:
    oid = f"{object_id:04d}"
    report_date = datetime.now(TIMEZONE).strftime('%Y-%m-%d')
    return (
        f"\u274c <b>ЗВІТ НЕ ПОДАНО</b>\n\n"
        f"Об'єкт: <b>{object_name} (№{oid})</b>\n"
        f"Дата: <b>{report_date}</b>\n\n"
        f"Було надіслано 2 нагадування (о 16:00 та 20:00). Статус оновлено на <code>not_submitted</code>."
    )

# ----------------------------------------------------------------------------
# Робота з БД (Supabase)
# ----------------------------------------------------------------------------

def _now_utc_iso() -> str:
    return datetime.now(pytz.utc).isoformat()


def db_create_daily_tasks_for(target_day: date) -> None:
    """Створює pending-завдання на вказаний день на основі installation_workers."""
    day_str = str(target_day)
    log.info(f"Створення daily_report_status на {day_str}")

    try:
        workers_resp = (
            supabase.table("installation_workers")
            .select("installation_custom_id")
            .eq("work_date", day_str)
            .execute()
        )

        if not workers_resp.data:
            log.info(f"На {day_str} робіт не заплановано.")
            return

        unique_ids = {
            w.get("installation_custom_id") for w in workers_resp.data if w.get("installation_custom_id")
        }
        if not unique_ids:
            log.warning("Є записи installation_workers без installation_custom_id.")
            return

        tasks_to_create = [
            {
                "installation_custom_id": uid,
                "report_date": day_str,
                "status": "pending",
                "created_at": _now_utc_iso(),
                "updated_at": _now_utc_iso(),
            }
            for uid in unique_ids
        ]

        # Потрібен унікальний індекс на (installation_custom_id, report_date)
        # див. SQL міграцію нижче.
        insert_resp = (
            supabase.table("daily_report_status")
            .upsert(
                tasks_to_create,
                on_conflict="installation_custom_id,report_date",
                ignore_duplicates=True,
            )
            .execute()
        )
        log.info(
            f"Готово: {len(tasks_to_create)} записів на {day_str}. Нових вставлено: {len(insert_resp.data)}"
        )

    except Exception as e:
        log.error(f"Помилка в db_create_daily_tasks_for({day_str}): {e}")
        log.error(traceback.format_exc())


def _fetch_installation_meta(installation_custom_id: int) -> Optional[Dict]:
    """Повертає {id, name} інсталяції за custom_id, або None."""
    try:
        inst = (
            supabase.table("installations")
            .select("id,name")
            .eq("custom_id", installation_custom_id)
            .single()
            .execute()
        )
        return inst.data if inst and inst.data else None
    except Exception as e:
        log.warning(f"Не вдалося знайти installation за custom_id={installation_custom_id}: {e}")
        return None


def _fetch_topic_thread_id(installation_id: int) -> Optional[int]:
    """Повертає thread_id топіка для об'єкта. Бере перший знайдений."""
    try:
        resp = (
            supabase.table("installation_messages")
            .select("thread_id")
            .eq("installation_id", installation_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0].get("thread_id")
        return None
    except Exception as e:
        log.warning(f"Не знайдено thread_id для installation_id={installation_id}: {e}")
        return None


def db_get_reports_for_status_today(status: str) -> List[Dict]:
    """
    Шукає сьогоднішні записи daily_report_status зі статусом `status` і повертає
    список словників: {report_id, installation_custom_id, installation_name, thread_id}
    """
    today_str = str(date.today())
    try:
        reports = (
            supabase.table("daily_report_status")
            .select("id,installation_custom_id")
            .eq("report_date", today_str)
            .eq("status", status)
            .execute()
        )
        result: List[Dict] = []
        for r in reports.data or []:
            icu = r["installation_custom_id"]
            inst = _fetch_installation_meta(icu)
            if not inst:
                log.warning(f"Звіт {r['id']}: installation_custom_id={icu} не знайдено в installations")
                continue
            thread_id = _fetch_topic_thread_id(inst["id"])  # topік у супергрупі
            if not thread_id:
                log.warning(f"Звіт {r['id']}: для installation_id={inst['id']} не знайдено thread_id")
                continue
            result.append(
                {
                    "report_id": r["id"],
                    "installation_custom_id": icu,
                    "installation_name": inst.get("name", "Без назви"),
                    "thread_id": thread_id,
                }
            )
        return result
    except Exception as e:
        log.error(f"Помилка в db_get_reports_for_status_today: {e}")
        log.error(traceback.format_exc())
        return []


def db_bulk_update_report_status(report_ids: List[int], new_status: str) -> None:
    if not report_ids:
        return
    try:
        (
            supabase.table("daily_report_status")
            .update({"status": new_status, "updated_at": _now_utc_iso()})
            .in_("id", report_ids)
            .execute()
        )
        log.info(f"Оновлено {len(report_ids)} записів на статус '{new_status}'")
    except Exception as e:
        log.error(f"Помилка в db_bulk_update_report_status: {e}")

# ----------------------------------------------------------------------------
# Надсилання повідомлень у Топіки Супергрупи
# ----------------------------------------------------------------------------

async def _send_to_topic(bot: Bot, thread_id: int, text: str) -> bool:
    """
    ВАЖЛИВО: у супергрупах з топіками потрібно вказувати:
    - chat_id = TELEGRAM_SUPERGROUP_ID (ID самої супергрупи)
    - message_thread_id = thread_id (ID конкретного топіка)

    Повертає True, якщо відправлено успішно; False у разі помилки.
    """
    try:
        await bot.send_message(
            chat_id=TELEGRAM_SUPERGROUP_ID,
            message_thread_id=thread_id,
            text=text,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return True
    except Exception as e:
        log.warning(f"Не вдалося надіслати в топік {thread_id}: {e}")
        return False

# ----------------------------------------------------------------------------
# Jobs: створення завдань, нагадування, ескалація
# ----------------------------------------------------------------------------

async def job_create_for_tomorrow() -> None:
    """Щодня о 23:30: створити pending на завтра."""
    target = date.today() + timedelta(days=1)
    db_create_daily_tasks_for(target)


async def job_create_for_today_backfill() -> None:
    """Резервний варіант: створити pending на СЬОГОДНІ з installation_workers.today.
    Зручно для старту/тесту, якщо ввечері ще не було job_create_for_tomorrow.
    """
    db_create_daily_tasks_for(date.today())


async def job_send_reminder_1(bot: Bot) -> None:
    """16:00: перше нагадування для всіх pending."""
    reports = db_get_reports_for_status_today("pending")
    sent_ids: List[int] = []
    for r in reports:
        success = await _send_to_topic(bot, r["thread_id"], fmt_reminder_1(r["installation_custom_id"]))
        if success:
            sent_ids.append(r["report_id"])
    if sent_ids:
        db_bulk_update_report_status(sent_ids, "reminder_1_sent")


async def job_send_reminder_2(bot: Bot) -> None:
    """20:00: друге нагадування для всіх, хто лишився на reminder_1_sent."""
    reports = db_get_reports_for_status_today("reminder_1_sent")
    sent_ids: List[int] = []
    for r in reports:
        success = await _send_to_topic(bot, r["thread_id"], fmt_reminder_2(r["installation_custom_id"]))
        if success:
            sent_ids.append(r["report_id"])
    if sent_ids:
        db_bulk_update_report_status(sent_ids, "reminder_2_sent")


async def job_escalate_missed(bot: Bot) -> None:
    """22:00: ескалація адміну для тих, хто лишився на reminder_2_sent."""
    reports = db_get_reports_for_status_today("reminder_2_sent")
    esc_ids: List[int] = []
    for r in reports:
        try:
            text = fmt_admin_escalation(r["installation_custom_id"], r["installation_name"])
            await bot.send_message(chat_id=ADMIN_ID, text=text, parse_mode=ParseMode.HTML)
            esc_ids.append(r["report_id"])
        except Exception as e:
            log.error(f"Помилка ескалації report_id={r['report_id']}: {e}")
    if esc_ids:
        db_bulk_update_report_status(esc_ids, "not_submitted")

# ----------------------------------------------------------------------------
# Реєстрація планувальника
# ----------------------------------------------------------------------------

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger


def _validate_config() -> None:
    try:
        _ = TELEGRAM_SUPERGROUP_ID
    except NameError:
        raise RuntimeError("TELEGRAM_SUPERGROUP_ID відсутній у config.py. Додай TELEGRAM_SUPERGROUP_ID = <int ID супергрупи>.")


def register_report_scheduler(bot: Bot, test_mode: bool = True) -> AsyncIOScheduler:
    """
    Ініціалізує AsyncIOScheduler з задачами. Якщо test_mode=True, запускає
    бліц-розклад на найближчі хвилини.
    """
    _validate_config()
    scheduler = AsyncIOScheduler(timezone=TIMEZONE)

    if test_mode:
        log.warning("!!! TEST MODE: нагадування запускаються в найближчі хвилини !!!")
        now = datetime.now(TIMEZONE)
        base_min = now.minute + 2

        scheduler.add_job(job_create_for_today_backfill,
                          trigger=CronTrigger(hour=now.hour, minute=(base_min % 60), timezone=TIMEZONE),
                          id="test_create_today")
        scheduler.add_job(job_send_reminder_1,
                          trigger=CronTrigger(hour=now.hour, minute=((base_min + 1) % 60), timezone=TIMEZONE),
                          args=[bot], id="test_r1")
        scheduler.add_job(job_send_reminder_2,
                          trigger=CronTrigger(hour=now.hour, minute=((base_min + 2) % 60), timezone=TIMEZONE),
                          args=[bot], id="test_r2")
        scheduler.add_job(job_escalate_missed,
                          trigger=CronTrigger(hour=now.hour, minute=((base_min + 3) % 60), timezone=TIMEZONE),
                          args=[bot], id="test_escalate")
    else:
        # Щодня о 23:30 створюємо завдання на завтра
        scheduler.add_job(job_create_for_tomorrow,
                          trigger=CronTrigger(hour=23, minute=30, timezone=TIMEZONE),
                          id="create_tomorrow")
        # На випадок запуску бота вдень: створюємо pending на сьогодні, якщо потрібно
        scheduler.add_job(job_create_for_today_backfill,
                          trigger=CronTrigger(hour=11, minute=0, timezone=TIMEZONE),
                          id="create_today_backfill")
        # Нагадування
        scheduler.add_job(job_send_reminder_1,
                          trigger=CronTrigger(hour=16, minute=0, timezone=TIMEZONE),
                          args=[bot], id="reminder_1")
        scheduler.add_job(job_send_reminder_2,
                          trigger=CronTrigger(hour=20, minute=0, timezone=TIMEZONE),
                          args=[bot], id="reminder_2")
        # Ескалація адміну
        scheduler.add_job(job_escalate_missed,
                          trigger=CronTrigger(hour=22, minute=0, timezone=TIMEZONE),
                          args=[bot], id="escalate")

    scheduler.start()
    log.info(f"Планувальник звітів запущено в {TZ}. test_mode={test_mode}")
    return scheduler

# ----------------------------------------------------------------------------
# SQL-міграції (запустіть 1 раз у БД)
# ----------------------------------------------------------------------------
MIGRATIONS_SQL = r"""
-- 1) Унікальна пара для upsert у daily_report_status
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_daily_report_status_installation_custom_id_report_date'
    ) THEN
        ALTER TABLE public.daily_report_status
        ADD CONSTRAINT uq_daily_report_status_installation_custom_id_report_date
        UNIQUE (installation_custom_id, report_date);
    END IF;
END $$;

-- 2) (Рекомендовано) Додати chat_id до installation_messages, щоб зберігати ID супергрупи
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='installation_messages' AND column_name='chat_id'
    ) THEN
        ALTER TABLE public.installation_messages ADD COLUMN chat_id bigint;
    END IF;
END $$;

-- 3) Індекси для швидких вибірок
CREATE INDEX IF NOT EXISTS idx_installation_workers_work_date ON public.installation_workers(work_date);
CREATE INDEX IF NOT EXISTS idx_drs_report_date_status ON public.daily_report_status(report_date, status);
CREATE INDEX IF NOT EXISTS idx_installation_messages_installation_id ON public.installation_messages(installation_id);
"""


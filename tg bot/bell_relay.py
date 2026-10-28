# bell_relay.py
"""
Дзвіночок CRM → особисто в Telegram.

Частину сповіщень створює сама база (тригери): графік на завтра,
призначення менеджером чи бригадиром об'єкта, гроші й проблеми зі звітів
бригад, вихідний у день графіка, пробні сповіщення тощо. Бот про них не
знає — тож щохвилини дивиться в app_notifications і пересилає людині
особисто все нове, чого він не надсилав сам.

Те, що бот уже надсилає власними розсилками (задачі, етапи, дедлайни,
платежі, нагадування — KIND_LABELS у notifier.py), тут лише позначається
як оброблене, щоб не прийшло двічі.

Позначка — app_notifications.telegram_sent_at. Журнал і захист від
повторів — bot_personal_messages (через notifier.send_personal).
Уночі (PERSONAL_DAY_* у config.py) звичайні сповіщення чекають ранку.
Графік — ні: його можуть скласти й надіслати будь-коли, і пізно ввечері
теж, а людина має зранку знати, куди їде. Тому графік іде одразу; після
QUIET_FROM і до QUIET_TO — без звуку (прийде тихо, побачать зранку).
"""
import html
import logging
import re
from datetime import datetime, timedelta, timezone

import pytz
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, SITE_URL, TZ, PERSONAL_DAY_START_HOUR, PERSONAL_DAY_END_HOUR
from notifier import KIND_LABELS, esc, report_error, send_personal

logger = logging.getLogger(__name__)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KYIV_TZ = pytz.timezone(TZ)
MODULE = "Дзвіночок → Telegram"

# Ці види бот надсилає сам — пересилати не треба
BOT_KINDS = set(KIND_LABELS)

# Ці йдуть і вночі: графік на завтра можуть надіслати хоч о 23:00
ANY_TIME_KINDS = {"schedule"}
# Тихий час: повідомлення приходить без звуку
QUIET_FROM, QUIET_TO = 22, 7

ICONS = {
    "schedule": "🗓",
    "object_assigned": "👷",
    "system": "🔔",
}


def is_daytime() -> bool:
    return PERSONAL_DAY_START_HOUR <= datetime.now(KYIV_TZ).hour < PERSONAL_DAY_END_HOUR


def is_quiet() -> bool:
    hour = datetime.now(KYIV_TZ).hour
    return hour >= QUIET_FROM or hour < QUIET_TO


def mark(ids: list) -> None:
    if not ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(ids), 100):
        supabase.table("app_notifications").update({"telegram_sent_at": now}).in_("id", ids[i:i + 100]).execute()


def message_text(row: dict) -> str:
    icon = ICONS.get(row.get("kind"), "🔔")
    lines = [f"{icon} <b>{esc(row.get('title') or 'K-Core')}</b>"]
    body = (row.get("body") or "").strip()
    if body:
        lines.append(esc(body[:3000]))
    link = row.get("link")
    if link:
        lines.append(f'<a href="{SITE_URL}{html.escape(link, quote=True)}">Відкрити в K-Core</a>')
    return "\n".join(lines)


async def relay_bells(bot: Bot):
    daytime = is_daytime()
    since = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    query = supabase.table("app_notifications") \
        .select("id, employee_id, kind, ref_key, title, body, link, created_at") \
        .is_("telegram_sent_at", "null") \
        .gte("created_at", since)
    # Уночі — лише графік; решта лишається в черзі до ранку
    if not daytime:
        query = query.in_("kind", list(ANY_TIME_KINDS))
    rows = query.order("created_at").limit(100).execute().data or []
    if not rows:
        return

    own = [r["id"] for r in rows if r.get("kind") in BOT_KINDS]
    mark(own)
    rows = [r for r in rows if r.get("kind") not in BOT_KINDS]
    if not rows:
        return
    quiet = is_quiet()

    ids = list({r["employee_id"] for r in rows if r.get("employee_id")})
    people = {}
    if ids:
        found = supabase.table("employees").select("id, custom_id, name, telegram_user_id, access_blocked_at") \
            .in_("id", ids).execute().data or []
        people = {p["id"]: p for p in found}

    for row in rows:
        person = people.get(row.get("employee_id"))
        if person and person.get("telegram_user_id") and not person.get("access_blocked_at"):
            await send_personal(
                bot, person["telegram_user_id"], message_text(row),
                kind=f"bell:{row.get('kind') or 'other'}", ref_key=str(row["id"]),
                employee=person, in_app=False, silent=quiet,
            )
        # Без Telegram — повідомлення лишається в дзвіночку CRM
        mark([row["id"]])


def _job(bot: Bot):
    async def run():
        try:
            await relay_bells(bot)
        except Exception as e:
            await report_error(bot, MODULE, "пересилання сповіщень дзвіночка", e)
    return run


def register_bell_relay(scheduler: AsyncIOScheduler, bot: Bot):
    scheduler.add_job(_job(bot), "interval", minutes=1, id="bell_relay",
                      max_instances=1, coalesce=True, replace_existing=True)
    logger.info("🔔 Дзвіночок CRM → особисто в Telegram: графік, призначення, звіти, вихідні.")

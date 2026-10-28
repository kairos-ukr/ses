# montazh_reports.py
"""
Денні звіти бригад із додатка «K-Core Монтаж» (/m на сайті).

1. Нагадування. О 15:30 — бригадиру (якщо в бригаді бригадира немає —
   усій бригаді), якщо сьогодні об'єкт у графіку, а звіт ще не надіслано.
   О 17:30 — повторно. Хто сьогодні на вихідному — не отримує.
   Іде в дзвіночок CRM і особисто в Telegram (у кого підключено).

2. Гілка об'єкта. Надісланий звіт — коротко в гілку об'єкта в групі:
   бригада, що зроблено, скільки кабелю пішло, плани й потреби на завтра.
   Суму грошей від клієнта сюди НЕ пишемо — гілку бачать монтажники;
   гроші бачить і підтверджує офіс у CRM. Фото в гілку вже кладе сервер
   завантаження, тут лише їх кількість. Доповнення від бригади (коментарі)
   — окремими короткими повідомленнями.
"""
import asyncio
import logging
from datetime import datetime

import pytz
from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramRetryAfter
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, TZ, SITE_URL, TELEGRAM_SUPERGROUP_ID
from notifier import esc, report_error, send_personal
from workflow_monitor import get_installation_topic

logger = logging.getLogger(__name__)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KYIV_TZ = pytz.timezone(TZ)
MODULE = "Звіти монтажу"

REMIND_1 = 15 * 60 + 30      # 15:30
REMIND_2 = 17 * 60 + 30      # 17:30
REMIND_END = 21 * 60         # після 21:00 не нагадуємо

OFF_STATUSES = ["OFF", "VACATION", "SICK_LEAVE"]
INSTALL_STAGES = {
    "inst_structure": "Конструкція",
    "inst_panels": "Панелі",
    "inst_cabling": "Траса DC",
    "inst_grounding": "Заземлення",
    "inst_inverter": "Інвертор",
}
DAY_STATUS = {
    "no_material": "бракує матеріалу",
    "weather": "погода",
    "client": "питання з клієнтом",
    "other": "інше",
}


def kyiv_now() -> datetime:
    return datetime.now(KYIV_TZ)


def fmt_qty(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "0"
    return f"{number:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def fmt_day(value) -> str:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%d.%m")
    except ValueError:
        return str(value)


def telegram_ids(emp_ids) -> dict:
    """employees.id → telegram_user_id. До вересневої міграції поля немає — тоді лише дзвіночок."""
    ids = [i for i in set(emp_ids) if i]
    if not ids:
        return {}
    try:
        rows = supabase.table("employees").select("id, telegram_user_id").in_("id", ids).execute().data or []
    except Exception:
        return {}
    return {r["id"]: r.get("telegram_user_id") for r in rows}


# =====================================================================
#  1 · НАГАДУВАННЯ О 15:30 І 17:30
# =====================================================================

async def send_report_reminders(bot: Bot):
    now = kyiv_now()
    minutes = now.hour * 60 + now.minute
    if minutes < REMIND_1 or minutes >= REMIND_END:
        return
    wave = 2 if minutes >= REMIND_2 else 1
    today = now.date().isoformat()

    rows = supabase.table("installation_workers").select("installation_custom_id, employee_custom_id") \
        .eq("work_date", today).not_.is_("installation_custom_id", "null").execute().data or []
    if not rows:
        return
    crews: dict = {}
    for r in rows:
        crews.setdefault(r["installation_custom_id"], set()).add(r["employee_custom_id"])

    reports = supabase.table("installer_reports").select("installation_custom_id, submitted_at") \
        .eq("work_date", today).in_("installation_custom_id", list(crews)).execute().data or []
    done = {r["installation_custom_id"] for r in reports if r.get("submitted_at")}

    offs = supabase.table("attendance").select("employee_custom_id") \
        .eq("work_date", today).in_("status", OFF_STATUSES).execute().data or []
    off_ids = {o["employee_custom_id"] for o in offs}

    everyone = {c for crew in crews.values() for c in crew}
    people = supabase.table("employees").select("id, custom_id, name, tier, access_blocked_at") \
        .in_("custom_id", list(everyone)).execute().data or []
    by_custom = {p["custom_id"]: p for p in people}
    tg = telegram_ids([p["id"] for p in people])
    insts = supabase.table("installations").select("custom_id, name") \
        .in_("custom_id", list(crews)).execute().data or []
    names = {i["custom_id"]: i.get("name") or "без назви" for i in insts}

    for obj, crew in crews.items():
        if obj in done:
            continue
        present = [by_custom[c] for c in crew if c in by_custom and c not in off_ids and not by_custom[c].get("access_blocked_at")]
        brigadiers = [p for p in present if p.get("tier") == 1]
        targets = brigadiers or present
        if not targets:
            continue
        head = "📋 <b>Час заповнити звіт</b>" if wave == 1 else "⏰ <b>Звіт за сьогодні ще не надіслано</b>"
        text = "\n".join([
            head,
            f"🏗 Обʼєкт: <b>{esc(names.get(obj, ''))}</b> #{obj}",
            "Пригадайте, що зроблено, що використано, що потрібно на завтра.",
            f'<a href="{SITE_URL}/m/report">Заповнити звіт</a>',
        ])
        for p in targets:
            await send_personal(
                bot, tg.get(p["id"]), text,
                kind="report_reminder", ref_key=f"{obj}:{today}:{wave}", employee=p,
            )


# =====================================================================
#  2 · ЗВІТ У ГІЛКУ ОБ'ЄКТА
# =====================================================================

async def _send_thread(bot: Bot, thread_id: int, text: str) -> None:
    await bot.send_message(
        chat_id=TELEGRAM_SUPERGROUP_ID, message_thread_id=thread_id, text=text,
        parse_mode=ParseMode.HTML, disable_web_page_preview=True,
    )


async def post_reports_to_threads(bot: Bot):
    reports = supabase.table("installer_reports").select("*") \
        .not_.is_("submitted_at", "null").eq("telegram_sent", False) \
        .order("submitted_at").limit(20).execute().data or []

    for r in reports:
        try:
            thread_id, _ = await get_installation_topic(r["installation_custom_id"])
            if thread_id:
                crew = r.get("crew") or []
                people = supabase.table("employees").select("custom_id, name") \
                    .in_("custom_id", crew).execute().data if crew else []
                usage = supabase.table("installer_report_usage").select("name, quantity, unit") \
                    .eq("report_id", r["id"]).execute().data or []
                needs = supabase.table("installer_report_needs").select("name, quantity, unit") \
                    .eq("report_id", r["id"]).order("id").execute().data or []

                lines = [f"🧾 <b>Звіт монтажу · {fmt_day(r['work_date'])}</b>"]
                if people:
                    lines.append("👷 " + esc(", ".join(p["name"] for p in people if p.get("name"))))
                done = [f"{INSTALL_STAGES.get(k, k)}{' ✓' if s == 'completed' else ' — в роботі'}"
                        for k, s in (r.get("done_stages") or {}).items() if s]
                if done:
                    lines.append("✅ " + esc(", ".join(done)))
                if r.get("day_status") and r["day_status"] != "ok":
                    lines.append("⚠️ " + esc(DAY_STATUS.get(r["day_status"], r["day_status"])))
                if r.get("comment"):
                    lines.append(f"\n{esc(r['comment'])}")
                if usage:
                    lines.append("\n🔌 <b>Кабель:</b> " + esc("; ".join(
                        f"{u['name']} — {fmt_qty(u['quantity'])}{(' ' + u['unit']) if u.get('unit') else ''}" for u in usage)))
                if r.get("plan_tomorrow"):
                    lines.append(f"➡️ <b>Завтра:</b> {esc(r['plan_tomorrow'])}")
                if needs or r.get("need_tomorrow"):
                    items = [f"{n['name']}" + (f" — {fmt_qty(n['quantity'])}{(' ' + n['unit']) if n.get('unit') else ''}" if n.get("quantity") is not None else "")
                             for n in needs]
                    if r.get("need_tomorrow"):
                        items.append(r["need_tomorrow"])
                    lines.append("🧰 <b>Потрібно на завтра:</b> " + esc("; ".join(items)))
                if r.get("photos"):
                    lines.append(f"📷 Фото: {len(r['photos'])}")
                await _send_thread(bot, thread_id, "\n".join(lines))
                await asyncio.sleep(1.0)
            supabase.table("installer_reports").update({"telegram_sent": True}).eq("id", r["id"]).execute()
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            return
        except Exception as e:
            await report_error(bot, MODULE, "надсилання звіту в гілку обʼєкта", e, {"Звіт": r.get("id")})
            supabase.table("installer_reports").update({"telegram_sent": True}).eq("id", r["id"]).execute()

    # Коментарі від бригади до вже надісланих звітів (фото гілка вже має)
    addons = supabase.table("installer_report_addons") \
        .select("id, text, author_id, report:installer_reports!inner(installation_custom_id, work_date, submitted_at)") \
        .eq("telegram_sent", False).not_.is_("report.submitted_at", "null").limit(30).execute().data or []
    for a in addons:
        try:
            rep = a.get("report") or {}
            if a.get("text"):
                thread_id, _ = await get_installation_topic(rep.get("installation_custom_id"))
                if thread_id:
                    who = supabase.table("employees").select("name").eq("id", a.get("author_id")).limit(1).execute().data
                    name = who[0]["name"] if who else "Бригада"
                    await _send_thread(bot, thread_id, f"💬 <b>{esc(name)}</b> до звіту за {fmt_day(rep.get('work_date'))}:\n{esc(a['text'])}")
                    await asyncio.sleep(1.0)
            supabase.table("installer_report_addons").update({"telegram_sent": True}).eq("id", a["id"]).execute()
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            return
        except Exception as e:
            await report_error(bot, MODULE, "надсилання доповнення до звіту", e, {"Доповнення": a.get("id")})
            supabase.table("installer_report_addons").update({"telegram_sent": True}).eq("id", a["id"]).execute()


# =====================================================================
#  РЕЄСТРАЦІЯ
# =====================================================================

def _job(action: str, func):
    async def run(bot: Bot):
        try:
            await func(bot)
        except Exception as e:
            await report_error(bot, MODULE, action, e)
    return run


def register_montazh_reports(scheduler: AsyncIOScheduler, bot: Bot):
    opts = dict(args=[bot], max_instances=1, coalesce=True, replace_existing=True)
    scheduler.add_job(_job("нагадування про звіт", send_report_reminders),
                      "interval", minutes=5, id="montazh_report_reminders", **opts)
    scheduler.add_job(_job("звіти в гілки обʼєктів", post_reports_to_threads),
                      "interval", minutes=1, id="montazh_reports_to_threads", **opts)
    logger.info("🧾 Звіти монтажу: нагадування 15:30 / 17:30, публікація в гілки.")

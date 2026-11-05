# montazh_reports.py
"""
Денні звіти бригад із додатка «K-Core Монтаж» (/m на сайті).

1. Нагадування. О 15:30 — бригадиру (якщо в бригаді бригадира немає —
   усій бригаді), якщо сьогодні об'єкт у графіку, а звіт ще не надіслано.
   О 17:30 — повторно. Хто сьогодні на вихідному — не отримує.
   Іде в дзвіночок CRM, пушем на телефон і особисто в Telegram (у кого
   підключено). Час, кому і чи нагадувати взагалі — «Доступи» →
   Налаштування (app_settings.report_reminders).
   Ввечері (типово 19:00) — зведення «звіту немає»: кожному менеджеру —
   його об'єкти, людям із налаштувань — увесь список.

2. Гілка об'єкта. Надісланий звіт — коротко в гілку об'єкта в групі:
   бригада, що зроблено, скільки кабелю пішло, плани й потреби на завтра.
   Суму грошей від клієнта сюди НЕ пишемо — гілку бачать монтажники;
   гроші бачить і підтверджує офіс у CRM. Фото в гілку вже кладе сервер
   завантаження, тут лише їх кількість. Доповнення від бригади (коментарі)
   — окремими короткими повідомленнями.

3. Що взяти з собою. О 7:00 (до 10:00) — тим, хто сьогодні на об'єкті:
   що за специфікаціями (ел. захист, обладнання, матеріали) ще не видано,
   з якого складу брати і чого на складі немає. Список рахує база
   (take_list_text) — той самий, що в «Монтажі» й у сповіщенні про графік.
   Перемикачі — «Доступи» → Налаштування: зранку так/ні, кому (усім або
   бригадиру). Хто на вихідному — не отримує.
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

REMIND_END = 21 * 60         # після 21:00 не нагадуємо
DIGEST_END = 22 * 60         # зведення — не пізніше 22:00
# Так само за замовчуванням і в базі (report_reminders_cfg), і в «Налаштуваннях»
REPORT_DEFAULT = {"crew": True, "first": "15:30", "second": "17:30", "to": "brigadier",
                  "manager": True, "digest": True, "digest_time": "19:00", "digest_to": []}

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


def report_settings() -> dict:
    """Перемикачі звітів (app_settings.report_reminders) поверх типових."""
    try:
        rows = supabase.table("app_settings").select("value").eq("key", "report_reminders") \
            .limit(1).execute().data or []
    except Exception:
        rows = []
    return {**REPORT_DEFAULT, **((rows[0].get("value") if rows else None) or {})}


def minutes_of(hhmm):
    """«17:30» → 1050; порожньо чи нісенітниця — None (нагадування вимкнене)."""
    try:
        h, m = str(hhmm).split(":")[:2]
        return int(h) * 60 + int(m)
    except (TypeError, ValueError):
        return None


def same_id(a, b) -> bool:
    try:
        return a is not None and b is not None and int(a) == int(b)
    except (TypeError, ValueError):
        return False


def brigadiers_of(present: list, fixed) -> list:
    """Кому нагадувати «як бригадиру». Бригадирів на об'єкті буває двоє (власник
    04.11): тоді — тому, хто закріплений за об'єктом (installations.brigadier_emp_id),
    якщо він сьогодні тут; інакше всім бригадирам бригади; немає бригадира — усім."""
    mine = [p for p in present if same_id(p.get("custom_id"), fixed)]
    if mine:
        return mine
    return [p for p in present if p.get("tier") == 1] or present


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
#  1 · НАГАДУВАННЯ (типово 15:30 і 17:30)
# =====================================================================

async def send_report_reminders(bot: Bot):
    cfg = report_settings()
    first, second = minutes_of(cfg.get("first")), minutes_of(cfg.get("second"))
    if not cfg.get("crew") or first is None:
        return
    now = kyiv_now()
    minutes = now.hour * 60 + now.minute
    if minutes < first or minutes >= REMIND_END:
        return
    wave = 2 if second is not None and second > first and minutes >= second else 1
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
    insts = supabase.table("installations").select("custom_id, name, brigadier_emp_id") \
        .in_("custom_id", list(crews)).execute().data or []
    names = {i["custom_id"]: i.get("name") or "без назви" for i in insts}
    fixed = {i["custom_id"]: i.get("brigadier_emp_id") for i in insts}

    for obj, crew in crews.items():
        if obj in done:
            continue
        present = [by_custom[c] for c in crew if c in by_custom and c not in off_ids and not by_custom[c].get("access_blocked_at")]
        targets = present if cfg.get("to") == "crew" else brigadiers_of(present, fixed.get(obj))
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
#  3 · ЩО ВЗЯТИ З СОБОЮ — ЗРАНКУ
# =====================================================================

TAKE_FROM = 7 * 60           # 07:00
TAKE_UNTIL = 10 * 60         # після 10:00 бригада вже в дорозі
TAKE_DEFAULT = {"schedule": True, "morning": True, "to": "crew"}   # так само, як у базі
TG_SAFE = 3800               # з запасом до ліміту Telegram 4096


def take_settings() -> dict:
    """Перемикачі «Взяти з собою» (app_settings.take_reminders) поверх типових."""
    try:
        rows = supabase.table("app_settings").select("value").eq("key", "take_reminders") \
            .limit(1).execute().data or []
    except Exception:
        rows = []
    return {**TAKE_DEFAULT, **((rows[0].get("value") if rows else None) or {})}


def fit(text: str, limit: int = TG_SAFE) -> str:
    """Довгий список обрізаємо по рядку — повний є в «Монтажі»."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit("\n", 1)[0]
    return cut + "\n…повний список — у «Монтажі»"


async def send_take_reminders(bot: Bot):
    cfg = take_settings()
    if not cfg.get("morning"):
        return
    now = kyiv_now()
    minutes = now.hour * 60 + now.minute
    if minutes < TAKE_FROM or minutes >= TAKE_UNTIL:
        return
    today = now.date().isoformat()

    rows = supabase.table("installation_workers").select("installation_custom_id, employee_custom_id") \
        .eq("work_date", today).not_.is_("installation_custom_id", "null").execute().data or []
    if not rows:
        return
    crews: dict = {}
    for r in rows:
        crews.setdefault(r["installation_custom_id"], set()).add(r["employee_custom_id"])

    # Лише об'єкти, де є що брати, чого бракує або що повернути на склад
    listed = supabase.table("v_object_take_list").select("installation_custom_id") \
        .in_("installation_custom_id", list(crews)).execute().data or []
    try:
        listed += supabase.table("v_object_spec_leftovers").select("installation_custom_id") \
            .in_("installation_custom_id", list(crews)).eq("in_work", True).gt("to_return", 0).execute().data or []
    except Exception:
        pass
    with_list = {r["installation_custom_id"] for r in listed}
    crews = {obj: crew for obj, crew in crews.items() if obj in with_list}
    if not crews:
        return

    offs = supabase.table("attendance").select("employee_custom_id") \
        .eq("work_date", today).in_("status", OFF_STATUSES).execute().data or []
    off_ids = {o["employee_custom_id"] for o in offs}

    everyone = {c for crew in crews.values() for c in crew}
    people = supabase.table("employees").select("id, custom_id, name, tier, access_blocked_at") \
        .in_("custom_id", list(everyone)).execute().data or []
    by_custom = {p["custom_id"]: p for p in people}
    tg = telegram_ids([p["id"] for p in people])
    insts = supabase.table("installations").select("custom_id, name, brigadier_emp_id") \
        .in_("custom_id", list(crews)).execute().data or []
    names = {i["custom_id"]: i.get("name") or "без назви" for i in insts}
    fixed = {i["custom_id"]: i.get("brigadier_emp_id") for i in insts}

    for obj, crew in crews.items():
        present = [by_custom[c] for c in crew if c in by_custom and c not in off_ids and not by_custom[c].get("access_blocked_at")]
        if cfg.get("to") == "brigadier":
            present = brigadiers_of(present, fixed.get(obj))
        if not present:
            continue
        listing = supabase.rpc("take_list_text", {"p_installation": obj, "p_limit": 10}).execute().data
        if not listing:
            continue
        text = fit("\n".join([
            "🧰 <b>Нагадування: що взяти сьогодні</b>",
            f"🏗 Обʼєкт: <b>{esc(names.get(obj, ''))}</b> #{obj}",
            "",
            esc(listing),
            f'<a href="{SITE_URL}/m">Відкрити «Монтаж»</a>',
        ]))
        for p in present:
            await send_personal(
                bot, tg.get(p["id"]), text,
                kind="take_reminder", ref_key=f"{obj}:{today}", employee=p,
            )


# =====================================================================
#  4 · ЗВЕДЕННЯ ВВЕЧЕРІ: ЗВІТУ НЕМАЄ
# =====================================================================

async def send_report_digest(bot: Bot):
    cfg = report_settings()
    at = minutes_of(cfg.get("digest_time"))
    if not cfg.get("digest") or at is None:
        return
    now = kyiv_now()
    minutes = now.hour * 60 + now.minute
    if minutes < at or minutes >= DIGEST_END:
        return
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
    missing = [obj for obj in crews if obj not in done]

    insts = supabase.table("installations").select("custom_id, name, responsible_emp_id, brigadier_emp_id") \
        .in_("custom_id", list(crews)).execute().data or []
    by_obj = {i["custom_id"]: i for i in insts}
    everyone = {c for crew in crews.values() for c in crew} | {i.get("responsible_emp_id") for i in insts if i.get("responsible_emp_id")}
    people = supabase.table("employees").select("id, custom_id, name, tier, access_blocked_at") \
        .in_("custom_id", [c for c in everyone if c]).execute().data or []
    by_custom = {p["custom_id"]: p for p in people}

    def line(obj):
        crew = [by_custom[c] for c in crews[obj] if c in by_custom]
        # Хто відповідає за звіт: закріплений за об'єктом бригадир, інакше бригадир бригади
        leads = brigadiers_of(crew, (by_obj.get(obj) or {}).get("brigadier_emp_id"))
        lead = leads[0] if leads else None
        who = f" — {esc(lead['name'])}" if lead else ""
        return f"• <b>{esc((by_obj.get(obj) or {}).get('name') or 'без назви')}</b> #{obj}{who}"

    # Менеджерам — лише їхні об'єкти без звіту
    per_manager: dict = {}
    for obj in missing:
        mgr = (by_obj.get(obj) or {}).get("responsible_emp_id")
        if mgr in by_custom and not by_custom[mgr].get("access_blocked_at"):
            per_manager.setdefault(mgr, []).append(obj)

    # Людям із налаштувань — усе зведення (і коли все здано)
    extra_ids = [i for i in (cfg.get("digest_to") or []) if i]
    extra = supabase.table("employees").select("id, custom_id, name, access_blocked_at") \
        .in_("id", extra_ids).execute().data if extra_ids else []
    extra = [p for p in extra or [] if not p.get("access_blocked_at")]

    tg = telegram_ids([by_custom[m]["id"] for m in per_manager] + [p["id"] for p in extra])

    for mgr, objs in per_manager.items():
        person = by_custom[mgr]
        if any(p["id"] == person["id"] for p in extra):
            continue   # отримає повне зведення нижче
        text = "\n".join([
            f"📋 <b>Звіти по ваших обʼєктах: немає {len(objs)}</b>",
            *[line(o) for o in objs],
            f'<a href="{SITE_URL}/today">Відкрити «Сьогодні»</a>',
        ])
        await send_personal(bot, tg.get(person["id"]), text, kind="report_digest",
                            ref_key=f"{today}:manager", employee=person)

    if extra:
        head = (f"📋 <b>Звіти за сьогодні: немає {len(missing)} з {len(crews)}</b>" if missing
                else f"✅ <b>Усі {len(crews)} звітів за сьогодні надіслано</b>")
        text = "\n".join([head, *[line(o) for o in missing], f'<a href="{SITE_URL}/admin?tab=reports">Звіти бригад</a>'])
        for person in extra:
            await send_personal(bot, tg.get(person["id"]), text, kind="report_digest",
                                ref_key=f"{today}:all", employee=person)


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
    scheduler.add_job(_job("нагадування «взяти з собою»", send_take_reminders),
                      "interval", minutes=5, id="montazh_take_reminders", **opts)
    scheduler.add_job(_job("вечірнє зведення звітів", send_report_digest),
                      "interval", minutes=5, id="montazh_report_digest", **opts)
    logger.info("🧾 Звіти монтажу: нагадування й вечірнє зведення (час — у налаштуваннях), публікація в гілки; о 7:00 — що взяти з собою.")

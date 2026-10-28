# personal_notifications.py
"""
Особисті повідомлення працівникам.

Група з гілками об'єктів лишається для всієї команди. Сюди — те, що
стосується конкретної людини:
  · задача, яку їй доручили, і дедлайн цієї задачі;
  · етап об'єкта, де її призначили відповідальною;
  · нагадування забезпечення (електрозахист), доручені їй;
  · низькі залишки — тим, кому це увімкнули в картці працівника;
  · платежі за графіком по її об'єктах: завтра/сьогодні термін, прострочено;
  · її об'єкт перевищив норму днів на етап (і щопонеділка — список таких).

Кожне повідомлення проходить через notifier.send_personal: воно
записується в bot_personal_messages і вдруге не піде.

Уночі людей не турбуємо: те, що назбиралось, піде зранку
(PERSONAL_DAY_START_HOUR … PERSONAL_DAY_END_HOUR у config.py).

Підключення людини: /start → «Поділитися номером» → бот знаходить
працівника за телефоном і сам записує employees.telegram_user_id.
Якщо не знайшов — пише адміну ID людини, щоб вказати його в картці.
"""
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

import pytz
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from supabase import create_client, Client

from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TZ,
    SITE_URL,
    PERSONAL_DAY_START_HOUR,
    PERSONAL_DAY_END_HOUR,
)
from notifier import esc, report_error, send_admin_text, send_personal, sent_ref_keys
from workflow_monitor import get_stage_text, get_status_text, is_system_comment

logger = logging.getLogger(__name__)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KYIV_TZ = pytz.timezone(TZ)

MODULE = "Особисті повідомлення"
TASK_ACTIVE = ["нове", "в процесі"]


# =====================================================================
#  ДОПОМІЖНЕ
# =====================================================================

def kyiv_now() -> datetime:
    return datetime.now(KYIV_TZ)


def is_daytime() -> bool:
    return PERSONAL_DAY_START_HOUR <= kyiv_now().hour < PERSONAL_DAY_END_HOUR


def fmt_qty(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "0"
    return f"{number:.3f}".rstrip("0").rstrip(".")


def fmt_date(value) -> str:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%d.%m.%Y")
    except ValueError:
        return str(value)


def site_link(path: str, label: str) -> str:
    return f'<a href="{SITE_URL}{path}">{esc(label)}</a>'


CURRENCY_SYMBOL = {"USD": "$", "UAH": "₴"}


def fmt_money(value, currency="USD") -> str:
    """12345.5 → «$12 345,50», як у CRM."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    whole = int(abs(number))
    cents = round((abs(number) - whole) * 100)
    if cents == 100:
        whole, cents = whole + 1, 0
    text = f"{whole:,}".replace(",", " ")
    if cents:
        text += f",{cents:02d}"
    sign = "-" if number < 0 else ""
    return f"{sign}{CURRENCY_SYMBOL.get(currency or 'USD', '$')}{text}"


def employees_by(field: str, values) -> dict:
    wanted = [v for v in set(values) if v is not None]
    if not wanted:
        return {}
    rows = supabase.table("employees") \
        .select("id, custom_id, name, email, phone, telegram_user_id") \
        .in_(field, wanted).execute().data or []
    return {r[field]: r for r in rows}


def installations_by(field: str, values) -> dict:
    wanted = [v for v in set(values) if v is not None]
    if not wanted:
        return {}
    rows = supabase.table("installations") \
        .select("id, custom_id, name") \
        .in_(field, wanted).execute().data or []
    return {r[field]: r for r in rows}


def object_line(inst: dict, custom_id=None) -> str:
    name = (inst or {}).get("name") or "без назви"
    number = (inst or {}).get("custom_id") or custom_id
    return f"🏗 Обʼєкт: <b>{esc(name)}</b> #{number}"


# =====================================================================
#  1 · ДОРУЧЕНІ ЗАДАЧІ
# =====================================================================

def task_message(task: dict, header: str, creator: dict, inst: dict) -> str:
    # Текст задачі з сайту може містити теги — у особистому лишаємо чистий текст
    body = re.sub(r"<[^>]+>", "", task.get("task_text") or "").strip()
    if len(body) > 1500:
        body = body[:1500] + "…"

    lines = [header, f"<b>#{task['custom_id']}</b> {esc(body)}"]
    if inst:
        lines.append(object_line(inst))
    if task.get("due_date"):
        lines.append(f"⏳ Дедлайн: {fmt_date(task['due_date'])}")
    if creator:
        lines.append(f"👤 Від: {esc(creator['name'])}")
    elif task.get("creator_email"):
        lines.append(f"👤 Від: {esc(task['creator_email'])}")
    lines.append(site_link("/tasks?tab=day", "Відкрити «Мій день»"))
    return "\n".join(lines)


async def send_task_assignments(bot: Bot):
    """Людині доручили задачу — нову або перепризначену на неї."""
    if not is_daytime():
        return

    # Лише свіжі: після першого запуску бот не має розсилати архів
    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    tasks = supabase.table("microtasks").select("*") \
        .in_("status", TASK_ACTIVE) \
        .not_.is_("assigned_to", "null") \
        .gte("updated_at", since) \
        .execute().data or []
    if not tasks:
        return

    refs = {t["custom_id"]: f"{t['custom_id']}:{t['assigned_to']}" for t in tasks}
    done = sent_ref_keys("task_assigned", refs.values())
    pending = [t for t in tasks if refs[t["custom_id"]] not in done]
    if not pending:
        return

    people = employees_by("custom_id", [t["assigned_to"] for t in pending])
    creators = employees_by("email", [t.get("creator_email") for t in pending])
    insts = installations_by("id", [t.get("installation_id") for t in pending])

    for task in pending:
        person = people.get(task["assigned_to"])
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue
        creator = creators.get(task.get("creator_email"))
        if creator and creator["id"] == person["id"]:
            continue  # доручив сам собі — повідомляти нема про що

        await send_personal(
            bot, person.get("telegram_user_id"),
            task_message(task, "📌 <b>Вам доручено задачу</b>", creator, insts.get(task.get("installation_id"))),
            kind="task_assigned", ref_key=refs[task["custom_id"]], employee=person,
        )


async def send_task_deadlines(bot: Bot):
    """Щоранку: завтра дедлайн, сьогодні дедлайн, прострочено (раз на 3 дні)."""
    today = kyiv_now().date()
    tasks = supabase.table("microtasks").select("*") \
        .in_("status", TASK_ACTIVE) \
        .not_.is_("assigned_to", "null") \
        .not_.is_("due_date", "null") \
        .execute().data or []

    due_now = []
    for task in tasks:
        try:
            due = datetime.strptime(task["due_date"][:10], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        diff = (due - today).days
        if diff == 1:
            header = "🔥 <b>Завтра дедлайн задачі</b>"
        elif diff == 0:
            header = "⏰ <b>Сьогодні дедлайн задачі</b>"
        elif diff < 0 and (-diff - 1) % 3 == 0:
            header = f"🚨 <b>Задача прострочена на {-diff} дн.</b>"
        else:
            continue
        due_now.append((task, header))

    if not due_now:
        return

    people = employees_by("custom_id", [t["assigned_to"] for t, _ in due_now])
    creators = employees_by("email", [t.get("creator_email") for t, _ in due_now])
    insts = installations_by("id", [t.get("installation_id") for t, _ in due_now])

    for task, header in due_now:
        person = people.get(task["assigned_to"])
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue
        await send_personal(
            bot, person.get("telegram_user_id"),
            task_message(task, header, creators.get(task.get("creator_email")), insts.get(task.get("installation_id"))),
            kind="task_deadline", ref_key=f"{task['custom_id']}:{today.isoformat()}", employee=person,
        )


# =====================================================================
#  2 · ПРИЗНАЧЕННЯ НА ЕТАП
# =====================================================================

# Типові налаштування огляду угод — для тих, хто не налаштовував сам
DEFAULT_REVIEW = {
    "enabled": True, "frequency": "weekly", "weekday": 1, "hour": 9,
    "stale_days": 14, "include_over_norm": True, "include_no_cost": False,
}


def deal_review_reasons(row: dict, s: dict) -> list:
    """Чому угоду варто переглянути — за налаштуваннями людини."""
    why = []
    idle, stage = row.get("idle_days") or 0, row.get("stage_days") or 0
    stale = idle > s["stale_days"]
    over = s["include_over_norm"] and row.get("norm_days") and stage > row["norm_days"]
    if stale and over and abs(stage - idle) <= 7:
        why.append(f"без руху {idle} дн (норма етапу {row['norm_days']})")
    else:
        if stale:
            why.append(f"без руху {idle} дн")
        if over:
            why.append(f"на етапі {stage} дн (норма {row['norm_days']})")
    if s["include_no_cost"] and not float(row.get("total_cost") or 0):
        why.append("без вартості")
    return why


async def send_deal_reviews(bot: Bot):
    """«Перегляньте свої угоди»: менеджеру — список його угод, які застоялись,
    у вибраний ним день і час (deal_review_settings), інакше — щопонеділка о 9:00."""
    now = kyiv_now()
    staff = supabase.table("employees").select("id, custom_id, role, access_blocked_at") \
        .in_("role", ["office", "super_admin"]).execute().data or []
    settings = {r["employee_id"]: r for r in (supabase.table("deal_review_settings").select("*").execute().data or [])}

    due = []
    for e in staff:
        if e.get("access_blocked_at") or e.get("custom_id") is None:
            continue
        s = {**DEFAULT_REVIEW, **settings.get(e["id"], {})}
        if not s["enabled"] or now.hour != int(s["hour"]):
            continue
        if s["frequency"] == "weekly" and now.isoweekday() != int(s["weekday"]):
            continue
        due.append((e, s))
    if not due:
        return

    rows = supabase.table("v_deal_review").select("*") \
        .in_("responsible_emp_id", [e["custom_id"] for e, _ in due]).execute().data or []
    people = employees_by("id", [e["id"] for e, _ in due])

    for e, s in due:
        person = people.get(e["id"])
        if not person:
            continue
        pick = []
        for r in rows:
            if r.get("responsible_emp_id") != e["custom_id"]:
                continue
            why = deal_review_reasons(r, s)
            if why:
                pick.append((r, why))
        if not pick:
            continue
        pick.sort(key=lambda x: -(x[0].get("idle_days") or 0))

        lines = [
            f"🗂 <b>Перегляньте свої угоди: {len(pick)}</b>",
            "Оновіть етап чи статус, додайте запис або позначте «Втрачено», якщо угода не відбудеться.",
        ]
        for r, why in pick[:15]:
            lines.append(f"• <b>{esc(r.get('name') or 'без назви')}</b> #{r['custom_id']} — {', '.join(why)}")
        if len(pick) > 15:
            lines.append(f"…і ще {len(pick) - 15}")
        lines.append(site_link("/installations?v=mine", "Відкрити мої угоди"))

        period = now.strftime("%Y-%m-%d") if s["frequency"] == "daily" else now.strftime("%G-W%V")
        await send_personal(
            bot, person.get("telegram_user_id"), "\n".join(lines),
            kind="deal_review", ref_key=f"{e['id']}:{period}", employee=person,
        )


async def send_personal_reminders(bot: Bot):
    """Особисті нагадування з планера «Мій день»: у вибраний час —
    автору і тим, з ким він поділився. Особисте, тож у групу не йде."""
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = supabase.table("personal_reminders").select("*") \
        .is_("done_at", "null").is_("reminded_at", "null") \
        .not_.is_("remind_at", "null").lte("remind_at", now_iso) \
        .limit(100).execute().data or []
    if not rows:
        return

    people = employees_by("id", [pid for r in rows for pid in [r["owner_id"], *(r.get("shared_with") or [])]])
    insts = installations_by("custom_id", [r.get("installation_custom_id") for r in rows])

    for r in rows:
        owner = people.get(r["owner_id"])
        lines = [f"⏰ <b>Нагадування:</b> {esc(r['text'])}"]
        if r.get("note"):
            lines.append(esc(r["note"]))
        inst = insts.get(r.get("installation_custom_id"))
        if inst:
            lines.append(object_line(inst))
        lines.append(site_link("/tasks?tab=day", "Відкрити «Мій день»"))
        for pid in [r["owner_id"], *(r.get("shared_with") or [])]:
            person = people.get(pid)
            if not person:
                continue
            text = list(lines)
            if pid != r["owner_id"] and owner:
                text.insert(1, f"Поділився: {esc(owner['name'])}")
            await send_personal(
                bot, person.get("telegram_user_id"), "\n".join(text),
                kind="personal_reminder", ref_key=f"{r['id']}:{r['remind_at']}", employee=person,
            )
        supabase.table("personal_reminders").update({"reminded_at": now_iso}).eq("id", r["id"]).execute()


async def send_stage_assignments(bot: Bot):
    """Людину призначили відповідальною за етап об'єкта."""
    if not is_daytime():
        return

    since = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    events = supabase.table("workflow_events").select("*") \
        .not_.is_("new_responsible", "null") \
        .gte("created_at", since) \
        .order("created_at") \
        .execute().data or []
    events = [e for e in events if e.get("new_responsible") != e.get("old_responsible")]
    if not events:
        return

    done = sent_ref_keys("stage_assigned", [str(e["id"]) for e in events])
    events = [e for e in events if str(e["id"]) not in done]
    if not events:
        return

    people = employees_by("custom_id", [e["new_responsible"] for e in events])
    insts = installations_by("custom_id", [e["installation_custom_id"] for e in events])

    for event in events:
        person = people.get(event["new_responsible"])
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue
        if (event.get("actor") or "").strip() == (person.get("name") or "").strip():
            continue  # призначив сам себе

        lines = [
            "👷 <b>Вас призначено відповідальним</b>",
            f"<b>{esc(get_stage_text(event['stage_key']))}</b>",
            object_line(insts.get(event["installation_custom_id"]), event["installation_custom_id"]),
        ]
        if event.get("new_status") and event["new_status"] != "active":
            lines.append(f"Статус: {esc(get_status_text(event['new_status']))}")
        comment = (event.get("comment") or "").strip()
        if comment and not is_system_comment(comment):
            lines.append(f"💬 {esc(comment[:800])}")
        if event.get("actor"):
            lines.append(f"👤 Призначив: {esc(event['actor'])}")
        lines.append(site_link(f"/project/{event['installation_custom_id']}", "Відкрити обʼєкт"))

        await send_personal(
            bot, person.get("telegram_user_id"), "\n".join(lines),
            kind="stage_assigned", ref_key=str(event["id"]), employee=person,
        )


# =====================================================================
#  3 · НАГАДУВАННЯ ЗАБЕЗПЕЧЕННЯ
# =====================================================================

async def send_supply_alerts(bot: Bot):
    """
    Черга v_supply_alert_outbox сама вирішує, кому й коли: перше
    повідомлення, щоденний повтор, прострочене. Бот лише надсилає
    й позначає надіслане.
    """
    if not is_daytime():
        return

    rows = supabase.table("v_supply_alert_outbox").select("*").execute().data or []
    today = kyiv_now().date().isoformat()

    for row in rows:
        overdue = row.get("reason") == "overdue"
        lines = [
            ("🚨 <b>Прострочено:</b> " if overdue else "🛡 ") + f"<b>{esc(row['title'])}</b>",
            object_line({"name": row.get("installation_name"), "custom_id": row["installation_custom_id"]}),
        ]
        if row.get("client_name"):
            lines.append(f"👤 Клієнт: {esc(row['client_name'])}")
        if row.get("summary"):
            lines.append(f"📝 {esc(row['summary'])}")
        if row.get("due_date"):
            lines.append(f"⏳ Термін: {fmt_date(row['due_date'])}" + (" — минув" if overdue else ""))
        lines.append(site_link(f"/provisioning?obj={row['installation_custom_id']}", "Відкрити в забезпеченні"))

        message_id = await send_personal(
            bot, row["telegram_chat_id"], "\n".join(lines),
            kind="supply_alert", ref_key=f"{row['alert_id']}:{today}",
            employee={"id": row.get("employee_id"), "name": row.get("employee_name")},
        )
        if message_id:
            supabase.rpc("supply_alert_mark_sent", {
                "p_alert_id": row["alert_id"],
                "p_chat_id": row["telegram_chat_id"],
                "p_message_id": message_id,
                "p_reason": row.get("reason") or "reminder",
            }).execute()


# =====================================================================
#  4 · НИЗЬКІ ЗАЛИШКИ
# =====================================================================

def low_stock_recipients() -> list:
    rows = supabase.table("notification_subscriptions") \
        .select("employee:employees(id, name, telegram_user_id)") \
        .eq("topic", "low_stock").execute().data or []
    return [r["employee"] for r in rows if (r.get("employee") or {}).get("telegram_user_id")]


def low_stock_lines(rows: list, limit: int = 25) -> list:
    lines = []
    for row in rows[:limit]:
        unit = esc(row.get("unit_name") or "шт")
        line = f"• <b>{esc(row['name'])}</b>"
        if row.get("sku"):
            line += f" <code>{esc(row['sku'])}</code>"
        line += f"\n   вільно {fmt_qty(row['available'])} із мін. {fmt_qty(row['min_stock'])} {unit}"
        if float(row.get("incoming") or 0) > 0:
            line += f" · їде {fmt_qty(row['incoming'])}"
        if float(row.get("to_order") or 0) > 0:
            line += f" · дозамовити <b>{fmt_qty(row['to_order'])}</b>"
        lines.append(line)
    if len(rows) > limit:
        lines.append(f"…і ще {len(rows) - limit}")
    return lines


async def check_low_stock(bot: Bot):
    """Пишемо, коли позиція опустилась нижче мінімуму, а не поки вона там лежить."""
    rows = supabase.table("v_stock_below_min").select("*").execute().data or []
    below = {r["nomenclature_id"]: r for r in rows}

    state_rows = supabase.table("stock_min_notified").select("nomenclature_id").execute().data or []
    known = {r["nomenclature_id"] for r in state_rows}

    # Відновились — прибираємо: наступне падіння знову буде новиною
    recovered = [nid for nid in known if nid not in below]
    if recovered:
        supabase.table("stock_min_notified").delete().in_("nomenclature_id", recovered).execute()

    fresh = [row for nid, row in below.items() if nid not in known]
    if not fresh or not is_daytime():
        return  # уночі не позначаємо — вранці це ще буде новиною

    fresh.sort(key=lambda r: float(r.get("to_order") or 0), reverse=True)
    recipients = low_stock_recipients()

    if recipients:
        ids = ",".join(str(r["nomenclature_id"]) for r in sorted(fresh, key=lambda r: r["nomenclature_id"]))
        ref = f"fresh:{kyiv_now().date().isoformat()}:{hashlib.sha1(ids.encode()).hexdigest()[:16]}"
        text = "\n".join([
            f"📉 <b>Опустилось нижче мінімуму: {len(fresh)}</b>",
            *low_stock_lines(fresh),
            site_link("/inventory", "Відкрити склад"),
        ])
        for person in recipients:
            await send_personal(bot, person["telegram_user_id"], text,
                                kind="low_stock", ref_key=ref, employee=person)

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("stock_min_notified").upsert([
        {"nomenclature_id": r["nomenclature_id"], "below_since": now,
         "last_notified_at": now if recipients else None}
        for r in fresh
    ]).execute()


async def send_low_stock_digest(bot: Bot):
    """Щоранку — усе, що зараз нижче мінімуму, одним списком."""
    rows = supabase.table("v_stock_below_min").select("*") \
        .order("to_order", desc=True).execute().data or []
    if not rows:
        return
    recipients = low_stock_recipients()
    if not recipients:
        return

    text = "\n".join([
        f"📋 <b>Нижче мінімуму зараз: {len(rows)}</b>",
        *low_stock_lines(rows, limit=30),
        site_link("/inventory", "Відкрити склад"),
    ])
    ref = f"digest:{kyiv_now().date().isoformat()}"
    for person in recipients:
        await send_personal(bot, person["telegram_user_id"], text,
                            kind="low_stock", ref_key=ref, employee=person)


# =====================================================================
#  4а · ПЛАТЕЖІ ЗА ГРАФІКОМ
# =====================================================================

async def send_payment_reminders(bot: Bot):
    """
    Щоранку — відповідальному за об'єкт: завтра термін платежу, сьогодні
    термін, прострочено (першого дня і далі раз на 3 дні). Що сплачено,
    а що ні, рахує база з внесених платежів (v_payment_schedule).
    """
    today = kyiv_now().date()
    try:
        rows = supabase.table("v_payment_schedule") \
            .select("id, installation_custom_id, title, amount, paid_part, remaining, due_date, currency") \
            .neq("status", "paid") \
            .not_.is_("due_date", "null") \
            .lte("due_date", (today + timedelta(days=1)).isoformat()) \
            .execute().data or []
    except Exception:
        return  # графіка платежів ще немає в базі — нагадувати нема про що

    due_now = []
    for row in rows:
        try:
            due = datetime.strptime(row["due_date"][:10], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        diff = (due - today).days
        if diff == 1:
            header = "💳 <b>Завтра термін платежу</b>"
        elif diff == 0:
            header = "💳 <b>Сьогодні термін платежу</b>"
        elif diff < 0 and (-diff - 1) % 3 == 0:
            header = f"🚨 <b>Платіж прострочено на {-diff} дн.</b>"
        else:
            continue
        due_now.append((row, header))

    if not due_now:
        return

    ids = list({row["installation_custom_id"] for row, _ in due_now})
    insts = supabase.table("installations") \
        .select("custom_id, name, status, responsible_emp_id, client:clients(name, phone)") \
        .in_("custom_id", ids).execute().data or []
    insts = {i["custom_id"]: i for i in insts}
    people = employees_by("custom_id", [i.get("responsible_emp_id") for i in insts.values()])

    for row, header in due_now:
        inst = insts.get(row["installation_custom_id"])
        if not inst or inst.get("status") in ("lost", "cancelled"):
            continue
        person = people.get(inst.get("responsible_emp_id"))
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue

        amount = fmt_money(row["remaining"], row.get("currency"))
        if float(row.get("paid_part") or 0) > 0:
            amount += f" (лишилось з {fmt_money(row['amount'], row.get('currency'))})"
        lines = [
            header,
            f"<b>{esc(row['title'])}</b>: {amount}",
            object_line(inst),
        ]
        client = inst.get("client") or {}
        if client.get("name"):
            phone = f" · {esc(client['phone'])}" if client.get("phone") else ""
            lines.append(f"👤 Клієнт: {esc(client['name'])}{phone}")
        lines.append(f"⏳ Термін: {fmt_date(row['due_date'])}")
        lines.append(site_link(f"/project/{row['installation_custom_id']}", "Відкрити обʼєкт"))

        await send_personal(
            bot, person.get("telegram_user_id"), "\n".join(lines),
            kind="payment_due", ref_key=f"{row['id']}:{today.isoformat()}", employee=person,
        )


# =====================================================================
#  4б · НОРМА ДНІВ НА ЕТАП
# =====================================================================

def stage_overdue_rows() -> list:
    """Активні обʼєкти, що стоять на етапі довше за норму (v_stage_overdue)."""
    try:
        return supabase.table("v_stage_overdue") \
            .select("installation_custom_id, name, workflow_stage, responsible_emp_id, stage_entered_at, stage_days, norm_days, over_days") \
            .execute().data or []
    except Exception:
        return []  # норм ще немає в базі


async def send_stage_norm_alerts(bot: Bot):
    """
    Щойно обʼєкт перевищив норму етапу — одне повідомлення відповідальному.
    Ключ — обʼєкт + етап + коли на нього перейшли, тож за один захід на
    етап людина отримає це лише раз (навіть якщо бот кілька днів не працював).
    """
    rows = [r for r in stage_overdue_rows() if 1 <= int(r.get("over_days") or 0) <= 3]
    if not rows:
        return
    people = employees_by("custom_id", [r.get("responsible_emp_id") for r in rows])

    for row in rows:
        person = people.get(row.get("responsible_emp_id"))
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue
        lines = [
            "⏱ <b>Етап триває довше норми</b>",
            f"<b>{esc(get_stage_text(row['workflow_stage']))}</b>: {row['stage_days']} дн при нормі {row['norm_days']}",
            object_line(row, row["installation_custom_id"]),
            site_link(f"/project/{row['installation_custom_id']}", "Відкрити обʼєкт"),
        ]
        entered = str(row.get("stage_entered_at") or "")[:10]
        await send_personal(
            bot, person.get("telegram_user_id"), "\n".join(lines),
            kind="stage_norm", ref_key=f"{row['installation_custom_id']}:{row['workflow_stage']}:{entered}",
            employee=person,
        )


async def send_stage_norm_digest(bot: Bot):
    """Щопонеділка — кожному відповідальному список його обʼєктів, що стоять довше норми."""
    rows = stage_overdue_rows()
    if not rows:
        return
    by_person = {}
    for row in rows:
        by_person.setdefault(row.get("responsible_emp_id"), []).append(row)
    people = employees_by("custom_id", list(by_person.keys()))
    week = kyiv_now().strftime("%G-W%V")

    for emp_id, items in by_person.items():
        person = people.get(emp_id)
        if not person:  # без Telegram — лише в дзвіночок CRM
            continue
        items.sort(key=lambda r: int(r.get("over_days") or 0), reverse=True)
        lines = [f"⏱ <b>Довше норми стоять {len(items)} ваших обʼєктів</b>"]
        for row in items[:15]:
            label = esc(get_stage_text(row["workflow_stage"]))
            name = esc(row.get("name") or "без назви")
            lines.append(f"• <b>{name}</b> #{row['installation_custom_id']} — {label}: "
                         f"{row['stage_days']} дн (норма {row['norm_days']})")
        if len(items) > 15:
            lines.append(f"…і ще {len(items) - 15}")
        lines.append(site_link("/installations", "Відкрити воронку"))
        await send_personal(
            bot, person.get("telegram_user_id"), "\n".join(lines),
            kind="stage_norm_digest", ref_key=f"{emp_id}:{week}", employee=person,
        )


# =====================================================================
#  5 · ПІДКЛЮЧЕННЯ ЛЮДИНИ ДО БОТА
# =====================================================================

WHAT_YOU_GET = (
    "Сюди приходитимуть:\n"
    "• задачі, які вам доручили, і їхні дедлайни\n"
    "• етапи обʼєктів, де вас призначили відповідальним\n"
    "• нагадування забезпечення (електрозахист)\n"
    "• платежі клієнтів по ваших обʼєктах: термін і прострочка\n"
    "• коли ваш обʼєкт стоїть на етапі довше норми\n"
    "• низькі залишки — якщо це увімкнули у вашій картці\n\n"
    "/my — мої задачі й нагадування зараз"
)

CONTACT_KEYBOARD = types.ReplyKeyboardMarkup(
    keyboard=[[types.KeyboardButton(text="📱 Поділитися номером", request_contact=True)]],
    resize_keyboard=True,
    one_time_keyboard=True,
)


def normalize_phone(value) -> str:
    """Останні 9 цифр: +380 67 123 45 67, 0671234567 і 380671234567 — одне й те саме."""
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-9:] if len(digits) >= 9 else digits


def user_label(user: types.User) -> str:
    label = user.full_name or "без імені"
    if user.username:
        label += f" (@{user.username})"
    return label


def employee_by_telegram(user_id: int):
    rows = supabase.table("employees") \
        .select("id, custom_id, name, telegram_user_id") \
        .eq("telegram_user_id", user_id).limit(1).execute().data
    return rows[0] if rows else None


async def cmd_start(message: types.Message, bot: Bot):
    try:
        person = employee_by_telegram(message.from_user.id)
    except Exception as e:
        await report_error(bot, MODULE, "перевірка підключення працівника (/start)", e,
                           {"Telegram": user_label(message.from_user)})
        await message.answer("Не вдалося перевірити підключення — адміністратора вже повідомлено.")
        return

    if person:
        await message.answer(
            f"Вітаю, <b>{esc(person['name'])}</b>! Ви вже підключені.\n\n{WHAT_YOU_GET}",
            reply_markup=types.ReplyKeyboardRemove(),
        )
        return

    await message.answer(
        "Щоб отримувати особисті повідомлення, натисніть кнопку нижче — "
        "я знайду вас серед працівників за номером телефону.\n\n"
        f"Ваш Telegram ID: <code>{message.from_user.id}</code>",
        reply_markup=CONTACT_KEYBOARD,
    )


async def on_contact(message: types.Message, bot: Bot):
    user = message.from_user
    contact = message.contact

    if contact.user_id and contact.user_id != user.id:
        await message.answer(
            "Це чужий контакт. Натисніть «📱 Поділитися номером» — кнопка надсилає саме ваш номер.",
            reply_markup=CONTACT_KEYBOARD,
        )
        return

    raw_phone = re.sub(r"\D", "", contact.phone_number or "")
    who = f"{user_label(user)}, тел. +{raw_phone}, Telegram ID {user.id}"
    phone = normalize_phone(raw_phone)

    try:
        staff = supabase.table("employees").select("id, name, phone, telegram_user_id").execute().data or []
    except Exception as e:
        await report_error(bot, MODULE, "пошук працівника за номером телефону", e, {"Хто": who})
        await message.answer("Не вдалося перевірити номер — адміністратора повідомлено.",
                             reply_markup=types.ReplyKeyboardRemove())
        return

    matches = [p for p in staff if phone and normalize_phone(p.get("phone")) == phone]
    taken_by = next((p for p in staff if p.get("telegram_user_id") and int(p["telegram_user_id"]) == user.id), None)

    if len(matches) != 1:
        reason = ("немає працівника з таким номером" if not matches
                  else f"цей номер у {len(matches)} працівників: " + ", ".join(p["name"] for p in matches))
        await message.answer(
            "Не вдалося автоматично знайти вас серед працівників. "
            "Адміністратора повідомлено — він підключить вас вручну.",
            reply_markup=types.ReplyKeyboardRemove(),
        )
        await send_admin_text(bot, "\n".join([
            "🔗 <b>Не вдалося підключити людину до бота</b>",
            f"<b>Хто:</b> {esc(who)}",
            f"<b>Причина:</b> {esc(reason)}",
            f"Вкажіть у картці потрібного працівника Telegram ID: <code>{user.id}</code>",
        ]))
        return

    person = matches[0]
    if taken_by and taken_by["id"] != person["id"]:
        await message.answer("Цей Telegram уже підключено до іншого працівника. Адміністратора повідомлено.",
                             reply_markup=types.ReplyKeyboardRemove())
        await send_admin_text(bot, "\n".join([
            "🔗 <b>Конфлікт підключення до бота</b>",
            f"<b>Хто:</b> {esc(who)}",
            f"Номер належить: <b>{esc(person['name'])}</b>, а цей Telegram уже вказано в картці: <b>{esc(taken_by['name'])}</b>.",
        ]))
        return

    if person.get("telegram_user_id") and int(person["telegram_user_id"]) != user.id:
        await message.answer("До вашої картки вже підключено інший Telegram. Адміністратора повідомлено.",
                             reply_markup=types.ReplyKeyboardRemove())
        await send_admin_text(bot, "\n".join([
            "🔗 <b>Конфлікт підключення до бота</b>",
            f"<b>Хто:</b> {esc(who)}",
            f"У картці <b>{esc(person['name'])}</b> уже вказано інший Telegram ID: "
            f"<code>{person['telegram_user_id']}</code>. Якщо людина змінила акаунт — "
            f"замініть ID у картці на <code>{user.id}</code>.",
        ]))
        return

    try:
        supabase.table("employees").update({"telegram_user_id": user.id}).eq("id", person["id"]).execute()
    except Exception as e:
        await report_error(bot, MODULE, "прив'язка Telegram до картки працівника", e,
                           {"Працівник": person["name"], "Хто": who})
        await message.answer("Не вдалося підключити — адміністратора повідомлено.",
                             reply_markup=types.ReplyKeyboardRemove())
        return

    await message.answer(
        f"Готово, <b>{esc(person['name'])}</b>! Ви підключені.\n\n{WHAT_YOU_GET}",
        reply_markup=types.ReplyKeyboardRemove(),
    )
    await send_admin_text(bot, f"✅ <b>{esc(person['name'])}</b> підключився до бота ({esc(who)}).")


async def cmd_my(message: types.Message, bot: Bot):
    """Мої активні задачі й нагадування — щоб не шукати по групі."""
    try:
        person = employee_by_telegram(message.from_user.id)
        if not person:
            await message.answer("Ви ще не підключені. Натисніть /start.")
            return

        tasks = supabase.table("microtasks").select("custom_id, task_text, due_date") \
            .in_("status", TASK_ACTIVE).eq("assigned_to", person["custom_id"]) \
            .order("due_date").execute().data or []

        try:
            alerts = supabase.table("v_supply_alerts") \
                .select("kind, installation_custom_id, installation_name, due_date, is_overdue") \
                .eq("assigned_to", person["id"]).execute().data or []
        except Exception:
            alerts = []  # до міграції нагадувань — просто без них

        lines = [f"<b>{esc(person['name'])}</b>"]
        if tasks:
            lines.append(f"\n📌 <b>Задачі: {len(tasks)}</b>")
            for t in tasks[:20]:
                text = re.sub(r"<[^>]+>", "", t.get("task_text") or "").replace("\n", " ").strip()
                short = text[:80] + ("…" if len(text) > 80 else "")
                due = f" · до {fmt_date(t['due_date'])}" if t.get("due_date") else ""
                lines.append(f"• <b>#{t['custom_id']}</b>{due}\n   {esc(short)}")
        else:
            lines.append("\n📌 Активних задач немає.")

        if alerts:
            titles = {"protection_spec": "Скласти специфікацію захисту", "protection_supply": "Забезпечити захист"}
            lines.append(f"\n🛡 <b>Нагадування: {len(alerts)}</b>")
            for a in alerts[:20]:
                mark = "🚨 " if a.get("is_overdue") else ""
                due = f" · до {fmt_date(a['due_date'])}" if a.get("due_date") else ""
                lines.append(f"• {mark}{esc(titles.get(a['kind'], a['kind']))} — "
                             f"{esc(a.get('installation_name') or 'без назви')} #{a['installation_custom_id']}{due}")

        await message.answer("\n".join(lines), disable_web_page_preview=True)
    except Exception as e:
        await report_error(bot, MODULE, "команда /my — список задач і нагадувань", e,
                           {"Telegram": user_label(message.from_user)})
        await message.answer("Не вдалося зібрати список — адміністратора повідомлено.")


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


def register_personal_notifications(dp: Dispatcher, bot: Bot, scheduler: AsyncIOScheduler):
    dp.message.register(cmd_start, CommandStart(), F.chat.type == "private")
    dp.message.register(cmd_my, Command("my"), F.chat.type == "private")
    dp.message.register(on_contact, F.contact, F.chat.type == "private")

    # max_instances=1: повільний прохід не накладається на наступний
    opts = dict(args=[bot], max_instances=1, coalesce=True, replace_existing=True)
    scheduler.add_job(_job("розсилка задач, доручених людям", send_task_assignments),
                      "interval", minutes=1, id="personal_task_assignments", **opts)
    scheduler.add_job(_job("нагадування переглянути угоди", send_deal_reviews),
                      "interval", minutes=10, id="personal_deal_reviews", **opts)
    scheduler.add_job(_job("особисті нагадування з планера", send_personal_reminders),
                      "interval", minutes=1, id="personal_reminders", **opts)
    scheduler.add_job(_job("розсилка призначень на етапи", send_stage_assignments),
                      "interval", minutes=1, id="personal_stage_assignments", **opts)
    scheduler.add_job(_job("розсилка нагадувань забезпечення", send_supply_alerts),
                      "interval", minutes=5, id="personal_supply_alerts", **opts)
    scheduler.add_job(_job("перевірка низьких залишків", check_low_stock),
                      "interval", minutes=30, id="personal_low_stock", **opts)
    scheduler.add_job(_job("ранкове зведення низьких залишків", send_low_stock_digest),
                      "cron", hour=9, minute=0, id="personal_low_stock_digest", **opts)
    scheduler.add_job(_job("нагадування про дедлайни задач", send_task_deadlines),
                      "cron", hour=8, minute=10, id="personal_task_deadlines", **opts)
    # Графік платежів прибрали (21.10.2026) — нагадувань за ним теж немає.
    # Якщо job уже був у планувальнику, прибираємо його.
    try:
        scheduler.remove_job("personal_payment_reminders")
    except Exception:
        pass
    scheduler.add_job(_job("перевищення норми етапу", send_stage_norm_alerts),
                      "cron", hour=9, minute=30, id="personal_stage_norm_alerts", **opts)
    scheduler.add_job(_job("щотижневий список обʼєктів понад норму", send_stage_norm_digest),
                      "cron", day_of_week="mon", hour=9, minute=40, id="personal_stage_norm_digest", **opts)

    logger.info("📬 Особисті повідомлення: задачі, етапи, норми етапів, забезпечення, платежі, низькі залишки.")

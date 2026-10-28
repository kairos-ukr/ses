# notifier.py
"""
Повідомлення адміну та особисті повідомлення працівникам — в одному місці.

ПОМИЛКИ. Адмін має одразу бачити три речі: у якому модулі впало, що
саме бот робив (з яким об'єктом, задачею, людиною) і що сталося —
людською мовою. Технічний traceback іде в кінці, згорнутим, для того,
хто лагодитиме. Однакова помилка, що повторюється щохвилини, приходить
раз на 30 хвилин із лічильником, а не засипає чат.

ОСОБИСТІ. Кожне особисте повідомлення записується в
bot_personal_messages з ключем (вид, посилання, чат). Повторний прохід
циклу чи перезапуск бота нічого не дублює.

ДЗВІНОЧОК. Те саме повідомлення потрапляє й у дзвіночок CRM
(app_notifications) — навіть людям без підключеного Telegram.
Один випадок (людина + вид + ключ) записується один раз.
"""
import asyncio
import html
import logging
import time
import traceback
from typing import Iterable, Optional

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
)
from supabase import create_client, Client

import re

from config import ADMIN_ID, SUPABASE_URL, SUPABASE_KEY, SITE_URL

try:
    import httpx
except ImportError:  # httpx приходить разом із supabase, але про всяк випадок
    httpx = None

logger = logging.getLogger("notifier")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TG_LIMIT = 4096
THROTTLE_SECONDS = 30 * 60
UNREACHABLE_PAUSE_SECONDS = 6 * 60 * 60

# підпис помилки → [коли востаннє надіслали, скільки разів придушили]
_seen: dict = {}
# чат → коли з'ясувалось, що написати туди не можна (не натиснули Start)
_unreachable: dict = {}

KIND_LABELS = {
    "task_assigned": "доручена задача",
    "task_deadline": "дедлайн задачі",
    "stage_assigned": "призначення на етап",
    "supply_alert": "нагадування забезпечення",
    "low_stock": "низькі залишки",
    "payment_due": "платіж за графіком",
    "stage_norm": "перевищення норми етапу",
    "stage_norm_digest": "обʼєкти понад норму",
    "personal_reminder": "особисте нагадування",
    "deal_review": "угоди на перегляд",
    "report_reminder": "нагадування про звіт",
}


def _plain(line: str) -> str:
    """HTML-рядок повідомлення → звичайний текст."""
    return html.unescape(re.sub(r"<[^>]+>", "", line or "")).strip()


def record_in_app(employee: Optional[dict], kind: str, ref_key: str, text: str) -> None:
    """
    Записати повідомлення в дзвіночок CRM. Перший рядок — заголовок,
    посилання на сайт — куди веде клік, решта — текст.
    Якщо таблиці ще немає або щось пішло не так — тихо пропускаємо:
    дзвіночок не має заважати Telegram.
    """
    emp_id = (employee or {}).get("id")
    if not emp_id:
        return
    lines = (text or "").split("\n")
    link = None
    body = []
    for line in lines[1:]:
        found = re.search(r'href="([^"]+)"', line)
        if found:
            href = found.group(1)
            if href.startswith(SITE_URL):
                link = href[len(SITE_URL):] or "/"
            continue
        plain = _plain(line)
        if plain:
            body.append(plain)
    # Емодзі на початку заголовка в CRM зайві
    title = re.sub(r"^[^\w«(#]+", "", _plain(lines[0] if lines else "")) or KIND_LABELS.get(kind, kind)
    try:
        supabase.table("app_notifications").upsert({
            "employee_id": emp_id,
            "kind": kind,
            "ref_key": ref_key,
            "title": title[:200],
            "body": "\n".join(body)[:1500] or None,
            "link": link,
        }, on_conflict="employee_id,kind,ref_key", ignore_duplicates=True).execute()
    except Exception as e:
        logger.warning("Дзвіночок: не вдалося записати (%s, %s): %s", kind, ref_key, e)


def esc(value) -> str:
    """Безпечний текст для HTML-повідомлення Telegram."""
    return "" if value is None else html.escape(str(value), quote=False)


# =====================================================================
#  ОПИС ПОМИЛКИ ЛЮДСЬКОЮ МОВОЮ
# =====================================================================

PG_CODES = {
    "42P01": "немає такої таблиці чи представлення — схоже, не виконано міграцію",
    "42703": "немає такої колонки — схоже, не виконано міграцію",
    "42883": "немає такої функції — схоже, не виконано міграцію",
    "23505": "такий запис уже існує (порушено унікальність)",
    "23503": "посилання на запис, якого немає",
    "23502": "не заповнено обовʼязкове поле",
    "23514": "значення не пройшло перевірку в базі",
    "22P02": "некоректне значення (напр. текст замість числа)",
    "42501": "недостатньо прав — перевірте, що в .env ключ service_role, а не anon",
    "57014": "запит виконувався задовго, і база його скасувала",
    "PGRST116": "очікували рівно один запис, а знайшли жодного або кілька",
    "PGRST301": "ключ доступу до бази недійсний або прострочений",
}

TG_PHRASES = [
    ("message to edit not found", "повідомлення, яке треба було змінити, вже видалене"),
    ("message to reply not found", "повідомлення, на яке треба було відповісти, видалене"),
    ("replied message not found", "повідомлення, на яке треба було відповісти, видалене"),
    ("message to delete not found", "повідомлення вже видалене"),
    ("message thread not found", "гілку (топік) об'єкта видалено"),
    ("topic_closed", "гілку закрито — писати в неї не можна"),
    ("chat not found", "чат не знайдено — неправильний ID або бот не має туди доступу"),
    ("message is not modified", "текст не змінився"),
    ("topic_not_modified", "назва гілки вже така сама"),
    ("topic_id_invalid", "гілку (топік) об'єкта видалено"),
    ("can't parse entities", "зламана HTML-розмітка в тексті (найчастіше символ < або & у назві чи коментарі)"),
    ("message is too long", "повідомлення задовге для Telegram (понад 4096 символів)"),
    ("not enough rights", "у бота немає прав у групі (закріплення, створення гілок)"),
    ("wrong file identifier", "Telegram не зміг завантажити файл за посиланням"),
    ("failed to get http url content", "Telegram не зміг завантажити файл за посиланням"),
]


def is_not_modified(exc: BaseException) -> bool:
    """
    Telegram каже «нічого не змінилось»: текст повідомлення чи назва гілки
    вже такі самі. Це не помилка. Telegram пише це по-різному:
    «message is not modified» і «TOPIC_NOT_MODIFIED» — ловимо обидва.
    """
    return isinstance(exc, TelegramBadRequest) and "not modified" in str(exc).lower().replace("_", " ")


def describe_exception(exc: BaseException) -> str:
    msg = str(exc).strip()
    low = msg.lower()

    if isinstance(exc, TelegramForbiddenError):
        if "blocked" in low:
            return "Людина заблокувала бота."
        if "initiate" in low:
            return "Людина ще не натиснула «Start» у боті — першим написати їй бот не може."
        if "kicked" in low or "not a member" in low:
            return "Бота прибрали з групи або він не має доступу до чату."
        return f"Telegram заборонив дію: {msg}"
    if isinstance(exc, TelegramRetryAfter):
        return f"Telegram обмежив частоту повідомлень — треба зачекати {exc.retry_after} с."
    if isinstance(exc, TelegramBadRequest):
        for phrase, text in TG_PHRASES:
            if phrase in low:
                return f"Telegram: {text}."
        return f"Telegram відхилив запит: {msg}"
    if isinstance(exc, TelegramNetworkError):
        return "Немає зв'язку з Telegram (мережа або таймаут)."

    # Supabase / PostgREST: APIError має code, message, details, hint
    code = getattr(exc, "code", None)
    pg_message = getattr(exc, "message", None)
    if type(exc).__name__ == "APIError" or (code and isinstance(pg_message, str)):
        parts = [f"База даних: {PG_CODES.get(str(code), 'відхилила запит')}."]
        if pg_message:
            parts.append(f"«{pg_message}»")
        details = getattr(exc, "details", None)
        hint = getattr(exc, "hint", None)
        if details:
            parts.append(f"Деталі: {details}")
        if hint:
            parts.append(f"Підказка: {hint}")
        if code:
            parts.append(f"(код {code})")
        return " ".join(parts)

    if httpx is not None:
        if isinstance(exc, httpx.TimeoutException):
            return "Зовнішній сервіс не відповів вчасно (таймаут)."
        if isinstance(exc, httpx.ConnectError):
            return "Не вдалося підʼєднатися до зовнішнього сервісу (мережа або сервіс недоступний)."
        if isinstance(exc, httpx.HTTPStatusError):
            return f"Зовнішній сервіс відповів помилкою {exc.response.status_code}."

    if isinstance(exc, KeyError):
        return f"У даних бракує поля {msg} — запис неповний або змінилась структура."
    if isinstance(exc, (TypeError, ValueError)):
        return f"Некоректні дані: {msg}"

    return f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__


# =====================================================================
#  КОМУ ПИСАТИ ЯК АДМІНУ
# =====================================================================

_admin_cache = {"at": 0.0, "ids": set()}


def admin_chat_ids() -> set:
    """ADMIN_ID із config плюс працівники з підпискою «Системні» в картці."""
    now = time.monotonic()
    if _admin_cache["ids"] and now - _admin_cache["at"] < 300:
        return _admin_cache["ids"]

    ids = {int(ADMIN_ID)} if ADMIN_ID else set()
    try:
        rows = supabase.table("notification_subscriptions") \
            .select("employee:employees(telegram_user_id)") \
            .eq("topic", "system").execute().data or []
        for row in rows:
            tg = (row.get("employee") or {}).get("telegram_user_id")
            if tg:
                ids.add(int(tg))
    except Exception:
        # До міграції таблиці немає — лишається ADMIN_ID
        pass

    _admin_cache.update(at=now, ids=ids)
    return ids


def _throttle(signature: str) -> Optional[int]:
    """None — таку саму вже надсилали нещодавно; число — скільки разів пропустили."""
    now = time.monotonic()
    record = _seen.get(signature)
    if record and now - record[0] < THROTTLE_SECONDS:
        record[1] += 1
        return None
    suppressed = record[1] if record else 0
    _seen[signature] = [now, 0]
    return suppressed


async def send_admin_text(bot: Bot, text: str) -> None:
    if len(text) > TG_LIMIT:
        text = text[:TG_LIMIT - 20] + "…"
    for chat_id in admin_chat_ids():
        try:
            await bot.send_message(
                chat_id, text,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True,
            )
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
        except Exception as e:
            # Повідомити про збій повідомлення адміну вже нема як — лишаємо в лог
            logger.warning("Не вдалося написати адміну %s: %s", chat_id, e,
                           extra={"skip_admin": True})


async def report_error(
    bot: Bot,
    module: str,
    action: str,
    exc: BaseException,
    context: Optional[dict] = None,
) -> None:
    """
    module  — «Мікрозадачі», «Гілки об'єктів»…
    action  — що саме бот робив: «оновлення паспорта об'єкта»
    context — з чим: {"Обʼєкт": "Сонячна Гощанська #1234"}
    """
    human = describe_exception(exc)
    logger.error("%s · %s · %s", module, action, human, exc_info=exc,
                 extra={"skip_admin": True})

    signature = f"{module}|{action}|{type(exc).__name__}|{str(exc)[:160]}"
    suppressed = _throttle(signature)
    if suppressed is None:
        return

    lines = [f"⚠️ <b>{esc(module)}</b>", f"<b>Що робили:</b> {esc(action)}"]
    for key, value in (context or {}).items():
        if value not in (None, ""):
            lines.append(f"<b>{esc(key)}:</b> {esc(value)}")
    lines.append(f"<b>Що сталося:</b> {esc(human)}")
    if suppressed:
        lines.append(f"<i>Така сама помилка була ще {suppressed}× за останні 30 хв — "
                     f"окремо не надсилали, щоб не засипати чат.</i>")
    head = "\n".join(lines)

    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    tail = 1500
    while tail > 100:
        block = f"<blockquote expandable><code>{esc(tb[-tail:])}</code></blockquote>"
        if len(head) + len(block) + 2 <= TG_LIMIT:
            break
        tail -= 300
    else:
        block = ""

    await send_admin_text(bot, f"{head}\n\n{block}" if block else head)


class AdminLogHandler(logging.Handler):
    """
    Пересилає адміну записи рівня ERROR з модулів, які пишуть у logging
    (посилки, дні народження, обробка повідомлень aiogram). Записи самого
    notifier і report_error позначені skip_admin — їх не дублюємо.
    """

    MODULE_NAMES = {
        "parcel_monitor": "Посилки (Нова Пошта)",
        "birthday_monitor": "Дні народження",
        "aiogram.event": "Обробка повідомлень у Telegram",
        "apscheduler.executors.default": "Планувальник завдань",
    }

    def __init__(self, bot: Bot):
        super().__init__(level=logging.ERROR)
        self.bot = bot

    def emit(self, record: logging.LogRecord) -> None:
        if getattr(record, "skip_admin", False):
            return
        # Мережеві збої самого опитування Telegram — шум, вони минають самі
        if record.name.startswith("aiogram.dispatcher"):
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        suppressed = _throttle(f"log|{record.name}|{record.msg}")
        if suppressed is None:
            return

        module = self.MODULE_NAMES.get(record.name, record.name)
        text = [f"⚠️ <b>{esc(module)}</b>", f"<b>Що сталося:</b> {esc(record.getMessage())[:3000]}"]
        if record.exc_info and record.exc_info[1]:
            text.append(f"<b>Причина:</b> {esc(describe_exception(record.exc_info[1]))}")
        if suppressed:
            text.append(f"<i>Повторювалось ще {suppressed}× за останні 30 хв.</i>")
        loop.create_task(send_admin_text(self.bot, "\n".join(text)))


# =====================================================================
#  ОСОБИСТІ ПОВІДОМЛЕННЯ
# =====================================================================

def sent_ref_keys(kind: str, ref_keys: Iterable[str]) -> set:
    """Які з цих ключів уже надсилались (будь-кому)."""
    keys = list({k for k in ref_keys if k})
    if not keys:
        return set()
    found = set()
    # Порціями: довгий IN у query string PostgREST не любить
    for i in range(0, len(keys), 100):
        rows = supabase.table("bot_personal_messages") \
            .select("ref_key") \
            .eq("kind", kind) \
            .in_("ref_key", keys[i:i + 100]) \
            .execute().data or []
        found |= {r["ref_key"] for r in rows}
    return found


def _already_sent(kind: str, ref_key: str, chat_id: int) -> bool:
    rows = supabase.table("bot_personal_messages") \
        .select("id") \
        .eq("kind", kind).eq("ref_key", ref_key).eq("telegram_chat_id", chat_id) \
        .limit(1).execute().data
    return bool(rows)


async def send_personal(
    bot: Bot,
    chat_id,
    text: str,
    *,
    kind: str,
    ref_key: str,
    employee: Optional[dict] = None,
    reply_markup=None,
    in_app: bool = True,
    silent: bool = False,
) -> Optional[int]:
    """
    Надсилає особисте повідомлення один раз на (kind, ref_key, чат).
    Повертає message_id, якщо надіслано саме зараз, інакше None.
    Спершу записує його в дзвіночок CRM — і тим, у кого Telegram немає
    (in_app=False — коли повідомлення якраз і взяте з дзвіночка).
    """
    if in_app:
        record_in_app(employee, kind, ref_key, text)
    if not chat_id:
        return None
    chat_id = int(chat_id)

    paused_at = _unreachable.get(chat_id)
    if paused_at and time.monotonic() - paused_at < UNREACHABLE_PAUSE_SECONDS:
        return None

    if _already_sent(kind, ref_key, chat_id):
        return None

    who = (employee or {}).get("name") or f"чат {chat_id}"
    try:
        message = await bot.send_message(
            chat_id, text,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
            reply_markup=reply_markup,
            disable_notification=silent,   # пізно ввечері — без звуку, людина побачить зранку
        )
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        return None  # наступний прохід спробує ще раз
    except TelegramForbiddenError as e:
        _unreachable[chat_id] = time.monotonic()
        await report_error(
            bot, "Особисті повідомлення",
            f"надіслати «{KIND_LABELS.get(kind, kind)}» — {who}", e,
            {"Що зробити": "попросити людину відкрити бота й натиснути Start"},
        )
        return None
    except Exception as e:
        await report_error(
            bot, "Особисті повідомлення",
            f"надіслати «{KIND_LABELS.get(kind, kind)}» — {who}", e,
            {"Ключ": ref_key},
        )
        return None

    try:
        supabase.table("bot_personal_messages").insert({
            "employee_id": (employee or {}).get("id"),
            "telegram_chat_id": chat_id,
            "kind": kind,
            "ref_key": ref_key,
            "telegram_message_id": message.message_id,
        }).execute()
    except Exception as e:
        # Повідомлення вже пішло. Без запису наступний прохід надішле його вдруге.
        await report_error(
            bot, "Особисті повідомлення", "запис надісланого в журнал", e,
            {"Кому": who, "Вид": KIND_LABELS.get(kind, kind), "Ключ": ref_key},
        )
    return message.message_id

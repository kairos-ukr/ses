import logging
from datetime import date, datetime
from typing import Optional, Tuple

import pytz
from aiogram import Router, F
from aiogram.enums import ChatType
from aiogram.filters import ChatTypeFilter
from aiogram.types import Message
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, TZ, TELEGRAM_SUPERGROUP_ID

log = logging.getLogger(__name__)
TIMEZONE = pytz.timezone(TZ)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

report_router = Router(name="report_listeners")

# ---------------------------------------------------------------------------
# Допоміжні
# ---------------------------------------------------------------------------

def _now_utc_iso() -> str:
    return datetime.now(pytz.utc).isoformat()


def _parse_report_payload(msg: Message) -> Tuple[Optional[str], Optional[int]]:
    """Повертає (тип_звіту, custom_id) якщо вдалося розпізнати.
    Допустимі формати:
      - "Звіт 0123" (текст)
      - "Фотозвіт 0123" (текст або підпис фото)
    Повертає (None, None), якщо нічого не знайдено.
    """
    text = (msg.text or msg.caption or "").strip()
    if not text:
        return None, None

    # Дозволимо варіанти з/без відмінків, зайвими пробілами та leading zeros
    import re
    m = re.search(r"^(зві(т|ту)|фото\s*зві(т|ту))\s+(\d{1,4})\b", text, re.IGNORECASE)
    if not m:
        # Спроба з канонічними словами
        m = re.search(r"^(звіт|фотозвіт)\s+(\d{1,4})\b", text, re.IGNORECASE)
    if not m:
        return None, None

    full_word = m.group(1).lower()
    if full_word.startswith("фото"):
        rtype = "photo"
        cid_str = m.group(m.lastindex) if m.lastindex else m.groups()[-1]
    else:
        rtype = "text"
        cid_str = m.group(m.lastindex) if m.lastindex else m.groups()[-1]

    try:
        icu = int(cid_str)
        return rtype, icu
    except Exception:
        return None, None


def _infer_custom_id_from_thread(msg: Message) -> Optional[int]:
    """Якщо повідомлення прийшло в топіку, пробуємо знайти installation_custom_id по thread_id."""
    thread_id = getattr(msg, "message_thread_id", None)
    if not thread_id:
        return None
    try:
        # 1) installation_id за thread_id
        im = (
            supabase.table("installation_messages")
            .select("installation_id")
            .eq("thread_id", thread_id)
            .limit(1)
            .execute()
        )
        if not im.data:
            return None
        installation_id = im.data[0]["installation_id"]
        # 2) custom_id за installation_id
        inst = (
            supabase.table("installations")
            .select("custom_id")
            .eq("id", installation_id)
            .single()
            .execute()
        )
        return inst.data["custom_id"] if inst and inst.data else None
    except Exception as e:
        log.warning(f"_infer_custom_id_from_thread: {e}")
        return None


def _ensure_drs_record(installation_custom_id: int, day: date) -> Optional[int]:
    """Гарантує наявність запису у daily_report_status і повертає його id."""
    day_str = str(day)
    try:
        # Спроба знайти існуючий
        r = (
            supabase.table("daily_report_status")
            .select("id,status")
            .eq("installation_custom_id", installation_custom_id)
            .eq("report_date", day_str)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]["id"]
        # Якщо нема — створюємо pending
        ins = (
            supabase.table("daily_report_status")
            .insert({
                "installation_custom_id": installation_custom_id,
                "report_date": day_str,
                "status": "pending",
                "created_at": _now_utc_iso(),
                "updated_at": _now_utc_iso(),
            })
            .execute()
        )
        if ins.data:
            return ins.data[0]["id"]
        return None
    except Exception as e:
        log.error(f"_ensure_drs_record: {e}")
        return None


def _submit_report(installation_custom_id: int, msg: Message, report_type: str) -> bool:
    """Оновлює статус на submitted і проставляє службові поля."""
    today = date.today()
    drs_id = _ensure_drs_record(installation_custom_id, today)
    if not drs_id:
        return False

    try:
        from_user = msg.from_user
        submitted_by_user_id = getattr(from_user, "id", None)
        submitted_by_login = (
            from_user.username
            or f"{from_user.first_name or ''} {from_user.last_name or ''}".strip()
            or str(submitted_by_user_id)
        )
        (
            supabase.table("daily_report_status")
            .update({
                "status": "submitted",
                "submitted_by_user_id": submitted_by_user_id,
                "submitted_by_login": submitted_by_login,
                "submission_timestamp": _now_utc_iso(),
                "report_type": report_type,
                "updated_at": _now_utc_iso(),
            })
            .eq("id", drs_id)
            .execute()
        )
        return True
    except Exception as e:
        log.error(f"_submit_report: {e}")
        return False

# ---------------------------------------------------------------------------
# Обробники повідомлень у супергрупі з топіками
# ---------------------------------------------------------------------------

@report_router.message(
    ChatTypeFilter([ChatType.SUPERGROUP]),
    F.chat.id == TELEGRAM_SUPERGROUP_ID,
    (F.text | F.caption).as_("text_or_caption"),
)
async def handle_report_texts(msg: Message, text_or_caption: str):
    """Ловимо текстові звіти та підписи до фото з форматом "Звіт 0123"/"Фотозвіт 0123".
    Якщо номер не знайдено в тексті, намагаємось визначити об'єкт за thread_id.
    """
    rtype, icu = _parse_report_payload(msg)
    if not icu:
        # fallback за thread_id, якщо, наприклад, написали просто "Звіт" у відповідному топіку
        icu = _infer_custom_id_from_thread(msg)
        rtype = rtype or ("photo" if msg.photo else "text")

    if not icu:
        # Нічого не робимо, хай інші хендлери/модулі бота, якщо є, це перехоплять
        return

    ok = _submit_report(icu, msg, rtype or "text")
    if ok:
        oid = f"{icu:04d}"
        await msg.reply(
            f"✅ Звіт для об'єкта <b>№{oid}</b> прийнято. Дякую!",
            parse_mode="HTML",
            allow_sending_without_reply=True,
        )
    else:
        await msg.reply(
            "⚠️ Не вдалося зафіксувати звіт у БД. Спробуйте ще раз або зверніться до адміністратора.",
            allow_sending_without_reply=True,
        )

# Додатковий обробник для фото без підпису, але в коректному топіку
@report_router.message(
    ChatTypeFilter([ChatType.SUPERGROUP]),
    F.chat.id == TELEGRAM_SUPERGROUP_ID,
    F.photo,
    ~F.caption,
)
async def handle_photos_without_captions(msg: Message):
    icu = _infer_custom_id_from_thread(msg)
    if not icu:
        return
    ok = _submit_report(icu, msg, "photo")
    if ok:
        oid = f"{icu:04d}"
        await msg.reply(
            f"✅ Фотозвіт для об'єкта <b>№{oid}</b> прийнято.",
            parse_mode="HTML",
            allow_sending_without_reply=True,
        )

# ---------------------------------------------------------------------------
# Підключення
# ---------------------------------------------------------------------------

def register_report_listeners(dp) -> None:
    """Виклич у місці, де збираєш бота: dp.include_router(report_router)"""
    dp.include_router(report_router)

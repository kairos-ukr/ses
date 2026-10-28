import asyncio
import traceback
from typing import Dict, Any
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest
from supabase import create_client, Client

from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TELEGRAM_SUPERGROUP_ID,
    POLLING_INTERVAL_SECONDS,
    ADMIN_ID
)

# ================== INIT ==================

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
UA_TZ = ZoneInfo("Europe/Kyiv")

# ================== HELPERS ==================

async def send_error_to_admin(bot: Bot, text: str):
    try:
        await bot.send_message(
            ADMIN_ID,
            f"⚠️ <b>CLIENT MONITOR ERROR</b>\n<pre>{text[:3900]}</pre>",
            parse_mode=ParseMode.HTML
        )
    except Exception:
        pass

# ================== MESSAGE FORMATTER ==================

def format_client_message(client: Dict[str, Any]) -> str:
    parts = []

    parts.append(f"👤 <b>Клієнт:</b> {client['name']} ({client['custom_id']})")
    parts.append("➖➖➖➖➖➖➖➖")

    if client.get("phone"):
        parts.append(f"📞 <b>Телефон:</b> {client['phone']}")

    if client.get("object_type"):
        parts.append(f"🏠 <b>Тип обʼєкта:</b> {client['object_type']}")
    
    if client.get("company_name"):
        parts.append(f"🏢 <b>Компанія:</b> {client['company_name']}")

    location = ", ".join(filter(None, [
        client.get("oblast"),
        client.get("populated_place")
    ]))
    if location:
        parts.append(f"📍 <b>Локація:</b> {location}")

    if client.get("is_subcontract") and client.get("contractor_company"):
        parts.append(f"🏗 <b>Підрядна компанія:</b> {client['contractor_company']}")

    if client.get("notes"):
        parts.append(f"\n📝 <b>Примітки:</b>\n{client['notes']}")

    return "\n".join(parts)

# ================== LOGIC ==================

async def process_client(bot: Bot, client: Dict[str, Any]):
    try:
        client_id = client["id"]
        
        # Перевіряємо технічну таблицю зв'язків
        existing_thread_response = supabase.table("client_threads") \
            .select("*") \
            .eq("client_id", client_id) \
            .execute()
        
        existing_thread = existing_thread_response.data[0] if existing_thread_response.data else None
        
        client_text = format_client_message(client)
        # Назва топіка формується тільки для створення, при редагуванні ігнорується
        topic_name = f"{client['name']} ({client['custom_id']})"[:100]

        if existing_thread:
            # === ВАРІАНТ 1: ТРЕД ВЖЕ Є -> ТІЛЬКИ ОНОВЛЮЄМО ТЕКСТ ===
            
            # thread_id нам тут потрібен тільки якщо ви захочете щось надіслати, 
            # але для edit_message_text він не обов'язковий, якщо є chat_id + message_id
            msg_id = int(existing_thread["message_id"])

            try:
                # Редагуємо ТІЛЬКИ текст повідомлення
                await bot.edit_message_text(
                    text=client_text,
                    chat_id=TELEGRAM_SUPERGROUP_ID,
                    message_id=msg_id,
                    parse_mode=ParseMode.HTML
                )
            except TelegramBadRequest:
                pass
            
            # ❌ БЛОК ЗМІНИ НАЗВИ ТОПІКА ВИДАЛЕНО

        else:
            # === ВАРІАНТ 2: ТРЕДУ НЕМАЄ -> СТВОРЮЄМО З НУЛЯ ===
            
            topic = await bot.create_forum_topic(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                name=topic_name
            )
            thread_id = topic.message_thread_id

            msg = await bot.send_message(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                message_thread_id=thread_id,
                text=client_text,
                parse_mode=ParseMode.HTML
            )

            await bot.pin_chat_message(TELEGRAM_SUPERGROUP_ID, msg.message_id)

            supabase.table("client_threads").insert({
                "client_id": client_id,
                "thread_id": thread_id,
                "message_id": msg.message_id,
                "is_message": True
            }).execute()

        # === ФІНАЛ: ЗАКРИВАЄМО ЗАВДАННЯ ===
        supabase.table("clients").update({
            "thread": True,
            "telegram_synced": True
        }).eq("id", client_id).execute()

    except Exception as e:
        error_msg = f"Client ID: {client.get('id')}\nError: {traceback.format_exc()}"
        await send_error_to_admin(bot, error_msg)

async def client_monitor_task(bot: Bot):
    while True:
        try:
            # === ГОЛОВНА ЛОГІКА ПОШУКУ ===
            # 1. thread IS NULL/FALSE -> Створення
            # 2. telegram_synced IS NULL/FALSE -> Оновлення тексту
            
            resp = supabase.table("clients") \
                .select("*") \
                .or_("thread.is.null,thread.eq.false,telegram_synced.is.null,telegram_synced.eq.false") \
                .execute()

            clients = resp.data or []
            
            for client in clients:
                await process_client(bot, client)
                await asyncio.sleep(1)

        except Exception:
            await send_error_to_admin(bot, traceback.format_exc())

        await asyncio.sleep(POLLING_INTERVAL_SECONDS)

# ================== REGISTER ==================

def register_client_monitor(dp: Dispatcher, bot: Bot):
    asyncio.create_task(client_monitor_task(bot))
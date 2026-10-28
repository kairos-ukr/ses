import asyncio
import logging
import config  # Наш файл конфігурації

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from supabase import create_client, Client
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Налаштовуємо логер для цього модуля
logger = logging.getLogger(__name__)

# --- 1. Ініціалізація клієнтів (глобально для модуля) ---
try:
    supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
except Exception as e:
    logger.error(f"Не вдалося ініціалізувати Supabase: {e}")
    supabase = None

http_client = httpx.AsyncClient(timeout=59.0)

# --- 2. Константи Нової Пошти ---
NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"
NP_STATUS_AT_BRANCH = ['7', '8']  # 7: Прибув на відділення, 8: в Поштоматі
NP_STATUS_DELIVERED = ['9', '10', '11'] # 9: Отримано, 10, 11: Отримано + грош. переказ

# --- 3. Функції API (Нова Пошта) ---

async def get_np_statuses(tth_list: list[str]) -> dict:
    """Отримує статуси для списку ТТН з API Нової Пошти (без номера телефону)."""
    if not tth_list:
        return {}

    # Надсилаємо тільки DocumentNumber
    documents = [{"DocumentNumber": tth} for tth in tth_list]
    
    payload = {
        "apiKey": config.NOVAPOSHTA_API_KEY,
        "modelName": "TrackingDocument",
        "calledMethod": "getStatusDocuments",
        "methodProperties": {"Documents": documents}
    }
    
    try:
        response = await http_client.post(NP_API_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return {item['Number']: item for item in data.get("data", [])}
        else:
            logger.error(f"NP API Error: {data.get('errors')}")
            return {}
    except httpx.RequestError as e:
        logger.error(f"HTTPX error calling NP API: {e}")
        return {}
    except Exception as e:
        logger.error(f"General error in get_np_statuses: {e}")
        return {}

# --- 4. Функції форматування повідомлень ---

def format_pending_message(parcel: dict) -> str:
    """Форматує повідомлення для замовлення БЕЗ ТТН."""
    return (
        f"🆕 <b>Нове замовлення: #{parcel['id']}</b>\n\n"
        f"<b>Що:</b> {parcel['order_details']}\n"
        f"<b>К-сть:</b> {parcel.get('quantity', 'N/A')}\n"
        f"<b>Куди:</b> {parcel.get('destination', 'N/A')}\n\n"
        f"<i>(Очікуємо ТТН...)</i>"
    )

def format_full_message(parcel: dict, np_data: dict) -> str:
    """Форматує повне повідомлення, коли є ТТН."""
    return (
        f"🆕 <b>Нове замовлення: #{parcel['id']}</b>\n\n"
        f"<b>Що:</b> {parcel['order_details']}\n"
        f"<b>К-сть:</b> {parcel.get('quantity', 'N/A')}\n"
        f"<b>Куди:</b> {parcel.get('destination', 'N/A')}\n"
        f"<b>ТТН:</b> <code>{parcel['tth']}</code>\n\n"
        f"-----------------------------------\n"
        f"🚚 <b>Доставка:</b>\n"
        f"<b>Статус:</b> {np_data.get('Status', 'N/A')}\n"
        f"<b>Відділення:</b> {np_data.get('WarehouseRecipient', 'N/A')}\n"
        f"<b>Очікуємо:</b> {np_data.get('ScheduledDeliveryDate', 'N/A')}"
    )

def format_final_message(parcel: dict, np_data: dict) -> str:
    """Форматує фінальне (закреслене) повідомлення."""
    delivery_date = np_data.get('RecipientDateTime', 'N/A')
    return (
        f"<s>🆕 <b>Нове замовлення: #{parcel['id']}</b></s>\n\n"
        f"<s><b>Що:</b> {parcel['order_details']}</s>\n"
        f"<s><b>К-сть:</b> {parcel.get('quantity', 'N/A')}</s>\n"
        f"<s><b>Куди:</b> {parcel.get('destination', 'N/A')}</s>\n"
        f"<s><b>ТТН:</b> <code>{parcel['tth']}</code></s>\n\n"
        f"<s>-----------------------------------</s>\n"
        f"<s>🚚 <b>Доставка:</b></s>\n"
        f"<s><b>Статус:</b> {np_data.get('Status', 'N/A')}</s>\n"
        f"<s><b>Відділення:</b> {np_data.get('WarehouseRecipient', 'N/A')}</s>\n\n"
        f"✅ <b>ОТРИМАНО</b> ({delivery_date})"
    )

# --- 5. Логіка обробки (Фонова задача 1) ---
async def check_new_and_updated_parcels(bot: Bot):
    """Перевіряє записи в статусах 'pending' та 'pending_tth'."""
    if not supabase:
        logger.warning("Supabase client не ініціалізовано. Пропуск check_new_and_updated_parcels.")
        return
        
    try:
        response = await asyncio.to_thread(
            supabase.table("parcels")
            .select("*")
            .in_("bot_process_status", ["pending", "pending_tth"])
            .execute
        )
        parcels = response.data
        if not parcels:
            return

        for parcel in parcels:
            status = parcel['bot_process_status']
            tth = parcel.get('tth')
            tg_msg_id = parcel.get('tg_message_id')
            parcel_id = parcel['id']

            try:
                # Сценарій 1: Нове замовлення, БЕЗ ТТН
                if status == 'pending' and not tth:
                    logger.info(f"Processing pending parcel #{parcel_id} (no TTH)")
                    text = format_pending_message(parcel)
                    msg = await bot.send_message(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_thread_id=config.PARCEL_TOPIC_ID,
                        text=text
                    )
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({"tg_message_id": msg.message_id, "bot_process_status": "pending_tth"})
                        .eq("id", parcel_id)
                        .execute
                    )
                
                # Сценарій 2: Додали ТТН до існуючого ('pending_tth')
                elif status == 'pending_tth' and tth and tg_msg_id:
                    logger.info(f"Processing updated parcel #{parcel_id} (TTH added)")
                    np_data_map = await get_np_statuses([tth])
                    if not np_data_map or tth not in np_data_map:
                        logger.warning(f"No NP data for TTH {tth}, skipping edit.")
                        continue
                    
                    np_data = np_data_map[tth]
                    text = format_full_message(parcel, np_data)
                    await bot.edit_message_text(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_id=tg_msg_id,
                        text=text
                    )
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({
                            "bot_process_status": "notified",
                            "np_status_code": np_data.get('StatusCode'),
                            "np_status_text": np_data.get('Status'),
                            "np_planned_delivery_date": np_data.get('ScheduledDeliveryDate'),
                            "np_branch_address": np_data.get('WarehouseRecipient')
                        })
                        .eq("id", parcel_id)
                        .execute
                    )

                # Сценарій 3: Нове замовлення, ОДРАЗУ З ТТН
                elif status == 'pending' and tth:
                    logger.info(f"Processing pending parcel #{parcel_id} (with TTH)")
                    np_data_map = await get_np_statuses([tth])
                    if not np_data_map or tth not in np_data_map:
                        logger.warning(f"No NP data for TTH {tth}, will retry.")
                        continue 
                    
                    np_data = np_data_map[tth]
                    text = format_full_message(parcel, np_data)
                    msg = await bot.send_message(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_thread_id=config.PARCEL_TOPIC_ID,
                        text=text
                    )
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({
                            "tg_message_id": msg.message_id,
                            "bot_process_status": "notified",
                            "np_status_code": np_data.get('StatusCode'),
                            "np_status_text": np_data.get('Status'),
                            "np_planned_delivery_date": np_data.get('ScheduledDeliveryDate'),
                            "np_branch_address": np_data.get('WarehouseRecipient')
                        })
                        .eq("id", parcel_id)
                        .execute
                    )
            
            except TelegramBadRequest as e:
                logger.error(f"Telegram error processing parcel #{parcel_id}: {e}")
            except Exception as e:
                logger.error(f"Error processing parcel #{parcel_id}: {e}")

    except Exception as e:
        logger.error(f"Failed to check new/updated parcels: {e}")

# --- 6. Логіка відстеження (Фонова задача 2) ---
async def check_active_parcels(bot: Bot):
    """Перевіряє статуси 'notified' та 'at_branch'."""
    if not supabase:
        logger.warning("Supabase client не ініціалізовано. Пропуск check_active_parcels.")
        return
        
    try:
        response = await asyncio.to_thread(
            supabase.table("parcels")
            .select("*")
            .in_("bot_process_status", ["notified", "at_branch"])
            .execute
        )
        parcels_to_track = response.data
        if not parcels_to_track:
            return

        tth_list = [p['tth'] for p in parcels_to_track if p.get('tth')]
        if not tth_list:
            return

        logger.info(f"Tracking {len(tth_list)} active parcels...")
        np_statuses = await get_np_statuses(tth_list)

        for parcel in parcels_to_track:
            parcel_id = parcel['id']
            tth = parcel.get('tth')
            if not tth or tth not in np_statuses:
                continue
            
            np_data = np_statuses[tth]
            np_code = np_data.get('StatusCode')
            current_status = parcel['bot_process_status']

            try:
                # Сценарій A: Прибуло на відділення
                if np_code in NP_STATUS_AT_BRANCH and current_status == 'notified':
                    logger.info(f"Parcel #{parcel_id} AT BRANCH")
                    text = f"✅ <b>Посилка #{parcel_id} прибула у відділення!</b>\nБудь ласка, заберіть."
                    reply_msg = await bot.send_message(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_thread_id=config.PARCEL_TOPIC_ID,
                        text=text,
                        reply_to_message_id=parcel['tg_message_id']
                    )
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({
                            "bot_process_status": "at_branch",
                            "tg_reply_message_id": reply_msg.message_id,
                            "np_status_code": np_code,
                            "np_status_text": np_data.get('Status')
                        })
                        .eq("id", parcel_id)
                        .execute
                    )
                
                # Сценарій Б: Отримано
                elif np_code in NP_STATUS_DELIVERED and current_status != 'done':
                    logger.info(f"Parcel #{parcel_id} DELIVERED")
                    
                    if parcel.get('tg_reply_message_id'):
                        try:
                            await bot.delete_message(
                                chat_id=config.PARCEL_SUPERGROUP_ID,
                                message_id=parcel['tg_reply_message_id']
                            )
                        except TelegramBadRequest as e:
                            logger.warning(f"Could not delete reply message for #{parcel_id}: {e}")
                    
                    delivery_time = np_data.get('RecipientDateTime', 'Зараз')
                    reply_text = f"🏁 <b>Посилка #{parcel_id} отримана</b> ({delivery_time})"
                    await bot.send_message(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_thread_id=config.PARCEL_TOPIC_ID,
                        text=reply_text,
                        reply_to_message_id=parcel['tg_message_id']
                    )
                    
                    final_text = format_final_message(parcel, np_data)
                    await bot.edit_message_text(
                        chat_id=config.PARCEL_SUPERGROUP_ID,
                        message_id=parcel['tg_message_id'],
                        text=final_text
                    )
                    
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({
                            "bot_process_status": "done",
                            "np_status_code": np_code,
                            "np_status_text": np_data.get('Status')
                        })
                        .eq("id", parcel_id)
                        .execute
                    )
                
                # Сценарій В: Все ще в дорозі (просто оновити статус)
                elif current_status == 'notified':
                    await asyncio.to_thread(
                        supabase.table("parcels")
                        .update({
                            "np_status_code": np_code,
                            "np_status_text": np_data.get('Status')
                        })
                        .eq("id", parcel_id)
                        .execute
                    )

            except TelegramBadRequest as e:
                logger.error(f"Telegram error processing active parcel #{parcel_id}: {e}")
            except Exception as e:
                logger.error(f"Error processing active parcel #{parcel_id}: {e}")
                
    except Exception as e:
        logger.error(f"Failed to check active parcels: {e}")

# --- 7. Головна функція реєстрації ---

def register_parcel_monitor(scheduler: AsyncIOScheduler, bot: Bot):
    """Додає фонові завдання моніторингу посилок до існуючого планувальника."""
    
    if not supabase:
        logger.critical("Supabase client не ініціалізовано. Монітор посилок НЕ буде запущено.")
        return
        
    try:
        scheduler.add_job(
            check_new_and_updated_parcels,
            'interval',
            seconds=config.NEW_CHECK_INTERVAL_SECONDS,
            id='check_new_parcels',
            args=[bot] # Передаємо bot як аргумент
        )
        scheduler.add_job(
            check_active_parcels,
            'interval',
            seconds=config.ACTIVE_CHECK_INTERVAL_SECONDS,
            id='check_active_parcels',
            args=[bot] # Передаємо bot як аргумент
        )
        logger.info("📦 Монітор посилок успішно зареєстровано в планувальнику.")
    except Exception as e:
        logger.error(f"Помилка реєстрації монітора посилок: {e}")
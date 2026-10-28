# procurement_monitor.py
import asyncio
import httpx  # 👈 Новий імпорт
from datetime import datetime, timezone, timedelta  # 👈 Новий імпорт
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest
from supabase import create_client, Client
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TELEGRAM_SUPERGROUP_ID,
    POLLING_INTERVAL_SECONDS,  # Це для основного монітора
    NOVAPOSHTA_API_KEY,
)
from notifier import report_error

MODULE = "Закупівлі та ТТН"

# --- 🔽 НОВІ КОНСТАНТИ 🔽 ---
# Ключ API Нової Пошти — з .env через config.py
NOVA_POSHTA_API_KEY = NOVAPOSHTA_API_KEY
NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"

# Інтервал перевірки API НП (10 хвилин)
TTN_POLLING_INTERVAL_SECONDS = 1800

# Інтервал для повторних нагадувань (1 день = 24 години)
REMINDER_INTERVAL_HOURS = 24
# --- 🔼 НОВІ КОНСТАНТИ 🔼 ---


supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

STATUS_ICON = {
    "Заплановано": "🗓️",
    "Замовлено": "🛒",
    "В дорозі": "🚚",
    "Доставлено": "✅",
    "Скасовано": "❌",
}

# ... (Ваші функції `_status_icon`, `format_main_message`, `format_update_message` залишаються без змін) ...

def _status_icon(status: str) -> str:
    return STATUS_ICON.get(status or "", "📦")

def format_main_message(procurement: dict, equipment_name: str) -> str:
    """Основне повідомлення про замовлення обладнання."""
    status = procurement.get("status", "невідомий")
    icon = _status_icon(status)
    quantity = procurement.get("quantity", "N/A")
    ttn = procurement.get("ttn_code")

    lines = [
        f"{icon} <b>Обладнання для об'єкта</b>",
        "────────────────────────────────",
        f"<b>Назва:</b> {equipment_name}",
        f"<b>Кількість:</b> {quantity} шт.",
        f"<b>Статус:</b> {status}",
    ]
    if ttn:
        lines.append(f"<b>ТТН:</b> <code>{ttn}</code>")
    
    # Тут можна буде додати 'ttn_estimated_date' якщо ми його
    # додамо в `project_procurement`
    
    return "\n".join(lines)

def format_update_message(procurement: dict, equipment_name: str) -> str:
    """Повідомлення-оновлення, яке відправляємо у відповідь на основне."""
    status = procurement.get("status", "невідомий")
    icon = _status_icon(status)
    quantity = procurement.get("quantity", "N/A")
    ttn = procurement.get("ttn_code")

    lines = [
        f"{icon} <b>Оновлення закупівлі</b>",
        f"<b>Назва:</b> {equipment_name}",
        f"<b>Кількість:</b> {quantity} шт.",
        f"<b>Статус:</b> {status}",
    ]
    if ttn:
        lines.append(f"<b>ТТН:</b> <code>{ttn}</code>")

    # можна додати мітку часу
    lines.append(f"<i>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</i>")

    return "\n".join(lines)


def fetch_topic_id_and_equipment_name(installation_custom_id: int, equipment_id: int):
    """Повертає (thread_id, equipment_name) або (None, None) якщо щось не знайдено."""
    inst_resp = (
        supabase.table("installations")
        .select("id")
        .eq("custom_id", installation_custom_id)
        .single()
        .execute()
    )
    if not inst_resp.data:
        return None, None

    msg_resp = (
        supabase.table("installation_messages")
        .select("thread_id")
        .eq("installation_id", inst_resp.data["id"])
        .single()
        .execute()
    )
    if not msg_resp.data:
        return None, None

    equip_resp = (
        supabase.table("equipment")
        .select("name")
        .eq("id", equipment_id)
        .single()
        .execute()
    )
    if not equip_resp.data:
        return None, None

    return msg_resp.data["thread_id"], equip_resp.data["name"]

# ... (Ваш `procurement_monitor_task` залишається без змін) ...
async def procurement_monitor_task(bot: Bot):
    """Моніторинг закупівель: нові — основне повідомлення, оновлення — реплаї."""
    last_check_time = datetime.now(timezone.utc)

    while True:
        try:
            # === 1) НОВІ ЗАПИСИ: message_id IS NULL => створюємо ОСНОВНЕ повідомлення ===
            new_proc_resp = (
                supabase.table("project_procurement")
                .select("*")
                .is_("message_id", "null")
                .order("created_at")  # необов'язково, для стабільного порядку
                .execute()
            )

            for item in new_proc_resp.data or []:
                thread_id, equipment_name = fetch_topic_id_and_equipment_name(
                    item["installation_custom_id"], item["equipment_id"]
                )
                if not thread_id or not equipment_name:
                    continue

                text = format_main_message(item, equipment_name)
                sent = await bot.send_message(
                    chat_id=TELEGRAM_SUPERGROUP_ID,
                    message_thread_id=thread_id,
                    text=text,
                    parse_mode=ParseMode.HTML,
                    disable_web_page_preview=True,
                )

                # зберігаємо message_id як "основне" повідомлення закупівлі
                supabase.table("project_procurement") \
                    .update({"message_id": sent.message_id}) \
                    .eq("id", item["id"]) \
                    .execute()

                print(
                    f"Надіслано ОСНОВНЕ повідомлення про обладнання ID: {item['id']} "
                    f"для об'єкта #{item['installation_custom_id']} (msg_id={sent.message_id})"
                )

            # === 2) ОНОВЛЕННЯ: updated_at > last_check_time та message_id NOT NULL => ШЛЕМО РЕПЛАЙ ===
            current_time = datetime.now(timezone.utc)
            time_filter = last_check_time.isoformat()

            upd_proc_resp = (
                supabase.table("project_procurement")
                .select("*")
                .gt("updated_at", time_filter)
                .not_.is_("message_id", "null")
                .order("updated_at")
                .execute()
            )

            for item in upd_proc_resp.data or []:
                # отримаємо thread_id та назву обладнання
                thread_id, equipment_name = fetch_topic_id_and_equipment_name(
                    item["installation_custom_id"], item["equipment_id"]
                )
                if not thread_id or not equipment_name:
                    continue

                # замість редагування — ВІДПОВІДЬ на основне повідомлення
                try:
                    reply_text = format_update_message(item, equipment_name)
                    await bot.send_message(
                        chat_id=TELEGRAM_SUPERGROUP_ID,
                        message_thread_id=thread_id,  # на випадок, якщо треба вказати тред
                        reply_to_message_id=item["message_id"],  # ключовий момент
                        text=reply_text,
                        parse_mode=ParseMode.HTML,
                        disable_web_page_preview=True,
                    )
                    print(
                        f"Надіслано ОНОВЛЕННЯ для обладнання ID: {item['id']} "
                        f"об'єкт #{item['installation_custom_id']} (reply_to={item['message_id']})"
                    )
                except TelegramBadRequest as e:
                    # типові ситуації: вихід за обмеження, повідомлення видалено, тощо
                    print(f"Помилка під час надсилання оновлення: {e}")

            last_check_time = current_time

        except Exception as e:
            await report_error(bot, MODULE, "надсилання закупівель обладнання в гілки об'єктів", e)

        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


# --- 🔽 НОВИЙ ФУНКЦІОНАЛ 🔽 ---

async def fetch_nova_poshta_status(ttn_code: str) -> dict | None:
    """
    Робить запит до API Нової Пошти для отримання статусу ТТН.
    """
    if not NOVA_POSHTA_API_KEY or NOVA_POSHTA_API_KEY == "ВАШ_API_КЛЮЧ_НОВОЇ_ПОШТИ_ТУТ":
        print(f"API ключ Нової Пошти не налаштовано. Пропуск ТТН: {ttn_code}")
        return None

    payload = {
        "apiKey": NOVA_POSHTA_API_KEY,
        "modelName": "TrackingDocument",
        "calledMethod": "getStatusDocuments",
        "methodProperties": {
            "Documents": [{"DocumentNumber": ttn_code, "Phone": ""}]
        },
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(NP_API_URL, json=payload, timeout=10.0)
            response.raise_for_status()  # Викличе помилку, якщо статус 4xx/5xx
        
        data = response.json()
        
        if data.get("success") and data.get("data"):
            return data["data"][0]  # Повертаємо перший результат
        else:
            errors = data.get("errors", ["Невідома помилка API НП"])
            print(f"Помилка API НП для ТТН {ttn_code}: {errors[0]}")
            return None
    except httpx.RequestError as e:
        print(f"Помилка запиту до API НП для ТТН {ttn_code}: {e}")
        return None
    except Exception as e:
        print(f"Загальна помилка fetch_nova_poshta_status: {e}")
        return None


async def sync_procurement_with_tracking():
    """
    Знаходить закупівлі з ТТН, для яких ще не створено запис 
    у `shipment_tracking`, і створює їх.
    """
    try:
        # 1. Знайти всі закупівлі, де є ТТН
        proc_resp = (
            supabase.table("project_procurement")
            .select("id, ttn_code")
            .not_.is_("ttn_code", "null")
            .execute()
        )
        if not proc_resp.data:
            return  # Немає закупівель з ТТН

        proc_map = {item['ttn_code']: item['id'] for item in proc_resp.data}
        
        # 2. Знайти всі ТТН, які ми ВЖЕ відстежуємо
        track_resp = (
            supabase.table("shipment_tracking")
            .select("ttn_code")
            .in_("ttn_code", list(proc_map.keys()))
            .execute()
        )
        tracked_ttns = {item['ttn_code'] for item in track_resp.data}
        
        # 3. Знайти різницю
        new_ttns_to_track = set(proc_map.keys()) - tracked_ttns
        
        if not new_ttns_to_track:
            return # Немає нових ТТН для додавання

        # 4. Створити нові записи для відстеження
        new_tracking_entries = []
        for ttn in new_ttns_to_track:
            procurement_id = proc_map[ttn]
            new_tracking_entries.append({
                "procurement_id": procurement_id,
                "ttn_code": ttn
            })
            
        if new_tracking_entries:
            supabase.table("shipment_tracking").insert(new_tracking_entries).execute()
            print(f"Додано нові ТТН для відстеження: {', '.join(new_ttns_to_track)}")
            
            # TODO (Опціонально): Тут можна зробити перший запит до API НП,
            # отримати орієнтовну дату і ВІДРЕДАГУВАТИ головне повідомлення,
            # додавши туди цю дату.

    except Exception as e:
        print(f"Помилка під час синхронізації ТТН: {e}")


async def ttn_tracking_task(bot: Bot):
    """
    Фонова задача для моніторингу статусів ТТН Нової Пошти.
    Працює паралельно з `procurement_monitor_task`.
    """
    while True:
        print(f"Запуск перевірки статусів ТТН... (наступна через {TTN_POLLING_INTERVAL_SECONDS}с)")
        try:
            # 1. Синхронізуємо ТТН з project_procurement
            await sync_procurement_with_tracking()
            
            # 2. Отримуємо всі АКТИВНІ відстеження
            # Використовуємо Supabase join `procurement_id(...)`
            active_ships_resp = (
                supabase.table("shipment_tracking")
                .select(
                    "*, "
                    "procurement_id("
                    "   id, "
                    "   message_id, "
                    "   installation_custom_id, "
                    "   equipment_id"
                    ")"
                )
                .eq("is_final_status", False)
                .execute()
            )

            if not active_ships_resp.data:
                await asyncio.sleep(TTN_POLLING_INTERVAL_SECONDS)
                continue
                
            now_utc = datetime.now(timezone.utc)

            for ship in active_ships_resp.data:
                ttn_code = ship["ttn_code"]
                procurement = ship.get("procurement_id")

                # --- Перевірки наявності даних ---
                if not procurement:
                    print(f"Пропуск ТТN {ttn_code}: не знайдено пов'язану закупівлю.")
                    continue
                
                main_message_id = procurement.get("message_id")
                if not main_message_id:
                    print(f"Пропуск ТТН {ttn_code}: головне повідомлення ще не створено.")
                    continue
                
                thread_id, _ = fetch_topic_id_and_equipment_name(
                    procurement["installation_custom_id"], procurement["equipment_id"]
                )
                if not thread_id:
                    print(f"Пропуск ТТН {ttn_code}: не знайдено thread_id.")
                    continue
                
                # --- Отримуємо статус з API ---
                api_data = await fetch_nova_poshta_status(ttn_code)
                if not api_data:
                    print(f"Пропуск ТТН {ttn_code}: не вдалося отримати дані з API НП.")
                    continue

                new_status_code = api_data.get("StatusCode")
                new_status_desc = api_data.get("Status", "N/A")
                db_update_payload = {
                    "api_status_code": new_status_code,
                    "api_status_description": new_status_desc,
                    "last_api_check_at": now_utc.isoformat(),
                }
                
                reply_text = None

                # --- ЛОГІКА СТАТУСІВ ---

                # Код '9' = "Прибув у відділення"
                if new_status_code == '9':
                    if not ship.get("is_arrival_notified"):
                        # ПЕРШЕ сповіщення про прибуття
                        reply_text = (
                            f"✅ <b>Посилка прибула!</b>\n"
                            f"ТТН: <code>{ttn_code}</code>\n"
                            f"Статус: <b>{new_status_desc}</b>\n"
                            f"Відділення: {api_data.get('WarehouseRecipient', 'N/A')}"
                        )
                        db_update_payload.update({
                            "is_arrival_notified": True,
                            "actual_arrival_date": api_data.get("ActualDeliveryDate", now_utc.isoformat()),
                            "last_reminder_sent_at": now_utc.isoformat()
                        })
                    else:
                        # Посилка ВЖЕ прибула, перевіряємо чи час для НАГАДУВАННЯ
                        last_reminder_str = ship.get("last_reminder_sent_at")
                        if last_reminder_str:
                            last_reminder_dt = datetime.fromisoformat(last_reminder_str)
                            hours_passed = (now_utc - last_reminder_dt).total_seconds() / 3600
                            
                            if hours_passed >= REMINDER_INTERVAL_HOURS:
                                reply_text = (
                                    f"🔔 <b>Нагадування!</b>\n"
                                    f"Посилка <code>{ttn_code}</code> все ще очікує у відділенні!"
                                )
                                db_update_payload["last_reminder_sent_at"] = now_utc.isoformat()
                
                # Код '10' = "Отримано"
                elif new_status_code == '10':
                    reply_text = (
                        f"📦 <b>Посилку отримано!</b>\n"
                        f"ТТН: <code>{ttn_code}</code>\n"
                        f"Статус: {new_status_desc}"
                    )
                    db_update_payload.update({
                        "is_final_status": True,
                        "recipient_datetime": api_data.get("RecipientDateTime", now_utc.isoformat())
                    })

                # Коди '102', '103', '108' = Відмова, Повернення і т.д.
                elif new_status_code in ['102', '103', '108']:
                    reply_text = (
                        f"❌ <b>Проблема з посилкою!</b>\n"
                        f"ТТН: <code>{ttn_code}</code>\n"
                        f"Статус: <b>{new_status_desc}</b>"
                    )
                    db_update_payload["is_final_status"] = True
                
                # --- Відправка повідомлення та оновлення БД ---
                if reply_text:
                    try:
                        await bot.send_message(
                            chat_id=TELEGRAM_SUPERGROUP_ID,
                            message_thread_id=thread_id,
                            reply_to_message_id=main_message_id,
                            text=reply_text,
                            parse_mode=ParseMode.HTML,
                            disable_web_page_preview=True,
                        )
                        print(f"TTN {ttn_code}: надіслано сповіщення: {reply_text.splitlines()[0]}")
                    except TelegramBadRequest as e:
                        print(f"Помилка відправки сповіщення для ТТН {ttn_code}: {e}")
                
                # Оновлюємо запис в shipment_tracking
                supabase.table("shipment_tracking").update(db_update_payload).eq("id", ship["id"]).execute()
                
                # Невелика пауза, щоб не спамити API Телеграму
                await asyncio.sleep(0.5) 

        except Exception as e:
            await report_error(bot, MODULE, "перевірка статусів ТТН Нової Пошти для закупівель", e)
        
        # Головний цикл очікує 10 хвилин
        await asyncio.sleep(TTN_POLLING_INTERVAL_SECONDS)


# --- 🔼 НОВИЙ ФУНКЦІОНАЛ 🔼 ---


def register_background_tasks(dp: Dispatcher, bot: Bot):
    """
    Запускає фонові задачі:
    1. Моніторинг закупівель (статуси, нові)
    2. Моніторинг ТТН (Нова Пошта)
    """
    # 1. Ваш існуючий монітор
    asyncio.create_task(procurement_monitor_task(bot))
    print("✅ Моніторинг закупівель: нові — основне повідомлення, зміни — реплаї.")
    
    # 2. Новий монітор ТТН
    asyncio.create_task(ttn_tracking_task(bot))
    print(f"✅ Моніторинг ТТН (Нова Пошта): запущено з інтервалом {TTN_POLLING_INTERVAL_SECONDS}с.")

# -------------------------------------------------------------------
# ВАШ ОСНОВНИЙ ФАЙЛ (main.py або bot.py) МАЄ ТЕПЕР ВИКЛИКАТИ
# `register_background_tasks` ЗАМІСТЬ `register_procurement_monitor`
# -------------------------------------------------------------------

# async def main():
#     bot = Bot(token=TELEGRAM_BOT_TOKEN)
#     dp = Dispatcher()
#     
#     # ... ваші хендлери ...
#     
#     # Запускаємо фонові задачі
#     register_background_tasks(dp, bot) 
#     
#     await dp.start_polling(bot)
#
# if __name__ == "__main__":
#     asyncio.run(main())

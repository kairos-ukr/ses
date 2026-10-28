import asyncio
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
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
)
from notifier import report_error, is_not_modified

# ================== INIT ==================

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
UA_TZ = ZoneInfo("Europe/Kyiv")

MODULE = "Гілки обʼєктів (паспорт)"

# ================== MESSAGE FORMATTER ==================

def format_passport_message(
    inst: Dict[str, Any],
    client: Dict[str, Any],
    main_emp: Optional[Dict[str, Any]],
    creator_name: Optional[str] = None
) -> Tuple[str, str]:
    """
    Повертає кортеж: (Назва топіка, Текст закріпленого повідомлення)
    """
    updated_local = datetime.now(tz=UA_TZ).strftime("%d.%m %H:%M")

    is_subcontract = inst.get("is_subcontract") or client.get("is_subcontract")

    inst_name = inst.get("name")
    if not inst_name or str(inst_name).strip() == "":
        inst_name = "Обʼєкт без назви"

    inst_custom_id = inst.get("custom_id", "---")
    client_custom_id = client.get("custom_id", "---")

    # === 1. ЛОГІКА НАЗВИ ГІЛКИ (ТОПІКА) - БЕЗ ЕМОДЗІ ===
    if is_subcontract:
        partner_name = client.get("contractor_company") or client.get("company_name") or "Партнер"
        topic_name = f"{inst_name} ({partner_name}) #{inst_custom_id}"[:100]
    else:
        topic_name = f"{inst_name} #{inst_custom_id}"[:100]

    # === 2. ТЕКСТ ПОВІДОМЛЕННЯ ===
    parts = []

    if is_subcontract:
        parts.append(f"🤝 <b>ПАСПОРТ ОБʼЄКТА (ПІДРЯД) #{inst_custom_id}</b>")
    else:
        parts.append(f"🏗 <b>ПАСПОРТ ОБʼЄКТА #{inst_custom_id}</b>")

    parts.append("➖➖➖➖➖➖➖➖")
    parts.append(f"📌 <b>Назва:</b> {inst_name}")

    # --- ІНФО ПРО КЛІЄНТА / ПАРТНЕРА ---
    if is_subcontract:
        partner_name = client.get("contractor_company") or client.get("company_name")
        if partner_name:
            parts.append(f"🏢 <b>Компанія-партнер:</b> {partner_name} (ID: {client_custom_id})")
        if inst.get("partner_manager"):
            parts.append(f"👔 <b>Від партнера:</b> {inst['partner_manager']}")
    else:
        if client.get("name"):
            parts.append(f"👤 <b>Клієнт:</b> {client['name']} (ID: {client_custom_id})")
        if client.get("phone"):
            parts.append(f"📞 <b>Телефон:</b> {client['phone']}")

    # --- ЛОКАЦІЯ ---
    location = ", ".join(filter(None, [client.get("oblast"), client.get("populated_place")]))
    gps_link = inst.get("gps_link")

    if location:
        parts.append(f"📍 <b>Локація:</b> {location}")

    if gps_link and "http" in str(gps_link):
        parts.append(f"🗺 <b>Мапа:</b> <a href='{gps_link}'>Переглянути на карті</a>")

    if main_emp and main_emp.get("name"):
        parts.append(f"👷 <b>Відповідальний:</b> {main_emp['name']}")

    parts.append("➖➖➖➖➖➖➖➖")

    # --- ТЕХНІЧНІ ДАНІ ---
    if inst.get("capacity_kw"):
        parts.append(f"⚡ <b>Потужність:</b> {inst['capacity_kw']} кВт")
    if inst.get("quant_phase"):
        parts.append(f"🔌 <b>Фази:</b> {inst['quant_phase']}")
    if inst.get("station_type"):
        parts.append(f"⚙️ <b>Тип станції:</b> {inst['station_type']}")
    if inst.get("mount_type"):
        parts.append(f"🔩 <b>Монтаж:</b> {inst['mount_type']}")

    # --- БАНК ---
    bank_val = inst.get("bank")
    if bank_val:
        parts.append(f"🏦 <b>Банк:</b> {bank_val}")

    if inst.get("notes"):
        parts.append(f"\n📝 <b>Примітки:</b>\n{inst['notes']}")

    parts.append(f"\n🔄 <i>Інфо оновлено: {updated_local}</i>")

    if creator_name:
        parts.append(f"👤 <i>Додав: {creator_name}</i>")

    return topic_name, "\n".join(parts)


# ================== MAIN PROCESSING LOGIC ==================

async def process_installation_update(bot: Bot, inst_row: Dict[str, Any]):
    inst_id = inst_row["id"]
    # Що саме зараз робимо і з чим — щоб у помилці було видно, на якому кроці впало
    step = "завантаження даних об'єкта"
    label = f"id {inst_id}"

    try:
        # 1. Отримуємо всі дані про об'єкт
        data = supabase.table("installations").select(
            "*, client:clients(*), main_emp:employees!installations_responsible_emp_id_fkey(*)"
        ).eq("id", inst_id).single().execute().data

        label = f"{data.get('name') or 'без назви'} #{data.get('custom_id')}"
        client = data.get("client") or {}
        main_emp = data.get("main_emp")

        # 2. Шукаємо ім'я того, хто додав (через creator_email)
        creator_name = None
        creator_email = data.get("creator_email")
        if creator_email:
            emp_resp = supabase.table("employees").select("name").eq("email", creator_email).execute()
            if emp_resp.data:
                creator_name = emp_resp.data[0]["name"]

        # 3. Отримуємо відформатований текст і правильну назву топіка
        step = "формування паспорта об'єкта"
        topic_name, passport_text = format_passport_message(data, client, main_emp, creator_name)

        # 4. Перевіряємо, чи є вже гілка для ЦЬОГО об'єкта
        msg_resp = supabase.table("installation_messages") \
            .select("*") \
            .eq("installation_id", inst_id) \
            .execute()

        existing_msg = msg_resp.data[0] if msg_resp.data else None

        if not existing_msg:
            # === СТВОРЕННЯ НОВОЇ ГІЛКИ (ТОПІКА) ===
            step = "створення нової гілки об'єкта"
            topic = await bot.create_forum_topic(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                name=topic_name
            )
            thread_id = topic.message_thread_id

            step = "надсилання паспорта в нову гілку"
            msg = await bot.send_message(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                message_thread_id=thread_id,
                text=passport_text,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True
            )

            step = "закріплення паспорта в гілці"
            await bot.pin_chat_message(TELEGRAM_SUPERGROUP_ID, msg.message_id)

            # Записуємо гілку в БД
            step = "запис гілки в базу (installation_messages)"
            supabase.table("installation_messages").insert({
                "installation_id": inst_id,
                "thread_id": thread_id,
                "message_id": msg.message_id
            }).execute()

        else:
            # === РЕДАГУВАННЯ ІСНУЮЧОЇ ГІЛКИ ===
            thread_id = existing_msg["thread_id"]
            msg_id = existing_msg["message_id"]

            step = "оновлення паспорта в гілці"
            try:
                await bot.edit_message_text(
                    text=passport_text,
                    chat_id=TELEGRAM_SUPERGROUP_ID,
                    message_id=msg_id,
                    parse_mode=ParseMode.HTML,
                    disable_web_page_preview=True
                )
            except TelegramBadRequest as e:
                # Текст не змінився — це нормально; решту показуємо
                if not is_not_modified(e):
                    raise

            step = "перейменування гілки"
            try:
                await bot.edit_forum_topic(
                    chat_id=TELEGRAM_SUPERGROUP_ID,
                    message_thread_id=thread_id,
                    name=topic_name
                )
            except TelegramBadRequest as e:
                # TOPIC_NOT_MODIFIED — назва вже правильна, усе гаразд
                if not is_not_modified(e):
                    raise

        # Закриваємо подію
        step = "позначка «гілку оновлено» в базі"
        supabase.table("installations").update({"topic_updated": False}).eq("id", inst_id).execute()

    except Exception as e:
        # Telegram відмовив по суті (гілку видалили, немає прав тощо) — повтор
        # щохвилини нічого не дасть, лише засипле чат помилками. Знімаємо
        # позначку: гілка оновиться при наступній зміні об'єкта. Збій мережі
        # чи бази — позначку лишаємо, бот спробує ще раз.
        final = isinstance(e, TelegramBadRequest)
        extra = {"Обʼєкт": label}
        if final:
            extra["Повтор"] = "не повторюємо — оновиться при наступній зміні об'єкта"
        await report_error(bot, MODULE, step, e, extra)
        if final:
            try:
                supabase.table("installations").update({"topic_updated": False}).eq("id", inst_id).execute()
            except Exception:
                pass


# ================== MONITORS ==================

async def installation_monitor_task(bot: Bot):
    """Слідкує за змінами безпосередньо в об'єктах"""
    while True:
        try:
            resp = supabase.table("installations") \
                .select("id") \
                .eq("topic_updated", True) \
                .execute()

            for inst in resp.data or []:
                await process_installation_update(bot, inst)
                await asyncio.sleep(2)

        except Exception as e:
            await report_error(bot, MODULE, "пошук об'єктів, змінених на сайті", e)

        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


async def client_update_monitor_task(bot: Bot):
    """
    Слідкує за змінами в таблиці clients.
    Якщо клієнта відредаговано (змінився телефон, компанія), оновлює всі його об'єкти в Telegram.
    """
    while True:
        try:
            # Шукаємо клієнтів, яких змінили
            resp = supabase.table("clients") \
                .select("id, name") \
                .or_("telegram_synced.is.null,telegram_synced.eq.false") \
                .execute()

            for client_row in resp.data or []:
                client_id = client_row["id"]
                try:
                    # Знаходимо всі об'єкти цього клієнта
                    inst_resp = supabase.table("installations") \
                        .select("id") \
                        .eq("client_id", client_id) \
                        .execute()

                    # Оновлюємо гілку кожного об'єкта
                    for inst in inst_resp.data or []:
                        await process_installation_update(bot, inst)
                        await asyncio.sleep(1)  # Затримка, щоб не спамити Telegram API

                    # Позначаємо клієнта як успішно синхронізованого
                    supabase.table("clients").update({"telegram_synced": True}).eq("id", client_id).execute()
                except Exception as e:
                    await report_error(bot, MODULE, "оновлення гілок після зміни клієнта", e, {
                        "Клієнт": f"{client_row.get('name') or 'без імені'} (id {client_id})",
                    })

        except Exception as e:
            await report_error(bot, MODULE, "пошук клієнтів, змінених на сайті", e)

        await asyncio.sleep(POLLING_INTERVAL_SECONDS)


# ================== REGISTER ==================

def register_installation_monitor(dp: Dispatcher, bot: Bot):
    """Викликати в головному файлі бота (main.py) замість старих функцій"""
    asyncio.create_task(installation_monitor_task(bot))
    asyncio.create_task(client_update_monitor_task(bot))

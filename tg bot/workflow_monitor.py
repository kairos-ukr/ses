import asyncio
from typing import Optional, Tuple

from aiogram import Bot, Dispatcher
from aiogram.types import URLInputFile
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramRetryAfter
from supabase import create_client, Client

# --- КОНФІГ ---
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    TELEGRAM_SUPERGROUP_ID,
    POLLING_INTERVAL_SECONDS
)
from notifier import esc, report_error, send_admin_text

# Ініціалізація Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MODULE = "Етапи обʼєктів (гілки)"

# --- СЛОВНИКИ ---

STAGES_LABELS = {
    'tech_review': '📏 Заміри',
    'tech_measurements': '📏 Проведення замірів',
    'project': '📐 Проект',
    'project_design': '📐 Проект (Розробка)',
    'project_approval': '🎨 Затвердження варіанту',
    'proposal': '📑 КП',
    'commercial_proposal': '📑 КП',
    'proposal_main': '📑 Комерційна пропозиція',
    'advance_payment': '💸 Аванс',
    'equipment': '🛒 Обладнання',
    'equipment_main': '🛒 Закупівля обладнання',
    'complectation': '📦 Комплектація',
    'comp_materials': '📦 Комплектація матеріалів',
    'comp_protection': '⚡ Комплектація ел. захисту',
    'installation': '🏗 Монтаж',
    'inst_structure': '🏗 Монтаж конструкції',
    'inst_panels': '☀️ Встановлення панелей',
    'inst_cabling': '🔌 Прокладання траси DC',
    'inst_grounding': '⬇️ Заземлення',
    'inst_inverter': '🔋 Підключення інвертора',
    'grid_connection': '⚡ Мережа',
    'grid_power': '⚡ Заведення потужності',
    'monitoring_setup': '🚀 Запуск',
    'mon_launch_station': '🚀 Запуск станції'
}

STATUS_LABELS = {
    'todo': '⚪ Не почато',
    'not_started': '⚪ Не розпочато',
    'waiting_start': '⏳ Очікуємо старт',
    'in_progress': '🔨 В роботі',
    'started': '🔨 Розпочато',
    'done': '✅ Виконано',
    'completed': '✅ Виконано',
    'waiting': '⏳ Очікуємо',
    'waiting_client': '🟠 Очікуємо від клієнта',
    'on_site': '🚙 Виконали на виїзді',
    'done_on_site': '🚙 Виконали на виїзді',
    'created': '📝 Зроблено',
    'approved': '🤝 Погоджено',
    'ordered': '🛒 Замовлено',
    'arrived': '📦 Прибуло',
    'docs_submitted': '🗂 Документи подані',
    'launched': '🟢 Станція запущена',
    'selection_needed': '🤔 Очікує вибору',
    'selected': '🎯 Обрано'
}

# --- СИСТЕМНІ КОМЕНТАРІ ---
# Коментарі, які сайт додає сам (напр. «Специфікацію успішно оцифровано…»),
# команді в гілці об'єкта не потрібні. У гілку йде лише зміна статусу,
# а сам коментар — адміну в особисті.
SYSTEM_COMMENT_MARKERS = ("оцифровано",)

# Події, про які адміну вже написали: якщо відправка в гілку зірвалась
# і подія піде на повтор, адмін не отримає те саме вдруге
_admin_notified_events: set = set()


def is_system_comment(comment: Optional[str]) -> bool:
    text = (comment or "").lower()
    return any(marker in text for marker in SYSTEM_COMMENT_MARKERS)


def get_status_text(status_key: str) -> str:
    return STATUS_LABELS.get(status_key, status_key)

def get_stage_text(stage_key: str) -> str:
    return STAGES_LABELS.get(stage_key, stage_key)

# --- ДОПОМІЖНІ ЗАПИТИ ---

async def get_employee_name(emp_custom_id: int) -> str:
    """
    Отримує ім'я співробітника по його custom_id з таблиці employees.
    """
    if not emp_custom_id:
        return "Не вказано"
    rows = supabase.table('employees').select('name').eq('custom_id', emp_custom_id).limit(1).execute().data
    return rows[0]['name'] if rows else str(emp_custom_id)


async def get_installation_topic(custom_id: int) -> Tuple[Optional[int], Optional[str]]:
    """(thread_id гілки, назва об'єкта). Гілки може не бути — тоді (None, назва)."""
    inst = supabase.table('installations').select('id, name').eq('custom_id', custom_id).limit(1).execute().data
    if not inst:
        return None, None
    msg = supabase.table('installation_messages').select('thread_id') \
        .eq('installation_id', inst[0]['id']).limit(1).execute().data
    return (msg[0]['thread_id'] if msg else None), inst[0].get('name')


async def get_thread_id_by_custom_id(custom_id: int) -> Optional[int]:
    thread_id, _ = await get_installation_topic(custom_id)
    return thread_id

# --- ОБРОБКА 3D ВІЗУАЛІЗАЦІЙ ---

async def process_design_approvals(bot: Bot):
    try:
        response = supabase.table('project_design_variants')\
            .select('*')\
            .eq('is_selected', True)\
            .eq('telegram_sent', False)\
            .execute()

        variants = response.data
        if not variants:
            return
    except Exception as e:
        await report_error(bot, MODULE, "читання затверджених 3D-візуалізацій", e)
        return

    for var in variants:
        var_id = var['id']
        inst_custom_id = var['installation_custom_id']
        file_id = var['google_file_id']
        inst_name = None

        try:
            thread_id, inst_name = await get_installation_topic(inst_custom_id)
            if not thread_id:
                supabase.table('project_design_variants').update({'telegram_sent': True}).eq('id', var_id).execute()
                continue

            image_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1600"
            caption = (
                "✅ <b>Затверджено 3D візуалізацію</b>\n\n"
                "Працюємо згідно цього варіанту.\n"
                "<i>(План вигляду монтажу зафіксовано)</i>"
            )

            await bot.send_photo(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                message_thread_id=thread_id,
                photo=URLInputFile(image_url, filename=f"design_{inst_custom_id}.jpg"),
                caption=caption,
                parse_mode=ParseMode.HTML
            )
            supabase.table('project_design_variants').update({'telegram_sent': True}).eq('id', var_id).execute()
            await asyncio.sleep(1.0)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
        except Exception as e:
            await report_error(bot, MODULE, "надсилання затвердженої 3D-візуалізації в гілку об'єкта", e, {
                "Обʼєкт": f"{inst_name or 'без назви'} #{inst_custom_id}",
                "Файл Google Drive": file_id,
                "Варіант": var_id,
            })
            # Щоб не зациклитись на тому самому файлі, позначаємо як оброблене
            supabase.table('project_design_variants').update({'telegram_sent': True}).eq('id', var_id).execute()

# --- ОБРОБКА ПОДІЙ WORKFLOW ---

async def process_workflow_events(bot: Bot):
    try:
        # Вибираємо події, які ще не відправлені в Telegram
        events = supabase.table('workflow_events')\
            .select('*')\
            .eq('telegram_sent', False)\
            .order('created_at')\
            .execute().data
    except Exception as e:
        await report_error(bot, MODULE, "читання нових подій етапів", e)
        return

    if not events:
        return

    print(f"🔄 Processing {len(events)} workflow events...")

    for event in events:
        event_id = event['id']
        new_status_raw = event['new_status']
        inst_custom_id = event['installation_custom_id']
        stage_text = get_stage_text(event['stage_key'])
        inst_name = None

        try:
            # 1. Ігноруємо 'active' (зміну глобальної вкладки), щоб не було дублів
            if new_status_raw == 'active':
                supabase.table('workflow_events').update({'telegram_sent': True}).eq('id', event_id).execute()
                continue

            thread_id, inst_name = await get_installation_topic(inst_custom_id)
            comment = (event.get('comment') or '').strip()

            # 2. Системний коментар — адміну в особисті, не в гілку
            if is_system_comment(comment):
                if event_id not in _admin_notified_events:
                    lines = [
                        "🤖 <b>Системна подія</b>",
                        f"<b>Обʼєкт:</b> {esc(inst_name or 'без назви')} #{inst_custom_id}",
                        f"<b>Етап:</b> {esc(stage_text)} → {esc(get_status_text(new_status_raw))}",
                    ]
                    if event.get('actor'):
                        lines.append(f"<b>Хто:</b> {esc(event['actor'])}")
                    lines.append(esc(comment))
                    await send_admin_text(bot, "\n".join(lines))
                    _admin_notified_events.add(event_id)
                comment = ''

            if not thread_id:
                # Якщо гілки немає, просто помічаємо як відправлене
                supabase.table('workflow_events').update({'telegram_sent': True}).eq('id', event_id).execute()
                continue

            # --- ПІДГОТОВКА ТЕКСТУ ---
            new_status_text = get_status_text(new_status_raw)

            responsible_line = ""
            if event.get('new_responsible'):
                emp_name = await get_employee_name(event['new_responsible'])
                responsible_line = f"👤 Відповідальний: <b>{esc(emp_name)}</b>"

            msg_lines = [f"<b>{stage_text}</b>"]
            msg_lines.append(f"<blockquote>Статус: {new_status_text}</blockquote>")
            if responsible_line:
                msg_lines.append(responsible_line)
            if comment:
                msg_lines.append(f"\n{esc(comment)}")

            await bot.send_message(
                chat_id=TELEGRAM_SUPERGROUP_ID,
                message_thread_id=thread_id,
                text="\n".join(msg_lines),
                parse_mode=ParseMode.HTML
            )

            supabase.table('workflow_events').update({'telegram_sent': True}).eq('id', event_id).execute()
            await asyncio.sleep(1.0)

        except TelegramRetryAfter as e:
            print(f"⏳ Flood limit. Waiting {e.retry_after}s...")
            await asyncio.sleep(e.retry_after)
        except Exception as e:
            await report_error(bot, MODULE, "надсилання зміни етапу в гілку об'єкта", e, {
                "Обʼєкт": f"{inst_name or 'без назви'} #{inst_custom_id}",
                "Етап": f"{stage_text} → {get_status_text(new_status_raw)}",
                "Подія": event_id,
            })
            # Щоб не блокувати чергу, все одно маркуємо як відправлене
            try:
                supabase.table('workflow_events').update({'telegram_sent': True}).eq('id', event_id).execute()
            except Exception:
                pass

# --- ГОЛОВНИЙ ЦИКЛ ---

async def main_monitor_loop(bot: Bot):
    print("🚀 Workflow Monitor Started")
    while True:
        await process_workflow_events(bot)
        await process_design_approvals(bot)
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)

def register_workflow_monitor(dp: Dispatcher, bot: Bot):
    asyncio.create_task(main_monitor_loop(bot))

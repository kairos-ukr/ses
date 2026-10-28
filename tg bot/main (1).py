# main.py
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from microtask_manager import register_handlers_microtasks
from installation_monitor import register_installation_monitor
from procurement_monitor import register_background_tasks
from parcel_monitor import register_parcel_monitor
from birthday_monitor import register_birthday_monitor
from workflow_monitor import register_workflow_monitor
from notes_monitor import register_notes_monitor
from personal_notifications import register_personal_notifications
from montazh_reports import register_montazh_reports
from bell_relay import register_bell_relay
from notifier import AdminLogHandler

# Імпортуємо конфігурацію
from config import BOT_TOKEN

# Імпортуємо реєстратори
from schedule_manager import register_handlers_schedule, setup_scheduler

async def main():
    # Налаштування логування
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    )
    logger = logging.getLogger(__name__)
    logger.info("🚀 Запуск бота...")

    # Ініціалізація бота та диспетчера
    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    dp = Dispatcher()

    # Помилки з модулів, що пишуть у logging (посилки, дні народження,
    # обробка повідомлень), теж ідуть адміну — зрозумілим текстом
    logging.getLogger().addHandler(AdminLogHandler(bot))

    # ====================================================
    # РЕЄСТРАЦІЯ МОДУЛІВ
    # ====================================================

    # Реєструємо обробники для розкладу
    register_handlers_schedule(dp)

    # Реєструємо обробники для мікрозадач
    register_handlers_microtasks(dp, bot)

    # ЦЕЙ ОДИН МОДУЛЬ ТЕПЕР ВІДПОВІДАЄ ЗА СТВОРЕННЯ ГІЛОК ТА ОНОВЛЕННЯ ІНФО (ОБ'ЄКТИ + КЛІЄНТИ)
    register_installation_monitor(dp, bot)

    # Інші монітори
    register_background_tasks(dp, bot)
    register_workflow_monitor(dp, bot)
    register_notes_monitor(dp, bot)

    # Налаштовуємо та запускаємо планувальник
    scheduler = setup_scheduler(bot)
    register_parcel_monitor(scheduler, bot)
    register_birthday_monitor(scheduler, bot)
    # Особисті: задачі, призначення на етапи, забезпечення, низькі залишки, /start, /my
    register_personal_notifications(dp, bot, scheduler)
    # Денні звіти бригад з додатка «Монтаж»: нагадування й публікація в гілки
    register_montazh_reports(scheduler, bot)
    # Усе з дзвіночка CRM, чого бот не надсилав сам (графік, призначення, звіти) — особисто в Telegram
    register_bell_relay(scheduler, bot)
    scheduler.start()
    logger.info("⏰ Планувальник завдань запущено.")

    # Видаляємо вебхук перед запуском
    await bot.delete_webhook(drop_pending_updates=True)

    # Запускаємо бота
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("👋 Бот зупинено.")

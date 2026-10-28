import logging
from datetime import datetime
from supabase import create_client, Client
from aiogram import Bot

# Імпортуємо налаштування
from config import (
    SUPABASE_URL, 
    SUPABASE_KEY, 
    TOPIC_SUPERGROUP_ID, 
    BIRTHDAY_TOPIC_ID,
    ADMIN_ID,           
    TZ
)

logger = logging.getLogger(__name__)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def check_birthdays_job(bot: Bot):
    try:
        # 1. Фіксуємо "СЬОГОДНІ"
        today = datetime.now()
        current_day = today.day      
        current_month = today.month
        current_year = today.year  # Потрібен для розрахунку віку

        response = supabase.table('employees').select('name, date_birth').execute()
        employees = response.data
        
        # Список словників: [{'name': 'Ivan', 'age': 30, 'is_jubilee': True}, ...]
        birthday_people = []
        error_logs = [] 

        for emp in employees:
            date_str = emp.get('date_birth')
            name = emp.get('name')
            
            if not date_str: continue
            
            try:
                birth_date = datetime.strptime(date_str, "%Y-%m-%d")

                # ЖОРСТКЕ ПОРІВНЯННЯ (Місяць і День)
                if birth_date.month == current_month and birth_date.day == current_day:
                    
                    # Розраховуємо вік
                    age = current_year - birth_date.year
                    
                    # Перевіряємо, чи це ювілей (ділиться на 5: 20, 25, 30, 35...)
                    # Також можна додати умову, щоб вік був > 0
                    is_jubilee = (age % 5 == 0) and (age > 0)
                    
                    birthday_people.append({
                        "name": name if name else "Колега",
                        "age": age,
                        "is_jubilee": is_jubilee
                    })

            except ValueError:
                error_logs.append(f"⚠️ {name}: {date_str}")
                continue

        # Якщо є іменинники -> Вітаємо
        if birthday_people:
            await send_birthday_message(bot, birthday_people)

        # Якщо є помилки -> Звіт адміну
        if error_logs:
            try:
                await bot.send_message(chat_id=ADMIN_ID, text="Помилки дати:\n" + "\n".join(error_logs))
            except: pass 

    except Exception as e:
        logger.error(f"❌ Помилка Birthday Monitor: {e}")

async def send_birthday_message(bot: Bot, people_list: list):
    """
    Формує повідомлення з урахуванням віку та ювілеїв.
    people_list = [{'name': str, 'age': int, 'is_jubilee': bool}, ...]
    """
    
    topic_id = BIRTHDAY_TOPIC_ID if BIRTHDAY_TOPIC_ID else None

    # --- ВАРІАНТ 1: ОДНА ЛЮДИНА ---
    if len(people_list) == 1:
        person = people_list[0]
        name = person['name']
        age = person['age']
        
        if person['is_jubilee']:
            # Текст для ювілею
            text = (
                f"🌟 <b>УВАГА! СЬОГОДНІ ОСОБЛИВИЙ ДЕНЬ!</b> 🌟\n\n"
                f"Свій Ювілей святкує наш колега: <b>{name}</b>! 🎂\n\n"
                f"Вітаємо з <b>{age}-річчям</b>! 🥳\n"
                f"Це чудова дата, час розквіту сил та нових звершень. "
                f"Бажаємо, щоб кожен день приносив нові перемоги, фінанси примножувались, "
                f"а життя дарувало тільки яскраві емоції! 🚀💎"
            )
        else:
            # Текст звичайний
            text = (
                f"🎈 <b>Сьогодні святкує День Народження!</b> 🎈\n\n"
                f"Вітаємо нашого колегу: <b>{name}</b>! 🎂\n\n"
                f"Бажаємо міцного здоров'я, сталевих нервів, мирного неба "
                f"та завжди гарного настрою! Нехай щастить у всьому! 🎁"
            )

    # --- ВАРІАНТ 2: ДЕКІЛЬКА ЛЮДЕЙ ---
    else:
        intro = "🎈 <b>У нас сьогодні багате свято! Вітаємо іменинників:</b> 🎈\n\n"
        list_lines = []
        
        for person in people_list:
            name = person['name']
            age = person['age']
            
            if person['is_jubilee']:
                # Виділяємо ювіляра особливим значком
                line = f"🔥 <b>{name}</b> — вітаємо з <b>{age}-річчям</b>! (Ювілей! 🌟)"
            else:
                line = f"🎉 <b>{name}</b>"
            
            list_lines.append(line)
            
        names_str = "\n".join(list_lines)
        
        outro = (
            "\n\nВітаємо вас, друзі! Бажаємо здійснення всіх мрій, "
            "кар'єрного зростання, легких робочих буднів та шаленого щастя! 🥂"
        )
        
        text = intro + names_str + outro

    try:
        await bot.send_message(
            chat_id=TOPIC_SUPERGROUP_ID, 
            message_thread_id=topic_id,
            text=text,
            parse_mode="HTML"
        )
    except Exception as e:
        logger.error(f"❌ Не вдалося надіслати в групу: {e}")

def register_birthday_monitor(scheduler, bot: Bot):
    scheduler.add_job(
        check_birthdays_job,
        trigger='cron',
        hour=8, 
        minute=0,
        timezone=TZ,
        args=[bot]
    )
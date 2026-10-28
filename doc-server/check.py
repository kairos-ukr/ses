"""
Перевірка налаштувань сервера документів.

Нічого не змінює й нікому не пише — лише читає. Запускати після
деплою або коли щось не працює:

    python check.py
"""
import asyncio

import httpx

import config
from db import Db, DbError
from drive import Drive, DriveError
from folders import match_project_folder

OK, BAD, WARN = "  [ok]", "  [!!]", "  [??]"


async def check_supabase(db: Db) -> list:
    print("1) Supabase")
    try:
        rows = await db._req("GET", "installations", params={
            "select": "id,custom_id,name", "order": "id.desc", "limit": "1000"})
        print(f"{OK} обʼєктів прочитано: {len(rows)}")
    except DbError as e:
        print(f"{BAD} installations: {e}")
        return []
    try:
        threads = await db._req("GET", "installation_messages", params={"select": "installation_id", "limit": "1000"})
        print(f"{OK} гілок Telegram у базі: {len(threads)}")
    except DbError as e:
        print(f"{BAD} installation_messages: {e}")
    try:
        saved = await db._req("GET", "drive_folders", params={"select": "folder_key", "limit": "1000"})
        print(f"{OK} таблиця drive_folders є, запамʼятовано папок: {len(saved)}")
    except DbError as e:
        print(f"{WARN} таблиці drive_folders немає — виконайте db/2026-10_drive_folders.sql ({e.code or e.status})")
    return rows


async def check_drive(drive: Drive, installations: list) -> None:
    print("2) Google Drive")
    try:
        root = await drive.get(config.DRIVE_ROOT_FOLDER_ID, "id,name")
    except DriveError as e:
        print(f"{BAD} {e}")
        return
    if not root:
        print(f"{BAD} головну папку {config.DRIVE_ROOT_FOLDER_ID} не видно цим акаунтом")
        return
    folders = await drive.root_folders()
    print(f"{OK} головна папка «{root['name']}», папок усередині: {len(folders)}")

    matched_ids = set()
    matched = 0
    for inst in installations:
        f = match_project_folder(folders, inst["custom_id"])
        if f:
            matched += 1
            matched_ids.add(f["id"])
    print(f"{OK} обʼєктів зі знайденою старою папкою: {matched} з {len(installations)}")
    stray = [f["name"] for f in folders if f["id"] not in matched_ids]
    if stray:
        print(f"{WARN} папки, не привʼязані до жодного обʼєкта ({len(stray)}), перші 15:")
        for name in stray[:15]:
            print(f"       · {name}")


async def check_telegram(http: httpx.AsyncClient) -> None:
    print("3) Telegram")
    api = f"https://api.telegram.org/bot{config.BOT_TOKEN}"
    me = (await http.get(f"{api}/getMe")).json()
    if not me.get("ok"):
        print(f"{BAD} токен бота не працює: {me.get('description')}")
        return
    bot = me["result"]
    print(f"{OK} бот @{bot.get('username')}")
    chat = (await http.get(f"{api}/getChat", params={"chat_id": config.TELEGRAM_CHAT_ID})).json()
    if not chat.get("ok"):
        print(f"{BAD} група {config.TELEGRAM_CHAT_ID}: {chat.get('description')}")
        return
    c = chat["result"]
    print(f"{OK} група «{c.get('title')}», гілки (форум): {'так' if c.get('is_forum') else 'НІ'}")
    member = (await http.get(f"{api}/getChatMember",
                             params={"chat_id": config.TELEGRAM_CHAT_ID, "user_id": bot["id"]})).json()
    status = (member.get("result") or {}).get("status")
    # Щоб писати в гілки, адміном бути не обов'язково — досить бути в групі
    mark = OK if status in ("administrator", "creator", "member") else BAD
    print(f"{mark} статус бота в групі: {status}")


async def main() -> None:
    async with httpx.AsyncClient(timeout=30) as http:
        installations = await check_supabase(Db(http))
        await check_drive(Drive(http), installations)
        await check_telegram(http)


if __name__ == "__main__":
    asyncio.run(main())

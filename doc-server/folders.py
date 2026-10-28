"""
Папка об'єкта на Диску: знайти або створити — і запам'ятати.

Порядок пошуку:
  1. пам'ять процесу;
  2. таблиця drive_folders (folder_key = custom_id об'єкта);
  3. папка ліда, з якого зробили об'єкт: її переносимо з «Ліди» в головну
     папку й перейменовуємо — файли ліда одразу стають файлами об'єкта;
  4. Диск: папка першого рівня з номером об'єкта в назві — так
     підхоплюються папки, які створив ще старий сервер;
  5. нова папка «Назва об'єкта #1234» — так само звуться гілки в Telegram.
Знайдене на кроках 3–5 записується в drive_folders, щоб далі не шукати.

Папка ліда: «Ліди / Лід #12 Іван Петренко», folder_key = 'lead-12'.
Поки лід — файли лише на Диску. Коли папка ліда стала папкою об'єкта,
викликається on_lead_adopted (main.py) — він шле ці файли в гілку
об'єкта в Telegram.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import defaultdict
from typing import Optional

import config
from db import Db, DbError
from drive import Drive, DriveError
from naming import clean, file_name, next_index

log = logging.getLogger("folders")

WAREHOUSE_KEY = "warehouse"
LEADS_KEY = "leads"
LEADS_FOLDER_NAME = getattr(config, "LEADS_FOLDER_NAME", "Ліди")
RESERVE_SECONDS = 900


def lead_key(lead_id) -> str:
    return f"lead-{int(lead_id)}"


def object_folder_name(inst: dict) -> str:
    title = clean(inst.get("name"), 90) or "Обʼєкт"
    return f"{title} #{inst['custom_id']}"


def match_project_folder(folders: list, custom_id: int) -> Optional[dict]:
    """Стара папка об'єкта: «1234», «1234 Іваненко», «Іваненко #1234», «Іваненко (1234)»."""
    cid = str(custom_id)
    loose_re = re.compile(rf"^{cid}(?!\d)|#\s*{cid}(?!\d)|\(\s*{cid}\s*\)\s*$")
    exact, loose = [], []
    for f in folders:
        name = (f.get("name") or "").strip()
        if name == cid:
            exact.append(f)
        elif loose_re.search(name) and not name.lower().startswith("склад"):
            loose.append(f)
    pick = exact or loose
    if not pick:
        return None
    if len(pick) > 1:
        log.warning("Для об'єкта #%s на Диску кілька папок (%s) — беру найстаршу",
                    cid, ", ".join(p.get("name", "") for p in pick))
    return {"id": pick[0]["id"], "name": pick[0]["name"]}


class Folders:
    def __init__(self, drive: Drive, db: Db):
        self.drive = drive
        self.db = db
        self._cache: dict = {}
        self._locks = defaultdict(asyncio.Lock)
        self._name_locks = defaultdict(asyncio.Lock)
        self._reserved = defaultdict(dict)
        # async (inst, lead, folder) — папка ліда щойно стала папкою об'єкта
        self.on_lead_adopted = None
        self._tasks: set = set()

    async def for_installation(self, inst: dict, create: bool = True) -> Optional[dict]:
        return await self._resolve(str(inst["custom_id"]), inst, create)

    async def warehouse(self, create: bool = True) -> Optional[dict]:
        return await self._resolve(WAREHOUSE_KEY, None, create)

    async def for_lead(self, lead: dict, create: bool = True) -> Optional[dict]:
        key = lead_key(lead["id"])
        if key in self._cache:
            return self._cache[key]
        async with self._locks[key]:
            if key in self._cache:
                return self._cache[key]
            folder = await self._from_db(key)
            if not folder and create:
                parent = await self._resolve(LEADS_KEY, None, True, LEADS_FOLDER_NAME)
                name = f"Лід #{lead['id']} {clean(lead.get('contact_name'), 80)}".strip()
                folder = await self._new_folder(name, parent["id"])
                await self.db.folder_save(key, folder["id"], folder["name"], None)
            if folder:
                self._cache[key] = folder
            return folder

    async def _resolve(self, key: str, inst: Optional[dict], create: bool,
                       name: Optional[str] = None) -> Optional[dict]:
        if key in self._cache:
            return self._cache[key]
        async with self._locks[key]:
            if key in self._cache:
                return self._cache[key]

            folder = await self._from_db(key)
            if not folder:
                if inst:
                    folder = await self._adopt_lead_folder(inst)
                if not folder:
                    folder = await self._discover(inst, name)
                if not folder and create:
                    folder = await self._create(inst, name)
                if folder:
                    await self.db.folder_save(key, folder["id"], folder["name"],
                                              int(inst["custom_id"]) if inst else None)
            if folder:
                self._cache[key] = folder
            return folder

    async def _from_db(self, key: str) -> Optional[dict]:
        try:
            folder_id = await self.db.folder_get(key)
        except DbError as e:
            log.error("drive_folders недоступна, шукаю папку на Диску: %s", e)
            return None
        if not folder_id:
            return None
        meta = await self.drive.get(folder_id, "id,name,trashed,parents")
        if not meta or meta.get("trashed"):
            log.warning("Папки %s з бази на Диску вже немає — знайду або створю нову", folder_id)
            return None
        if config.DRIVE_ROOT_FOLDER_ID in (meta.get("parents") or []):
            self.drive.mark_inside_root(meta["id"])
        return {"id": meta["id"], "name": meta["name"]}

    async def _adopt_lead_folder(self, inst: dict) -> Optional[dict]:
        """Об'єкт зробили з ліда, у якого вже є файли: папка ліда стає папкою об'єкта."""
        try:
            lead = await self.db.lead_for_installation(int(inst["custom_id"]))
            if not lead:
                return None
            key = lead_key(lead["id"])
            folder = self._cache.get(key) or await self._from_db(key)
            if not folder:
                return None
            meta = await self.drive.get(folder["id"], "id,parents")
            moved = await self.drive.move(folder["id"], config.DRIVE_ROOT_FOLDER_ID,
                                          (meta or {}).get("parents") or [], object_folder_name(inst))
        except (DbError, DriveError) as e:
            log.error("Папку ліда для об'єкта #%s не перенесено: %s", inst["custom_id"], e)
            return None
        adopted = {"id": moved["id"], "name": moved["name"]}
        self._cache[key] = adopted
        await self.db.folder_save(key, adopted["id"], adopted["name"], int(inst["custom_id"]))
        log.info("Папку ліда #%s перенесено в об'єкт: «%s»", lead["id"], adopted["name"])
        if self.on_lead_adopted:
            # У фоні: сайт не чекає, поки файли підуть у Telegram
            task = asyncio.create_task(self.on_lead_adopted(inst, lead, adopted))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        return adopted

    async def _discover(self, inst: Optional[dict], name: Optional[str] = None) -> Optional[dict]:
        if inst:
            return match_project_folder(await self.drive.root_folders(), int(inst["custom_id"]))
        found = await self.drive.find_root_folder(name or config.WAREHOUSE_FOLDER_NAME)
        return {"id": found["id"], "name": found["name"]} if found else None

    async def _create(self, inst: Optional[dict], name: Optional[str] = None) -> dict:
        name = object_folder_name(inst) if inst else (name or config.WAREHOUSE_FOLDER_NAME)
        return await self._new_folder(name, config.DRIVE_ROOT_FOLDER_ID)

    async def _new_folder(self, name: str, parent_id: str) -> dict:
        folder = await self.drive.create_folder(name, parent_id)
        if config.PUBLIC_LINKS:
            await self.drive.share_public(folder["id"])
        log.info("Створено папку «%s» (%s)", name, folder["id"])
        return {"id": folder["id"], "name": folder["name"]}

    async def allocate_names(self, folder_id: str, base: str, exts: list) -> list:
        """Назви «base_(N).ext» без повторів — навіть для двох одночасних завантажень."""
        async with self._name_locks[folder_id]:
            existing = [f.get("name", "") for f in await self.drive.children(folder_id, "name")]
            now = time.time()
            reserved = self._reserved[folder_id]
            for n, ts in list(reserved.items()):
                if now - ts > RESERVE_SECONDS:
                    del reserved[n]
            index = next_index(existing + list(reserved), base)
            names = []
            for ext in exts:
                n = file_name(base, index, ext)
                names.append(n)
                reserved[n] = now
                index += 1
            return names

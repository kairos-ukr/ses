"""
Supabase через REST (PostgREST) — без важкого клієнта, на спільному httpx.

Таблиця drive_folders з'являється міграцією db/2026-10_drive_folders.sql.
Поки її не виконали, сервер працює і без неї: папку об'єкта щоразу
знаходить на Диску за назвою. Наявність таблиці перевіряється знову
раз на 10 хвилин — після міграції перезапуск не потрібен.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

import config

log = logging.getLogger("db")

MISSING_TABLE_CODES = {"PGRST205", "42P01"}
RECHECK_SECONDS = 600


class DbError(Exception):
    def __init__(self, message: str, status: int = 0, code: str = ""):
        super().__init__(message)
        self.status = status
        self.code = code


class Db:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.base = f"{config.SUPABASE_URL}/rest/v1"
        self.headers = {
            "apikey": config.SUPABASE_KEY,
            "Authorization": f"Bearer {config.SUPABASE_KEY}",
        }
        self._folders_missing_since: Optional[float] = None

    async def _req(self, method: str, table: str, *, params=None, json=None, prefer: str = "") -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            r = await self.http.request(method, f"{self.base}/{table}", params=params,
                                        json=json, headers=headers, timeout=20)
        except httpx.HTTPError as e:
            raise DbError(f"Supabase недоступний ({table}): {e}") from e
        if r.status_code >= 400:
            code = ""
            try:
                code = str(r.json().get("code") or "")
            except Exception:
                pass
            raise DbError(f"{method} {table}: HTTP {r.status_code} {r.text[:300]}", r.status_code, code)
        if not r.content:
            return []
        return r.json()

    # ------------------------------------------------------------ об'єкти

    async def installation(self, custom_id: int) -> Optional[dict]:
        rows = await self._req("GET", "installations", params={
            "select": "id,custom_id,name", "custom_id": f"eq.{custom_id}", "limit": "1",
        })
        return rows[0] if rows else None

    async def thread_id(self, installation_id: int) -> Optional[int]:
        """Гілка об'єкта в Telegram. Її створює бот (installation_monitor.py)."""
        rows = await self._req("GET", "installation_messages", params={
            "select": "thread_id", "installation_id": f"eq.{installation_id}",
            "order": "id.asc", "limit": "1",
        })
        return int(rows[0]["thread_id"]) if rows and rows[0].get("thread_id") else None

    # ------------------------------------------------------------ ліди

    async def lead(self, lead_id: int) -> Optional[dict]:
        rows = await self._req("GET", "leads", params={
            "select": "id,contact_name,installation_custom_id", "id": f"eq.{lead_id}", "limit": "1",
        })
        return rows[0] if rows else None

    async def lead_for_installation(self, custom_id: int) -> Optional[dict]:
        """Лід, з якого зробили цей об'єкт (кнопка «Створити об'єкт» у лідах)."""
        rows = await self._req("GET", "leads", params={
            "select": "id,contact_name", "installation_custom_id": f"eq.{custom_id}",
            "order": "id.asc", "limit": "1",
        })
        return rows[0] if rows else None

    # ------------------------------------------------------------ папки Диска

    def _folders_available(self) -> bool:
        if self._folders_missing_since is None:
            return True
        if time.time() - self._folders_missing_since > RECHECK_SECONDS:
            self._folders_missing_since = None
            return True
        return False

    def _folders_missing(self, e: DbError) -> bool:
        if e.code in MISSING_TABLE_CODES or e.status == 404:
            if self._folders_missing_since is None:
                log.warning("Таблиці drive_folders ще немає — виконайте db/2026-10_drive_folders.sql. "
                            "Поки що папки об'єктів шукаються на Диску за назвою.")
            self._folders_missing_since = time.time()
            return True
        return False

    async def folder_get(self, key: str) -> Optional[str]:
        if not self._folders_available():
            return None
        try:
            rows = await self._req("GET", "drive_folders", params={
                "select": "folder_id", "folder_key": f"eq.{key}", "limit": "1",
            })
        except DbError as e:
            if self._folders_missing(e):
                return None
            raise
        return rows[0]["folder_id"] if rows else None

    async def folder_save(self, key: str, folder_id: str, folder_name: str,
                          installation_custom_id: Optional[int]) -> None:
        if not self._folders_available():
            return
        try:
            await self._req("POST", "drive_folders", params={"on_conflict": "folder_key"}, json={
                "folder_key": key,
                "folder_id": folder_id,
                "folder_name": folder_name,
                "installation_custom_id": installation_custom_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, prefer="resolution=merge-duplicates,return=minimal")
        except DbError as e:
            if not self._folders_missing(e):
                log.error("Не вдалося записати папку %s у drive_folders: %s", key, e)

    # ------------------------------------------------------------ 3D-варіанти

    async def design_variants(self, custom_id: int) -> list:
        return await self._req("GET", "project_design_variants", params={
            "select": "*", "installation_custom_id": f"eq.{custom_id}", "order": "created_at.asc",
        })

    async def design_add(self, rows: list) -> list:
        if not rows:
            return []
        res = await self._req("POST", "project_design_variants", json=rows, prefer="return=representation")
        if not res:
            raise DbError("RLS не дав записати project_design_variants — потрібен ключ service_role у config.py")
        return res

    async def design_select(self, variant_id: int, custom_id: int) -> dict:
        rows = await self._req("GET", "project_design_variants", params={
            "select": "id,is_selected,installation_custom_id", "id": f"eq.{variant_id}", "limit": "1",
        })
        if not rows or int(rows[0]["installation_custom_id"]) != int(custom_id):
            raise DbError("Варіант не знайдено", 404)
        was_selected = bool(rows[0].get("is_selected"))

        await self._req("PATCH", "project_design_variants", params={
            "installation_custom_id": f"eq.{custom_id}", "id": f"neq.{variant_id}", "is_selected": "eq.true",
        }, json={"is_selected": False}, prefer="return=minimal")

        patch: dict = {"is_selected": True}
        if not was_selected:
            patch["telegram_sent"] = False  # бот надішле затверджений варіант у гілку
        res = await self._req("PATCH", "project_design_variants", params={"id": f"eq.{variant_id}"},
                              json=patch, prefer="return=representation")
        if not res:
            raise DbError("RLS не дав оновити project_design_variants — потрібен ключ service_role у config.py")
        return res[0]

    async def design_forget_file(self, google_file_id: str) -> None:
        await self._req("DELETE", "project_design_variants",
                        params={"google_file_id": f"eq.{google_file_id}"}, prefer="return=minimal")

"""
Google Drive через REST API v3 — асинхронно, на спільному httpx.

Авторизація: OAuth-застосунок типу «Desktop» (client_id/secret у
config.py) + refresh token, який один раз видає authorize.py. Access
token живе годину й оновлюється сам.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import time
import uuid
from typing import Optional, Tuple

import httpx
from PIL import Image, ImageOps

import config

log = logging.getLogger("drive")

API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
FOLDER_MIME = "application/vnd.google-apps.folder"
FILE_FIELDS = "id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,appProperties,parents"
SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024
ROOT_CACHE_SECONDS = 600
FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,200}$")


class DriveError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class DriveAuthError(DriveError):
    pass


def q_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def folder_link(folder_id: str) -> str:
    return f"https://drive.google.com/drive/folders/{folder_id}"


def load_refresh_token() -> str:
    if (config.GOOGLE_REFRESH_TOKEN or "").strip():
        return config.GOOGLE_REFRESH_TOKEN.strip()
    path = config.GOOGLE_TOKEN_FILE
    if path.exists():
        try:
            return (json.loads(path.read_text("utf-8")).get("refresh_token") or "").strip()
        except Exception as e:
            log.error("Не вдалося прочитати %s: %s", path.name, e)
    return ""


def fit_app_value(value: str, limit: int = 100) -> str:
    """appProperties: ключ+значення до 124 байт UTF-8 — обрізаємо акуратно."""
    raw = str(value or "").encode("utf-8")[:limit]
    return raw.decode("utf-8", errors="ignore")


class Drive:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self._token: Optional[str] = None
        self._token_exp = 0.0
        self._token_lock = asyncio.Lock()
        self._root_cache: Optional[Tuple[float, list]] = None
        self._root_lock = asyncio.Lock()
        self._inside_root: dict = {}  # id → True/False: чи лежить у головній папці
        # id → (час, опис файлу) зі списку документів: мініатюрі не треба
        # ще раз питати Диск, що це за файл (посилання Google живе кілька годин)
        self._meta: dict = {}

    # ------------------------------------------------------------ токен

    async def access_token(self, force: bool = False) -> str:
        async with self._token_lock:
            if not force and self._token and time.time() < self._token_exp - 60:
                return self._token
            refresh = load_refresh_token()
            if not refresh:
                raise DriveAuthError(
                    "Немає доступу до Google Drive: запустіть authorize.py і покладіть "
                    "google_token.json поруч із main.py (або впишіть GOOGLE_REFRESH_TOKEN у config.py)")
            try:
                r = await self.http.post(TOKEN_URL, data={
                    "client_id": config.GOOGLE_CLIENT_ID,
                    "client_secret": config.GOOGLE_CLIENT_SECRET,
                    "refresh_token": refresh,
                    "grant_type": "refresh_token",
                }, timeout=20)
            except httpx.HTTPError as e:
                raise DriveError(f"Google недоступний: {e}") from e
            if r.status_code != 200:
                if "invalid_grant" in r.text:
                    raise DriveAuthError(
                        "Google відкликав доступ (invalid_grant). Запустіть authorize.py ще раз. "
                        "Якщо це повторюється щотижня — застосунок у Google Cloud у режимі «Testing»: "
                        "OAuth consent screen → Publish app (In production).")
                raise DriveAuthError(f"Не вдалося оновити токен Google: HTTP {r.status_code} {r.text[:200]}")
            body = r.json()
            self._token = body["access_token"]
            self._token_exp = time.time() + int(body.get("expires_in", 3600))
            return self._token

    # ------------------------------------------------------------ виклик API

    async def _call(self, method: str, url: str, *, params=None, json_body=None, content=None,
                    headers=None, timeout: float = 60, allow_404: bool = False) -> Optional[httpx.Response]:
        force_refresh = False
        last: Optional[httpx.Response] = None
        for attempt in range(5):
            token = await self.access_token(force=force_refresh)
            force_refresh = False
            h = {"Authorization": f"Bearer {token}"}
            if headers:
                h.update(headers)
            try:
                r = await self.http.request(method, url, params=params, json=json_body, content=content,
                                            headers=h, timeout=timeout)
            except httpx.TransportError as e:
                if attempt >= 3:
                    raise DriveError(f"Google Drive недоступний: {e}") from e
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            last = r
            if r.status_code == 401 and attempt == 0:
                force_refresh = True
                continue
            rate_limited = r.status_code == 403 and ("rateLimitExceeded" in r.text or "userRateLimitExceeded" in r.text)
            if r.status_code in (429, 500, 502, 503, 504) or rate_limited:
                await asyncio.sleep(1.5 * (2 ** attempt))
                continue
            break
        assert last is not None
        if last.status_code == 404 and allow_404:
            return None
        if last.status_code >= 400:
            raise DriveError(_error_text(last), last.status_code)
        return last

    # ------------------------------------------------------------ базові операції

    async def get(self, file_id: str, fields: str = FILE_FIELDS) -> Optional[dict]:
        r = await self._call("GET", f"{API}/files/{file_id}",
                             params={"fields": fields, "supportsAllDrives": "true"}, allow_404=True)
        return r.json() if r is not None else None

    async def list(self, q: str, fields: str = "id,name,mimeType,createdTime",
                   order_by: Optional[str] = None) -> list:
        items: list = []
        token = None
        while True:
            params = {
                "q": q,
                "fields": f"nextPageToken,files({fields})",
                "pageSize": "1000",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if order_by:
                params["orderBy"] = order_by
            if token:
                params["pageToken"] = token
            body = (await self._call("GET", f"{API}/files", params=params)).json()
            items.extend(body.get("files", []))
            token = body.get("nextPageToken")
            if not token:
                return items

    async def children(self, folder_id: str, fields: str = "id,name,mimeType,createdTime") -> list:
        return await self.list(f"'{q_escape(folder_id)}' in parents and trashed = false", fields)

    async def create_folder(self, name: str, parent_id: str) -> dict:
        r = await self._call("POST", f"{API}/files", params={
            "fields": "id,name,createdTime", "supportsAllDrives": "true",
        }, json_body={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]})
        folder = r.json()
        if parent_id == config.DRIVE_ROOT_FOLDER_ID or self._inside_root.get(parent_id):
            self._inside_root[folder["id"]] = True
        if parent_id == config.DRIVE_ROOT_FOLDER_ID and self._root_cache:
            self._root_cache[1].append(folder)
        return folder

    async def move(self, file_id: str, new_parent: str, old_parents: list, name: Optional[str] = None) -> dict:
        """Перенести файл чи папку в іншу папку (і за потреби перейменувати)."""
        params = {"addParents": new_parent, "fields": "id,name,parents", "supportsAllDrives": "true"}
        old = [p for p in old_parents if p != new_parent]
        if old:
            params["removeParents"] = ",".join(old)
        r = await self._call("PATCH", f"{API}/files/{file_id}", params=params,
                             json_body={"name": name} if name else {})
        moved = r.json()
        if new_parent == config.DRIVE_ROOT_FOLDER_ID or self._inside_root.get(new_parent):
            self._inside_root[moved["id"]] = True
        if new_parent == config.DRIVE_ROOT_FOLDER_ID and self._root_cache:
            self._root_cache[1].append(moved)
        return moved

    async def share_public(self, file_id: str) -> None:
        """«Усі, хто має посилання — читач». Збій не критичний — лише в лог."""
        try:
            await self._call("POST", f"{API}/files/{file_id}/permissions", params={
                "fields": "id", "supportsAllDrives": "true",
            }, json_body={"role": "reader", "type": "anyone"})
        except DriveError as e:
            log.warning("Не вдалося відкрити доступ за посиланням до %s: %s", file_id, e)

    async def upload(self, folder_id: str, name: str, data: bytes, mime: str,
                     app_properties: Optional[dict] = None) -> dict:
        meta = {"name": name, "parents": [folder_id]}
        if app_properties:
            meta["appProperties"] = {k: fit_app_value(v) for k, v in app_properties.items() if v not in (None, "")}
        params = {"fields": FILE_FIELDS, "supportsAllDrives": "true"}

        if len(data) <= SIMPLE_UPLOAD_LIMIT:
            boundary = f"kcore{uuid.uuid4().hex}"
            body = (
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                f"{json.dumps(meta, ensure_ascii=False)}\r\n"
                f"--{boundary}\r\nContent-Type: {mime}\r\n\r\n"
            ).encode("utf-8") + data + f"\r\n--{boundary}--".encode("utf-8")
            r = await self._call("POST", f"{UPLOAD_API}/files", params={**params, "uploadType": "multipart"},
                                 content=body, headers={"Content-Type": f"multipart/related; boundary={boundary}"},
                                 timeout=180)
        else:
            init = await self._call("POST", f"{UPLOAD_API}/files", params={**params, "uploadType": "resumable"},
                                    content=json.dumps(meta, ensure_ascii=False).encode("utf-8"),
                                    headers={"Content-Type": "application/json; charset=UTF-8",
                                             "X-Upload-Content-Type": mime,
                                             "X-Upload-Content-Length": str(len(data))})
            session = init.headers.get("Location")
            if not session:
                raise DriveError("Google не видав адресу для завантаження великого файлу")
            r = await self._call("PUT", session, content=data, headers={"Content-Type": mime}, timeout=900)

        f = r.json()
        if folder_id == config.DRIVE_ROOT_FOLDER_ID or self._inside_root.get(folder_id):
            self._inside_root[f["id"]] = True
        return f

    async def trash(self, file_id: str) -> None:
        """У кошик Диска, а не назавжди: 30 днів його ще можна повернути."""
        await self._call("PATCH", f"{API}/files/{file_id}", params={"supportsAllDrives": "true", "fields": "id"},
                         json_body={"trashed": True})
        self._inside_root.pop(file_id, None)

    async def download(self, file_id: str) -> bytes:
        r = await self._call("GET", f"{API}/files/{file_id}", params={"alt": "media", "supportsAllDrives": "true"},
                             timeout=120)
        return r.content

    # ------------------------------------------------------------ головна папка

    async def root_folders(self) -> list:
        """Папки першого рівня в головній папці. Кеш на 10 хвилин."""
        async with self._root_lock:
            now = time.time()
            if self._root_cache and now - self._root_cache[0] < ROOT_CACHE_SECONDS:
                return self._root_cache[1]
            folders = await self.list(
                f"'{q_escape(config.DRIVE_ROOT_FOLDER_ID)}' in parents and mimeType = '{FOLDER_MIME}' and trashed = false",
                "id,name,createdTime", order_by="createdTime")
            for f in folders:
                self._inside_root[f["id"]] = True
            self._root_cache = (now, folders)
            return folders

    async def find_root_folder(self, name: str) -> Optional[dict]:
        for f in await self.root_folders():
            if f.get("name", "").strip() == name:
                return f
        return None

    def mark_inside_root(self, file_id: str) -> None:
        self._inside_root[file_id] = True

    async def is_inside_root(self, file_id: str) -> bool:
        """Чи лежить файл у головній папці (на будь-якій глибині до 6).

        Сервер не має права віддавати мініатюри чи видаляти файли з решти
        Диска власника — лише з папки проєктів.
        """
        if file_id == config.DRIVE_ROOT_FOLDER_ID:
            return False
        if file_id in self._inside_root:
            return self._inside_root[file_id]
        chain = []
        current = file_id
        result = False
        for _ in range(6):
            if current in self._inside_root:
                result = self._inside_root[current]
                break
            chain.append(current)
            meta = await self.get(current, "id,parents,trashed")
            if not meta or meta.get("trashed"):
                break
            parents = meta.get("parents") or []
            if config.DRIVE_ROOT_FOLDER_ID in parents:
                result = True
                break
            if not parents:
                break
            current = parents[0]
        for node in chain:
            self._inside_root[node] = result
        return result

    async def list_tree(self, folder_id: str, max_depth: int = 3) -> list:
        """Усі файли папки разом із підпапками. Кожному — _folder (назва підпапки).
        Підпапки одного рівня читаємо одночасно, а не по черзі — список
        об'єкта з кількома підпапками приходить у рази швидше."""
        result = []
        inside = self._inside_root.get(folder_id, False)
        level = [(folder_id, None)]
        depth = 0
        while level:
            batches = await asyncio.gather(*(self.children(fid, FILE_FIELDS) for fid, _ in level))
            next_level = []
            for (_, sub_name), files in zip(level, batches):
                for f in files:
                    if inside:
                        self._inside_root[f["id"]] = True
                    if f.get("mimeType") == FOLDER_MIME:
                        if depth < max_depth:
                            next_level.append((f["id"], f.get("name")))
                        continue
                    f["_folder"] = sub_name
                    self._meta[f["id"]] = (time.time(), {k: f.get(k) for k in ("id", "mimeType", "size", "thumbnailLink")})
                    result.append(f)
            level = next_level
            depth += 1
        return result

    # ------------------------------------------------------------ мініатюри

    async def thumbnail(self, file_id: str, size: int) -> Optional[Tuple[bytes, str]]:
        cached = self._meta.get(file_id)
        if cached and time.time() - cached[0] < 1800:
            meta = cached[1]
            res = await self._thumb_from_link(meta, file_id, size)
            if res:
                return res
        # Опису немає або посилання застаріло — питаємо Диск
        meta = await self.get(file_id, "id,mimeType,size,thumbnailLink")
        if not meta:
            return None
        self._meta[file_id] = (time.time(), meta)
        res = await self._thumb_from_link(meta, file_id, size)
        if res:
            return res

        # Запасний шлях: саме зображення, зменшене тут
        if (meta.get("mimeType") or "").startswith("image/") and int(meta.get("size") or 0) <= 25 * 1024 * 1024:
            data = await self.download(file_id)
            return await asyncio.to_thread(_make_thumb, data, size)
        return None

    async def _thumb_from_link(self, meta: dict, file_id: str, size: int) -> Optional[Tuple[bytes, str]]:
        link = meta.get("thumbnailLink")
        if link:
            url = re.sub(r"=s\d+(-[a-z])*$", "", link) + f"=s{size}"
            try:
                token = await self.access_token()
                r = await self.http.get(url, headers={"Authorization": f"Bearer {token}"},
                                        timeout=30, follow_redirects=True)
                ctype = r.headers.get("content-type", "")
                if r.status_code == 200 and ctype.startswith("image/"):
                    return r.content, ctype.split(";")[0]
            except httpx.HTTPError as e:
                log.info("Мініатюра Google для %s не завантажилась: %s", file_id, e)
        return None


def _make_thumb(data: bytes, size: int) -> Optional[Tuple[bytes, str]]:
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.thumbnail((size, size))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        return buf.getvalue(), "image/jpeg"
    except Exception:
        return None


def _error_text(r: httpx.Response) -> str:
    try:
        err = r.json().get("error") or {}
        msg = err.get("message") if isinstance(err, dict) else str(err)
    except Exception:
        msg = r.text[:200]
    return f"Google Drive: HTTP {r.status_code} {msg}"

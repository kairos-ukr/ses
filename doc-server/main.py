"""
K-CORE · Сервер документів

Приймає файли з сайту, стискає їх, кладе в папку об'єкта на Google
Диску і у фоні відправляє в гілку об'єкта в Telegram.

Ендпоінти (ті самі, що викликає сайт через Cloudflare Worker):
    POST /upload/            — документи з вкладки «Документи», заміри
    POST /workflow/upload    — файли етапів робочого процесу, рахунки
    GET  /documents/{id}     — список файлів об'єкта
    POST /delete             — у кошик Диска
    GET  /thumb/{file_id}    — мініатюра (для приватних файлів теж)
    GET  /design/variants/{id}, POST /design/select — 3D-варіанти
    GET  /health             — чи живий сервер і чи є доступ до Диска

object_number: номер об'єкта ('4953'), ліда ('lead-12') або назва
рахунку постачальника без об'єкта (складська папка).

Запуск: python main.py
"""
from __future__ import annotations

import asyncio
import logging
import re
import sys
import time
from collections import Counter, OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime
from logging.handlers import RotatingFileHandler
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.datastructures import UploadFile

import config
import naming
import optimize
from db import Db, DbError
from drive import FILE_ID_RE, Drive, DriveAuthError, DriveError, folder_link
from folders import Folders
from optimize import Prepared
from telegram import TelegramSender, TgFile, TgJob, _caption_with_links, build_caption

MB = 1024 * 1024
TZ = ZoneInfo(config.TIMEZONE)
THUMB_HEADERS = {"Cache-Control": "public, max-age=604800"}
LEAD_RE = re.compile(r"^lead-(\d+)$")
# Сайт питає /health, що вміє сервер, і показує лише те, що вже працює
FEATURES = ["leads"]


def setup_logging() -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)
    try:
        config.LOG_DIR.mkdir(exist_ok=True)
        file_handler = RotatingFileHandler(config.LOG_DIR / "server.log", maxBytes=2 * MB,
                                           backupCount=5, encoding="utf-8")
        file_handler.setFormatter(fmt)
        root.addHandler(file_handler)
    except OSError:
        pass
    # httpx пише кожен запит з повною адресою — а в адресі Bot API токен бота
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


log = logging.getLogger("server")


class ThumbCache:
    """Невеликий LRU мініатюр у пам'яті — сітка документів відкривається миттєво."""

    def __init__(self, limit: int = 400):
        self.limit = limit
        self.items: OrderedDict = OrderedDict()

    def get(self, key):
        if key in self.items:
            self.items.move_to_end(key)
            return self.items[key]
        return None

    def put(self, key, value) -> None:
        self.items[key] = value
        self.items.move_to_end(key)
        while len(self.items) > self.limit:
            self.items.popitem(last=False)

    def drop_file(self, file_id: str) -> None:
        for key in [k for k in self.items if k[0] == file_id]:
            del self.items[key]


class Services:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.db = Db(http)
        self.drive = Drive(http)
        self.folders = Folders(self.drive, self.db)
        self.tg = TelegramSender(http, self.db)
        self.thumbs = ThumbCache()
        # Стискання фото їсть пам'ять — одночасно не більше двох файлів
        self.cpu = asyncio.Semaphore(2)
        self.io = asyncio.Semaphore(4)
        self.last_auth_alert = 0.0


S: Services  # створюється в lifespan


async def startup_check() -> None:
    try:
        root = await S.drive.get(config.DRIVE_ROOT_FOLDER_ID, "id,name")
        if root:
            log.info("Google Drive: доступ є, головна папка «%s»", root.get("name"))
        else:
            log.error("Google Drive: головну папку %s не видно — перевірте DRIVE_ROOT_FOLDER_ID "
                      "і що авторизувались тим самим акаунтом", config.DRIVE_ROOT_FOLDER_ID)
    except DriveError as e:
        log.error("Google Drive: %s", e)
        await alert_auth(e)


async def send_lead_files(inst: dict, lead: dict, folder: dict) -> None:
    """Лід став об'єктом: усе, що зібрали до цього, — у гілку об'єкта в Telegram.

    Поки лід був лідом, файли лежали лише на Диску. Гілку бот створює протягом
    хвилини після появи об'єкта — черга Telegram сама почекає на неї.
    """
    if not config.SEND_TO_TELEGRAM:
        return
    try:
        files = sorted(await S.drive.list_tree(folder["id"]), key=lambda f: f.get("createdTime") or "")
        files = [f for f in files if not (f.get("mimeType") or "").startswith("application/vnd.google-apps")]
        if not files:
            return
        limit = config.TELEGRAM_MAX_FILE_MB * MB
        tg_files, oversized = [], []
        for f in files:
            mime = f.get("mimeType") or "application/octet-stream"
            kind = "photo" if mime.startswith("image/") else "video" if mime.startswith("video/") else "document"
            item = TgFile(f.get("name") or "file", b"", mime, kind, f.get("webViewLink") or "")
            if int(f.get("size") or 0) > limit:
                oversized.append(item)
                continue
            async with S.io:
                item.data = await S.drive.download(f["id"])
            tg_files.append(item)
        caption = build_caption(
            doc_type="Файли з ліда", icon="📎", kinds=Counter(f.kind for f in tg_files + oversized),
            uploaded_by="", comment="", folder_url=folder_link(folder["id"]))
        S.tg.enqueue(TgJob(
            installation_id=int(inst["id"]), custom_id=int(inst["custom_id"]),
            title=(inst.get("name") or "").strip() or f"Обʼєкт {inst['custom_id']}",
            caption=_caption_with_links(caption, oversized), files=tg_files))
        log.info("#%s: файли ліда #%s (%s) стали в чергу Telegram", inst["custom_id"], lead["id"], len(files))
    except Exception as e:
        log.error("#%s: файли ліда #%s не відправлено в Telegram: %s", inst.get("custom_id"), lead.get("id"), e)
        await S.tg.notify_admin(
            f"⚠️ Файли ліда #{lead.get('id')} не пішли в гілку обʼєкта #{inst.get('custom_id')}: {e}\n"
            f"На Google Диску вони є — у папці обʼєкта.")


async def alert_auth(e: Exception) -> None:
    """Про втрату доступу до Диска — адміну, але не частіше разу на годину."""
    if time.time() - S.last_auth_alert < 3600:
        return
    S.last_auth_alert = time.time()
    await S.tg.notify_admin(f"⚠️ Сервер документів не має доступу до Google Drive.\n{e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global S
    http = httpx.AsyncClient(timeout=60, limits=httpx.Limits(max_connections=30, max_keepalive_connections=10))
    S = Services(http)
    S.folders.on_lead_adopted = send_lead_files
    S.tg.start()
    caps = optimize.capabilities()
    log.info("Сервер документів запущено на порту %s · HEIC: %s · стискання PDF: %s",
             config.PORT, "так" if caps["heic"] else "ні", "так" if caps["pdf"] else "ні")
    asyncio.create_task(startup_check())
    try:
        yield
    finally:
        if S.tg.pending:
            log.warning("Зупинка: у черзі Telegram лишилось завдань: %s (на Диск усе збережено)", S.tg.pending)
        await S.tg.stop()
        await http.aclose()


app = FastAPI(title="K-Core · документи", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def fail(status: int, message: str) -> JSONResponse:
    # message — для сайту (result.message), detail — для старих перевірок у стилі FastAPI
    return JSONResponse({"status": "error", "message": message, "detail": message}, status_code=status)


@app.exception_handler(DriveAuthError)
async def on_drive_auth(_: Request, e: DriveAuthError):
    log.error("%s", e)
    await alert_auth(e)
    return fail(503, str(e))


@app.exception_handler(DriveError)
async def on_drive(_: Request, e: DriveError):
    log.error("%s", e)
    return fail(502, str(e))


@app.exception_handler(DbError)
async def on_db(_: Request, e: DbError):
    log.error("Supabase: %s", e)
    return fail(404 if e.status == 404 else 502, str(e))


# ====================================================================
#  Службове
# ====================================================================

@app.get("/")
@app.get("/health")
async def health():
    drive_state = "ok"
    try:
        await S.drive.access_token()
    except DriveError as e:
        drive_state = str(e)
    return {
        "status": "ok" if drive_state == "ok" else "degraded",
        "service": "k-core documents",
        "drive": drive_state,
        "telegram_queue": S.tg.pending,
        "optimizer": optimize.capabilities(),
        "features": FEATURES,
    }


async def target_of(object_number: str, create: bool):
    """Куди кладемо: (об'єкт або None, назва для файлів, папка).

    Лід, який уже став об'єктом, — у папку об'єкта.
    """
    lead_match = LEAD_RE.match(object_number)
    inst: Optional[dict] = None
    if object_number.isdigit():
        inst = await S.db.installation(int(object_number))
        if not inst:
            return None
    elif lead_match:
        lead = await S.db.lead(int(lead_match.group(1)))
        if not lead:
            return None
        if lead.get("installation_custom_id"):
            inst = await S.db.installation(int(lead["installation_custom_id"]))
        if not inst:
            title = naming.clean(lead.get("contact_name"), 80) or f"Лід {lead['id']}"
            return None, title, await S.folders.for_lead(lead, create=create)
    else:
        # Рахунок постачальника без об'єкта: спільна складська папка
        return None, object_number, await S.folders.warehouse(create=create)
    title = (inst.get("name") or "").strip() or f"Обʼєкт {inst['custom_id']}"
    return inst, title, await S.folders.for_installation(inst, create=create)


# ====================================================================
#  Завантаження
# ====================================================================

@app.post("/upload")
@app.post("/upload/")
@app.post("/workflow/upload")
@app.post("/workflow/upload/")
async def upload(request: Request):
    form = await request.form()
    object_number = str(form.get("object_number") or "").strip()
    stage_key = str(form.get("stage_key") or "").strip() or None
    doc_type = naming.effective_doc_type(str(form.get("doc_type") or ""), stage_key)
    uploaded_by = naming.clean(form.get("uploaded_by"), 80)
    comment = str(form.get("comment") or "").strip()[:500]
    uploads = [f for f in (*form.getlist("files"), *form.getlist("file")) if isinstance(f, UploadFile)]

    if not uploads:
        return fail(400, "Файли не передано")
    if not object_number:
        return fail(400, "Не вказано обʼєкт (object_number)")

    # --- куди кладемо
    target = await target_of(object_number, create=True)
    if not target:
        what = "Лід" if LEAD_RE.match(object_number) else "Обʼєкт"
        return fail(404, f"{what} #{object_number.removeprefix('lead-')} не знайдено")
    inst, title, folder = target

    # --- читаємо й стискаємо (по черзі, щоб не з'їсти пам'ять)
    async def read_and_prepare(u: UploadFile):
        async with S.cpu:
            data = await u.read()
            await u.close()
            name = u.filename or "file"
            if len(data) > config.MAX_FILE_MB * MB:
                return f"{name}: більше {config.MAX_FILE_MB} МБ"
            if not data:
                return f"{name}: порожній файл"
            return await asyncio.to_thread(optimize.prepare, name, u.content_type, data)

    prepared = await asyncio.gather(*(read_and_prepare(u) for u in uploads))

    # --- назви: «Тип_ДД_ММ_Об'єкт_(N)»
    good = [p for p in prepared if isinstance(p, Prepared)]
    base = naming.base_name(doc_type, title, datetime.now(TZ))
    names = iter(await S.folders.allocate_names(folder["id"], base, [p.ext for p in good])) if good else iter(())

    # --- на Диск, паралельно
    props = {"doc_type": doc_type, "object": object_number, "stage": stage_key or "", "by": uploaded_by}

    async def put(p: Prepared, name: str) -> dict:
        async with S.io:
            f = await S.drive.upload(folder["id"], name, p.data, p.mime, props)
            if config.PUBLIC_LINKS:
                await S.drive.share_public(f["id"])
            return f

    tasks = [put(p, next(names)) if isinstance(p, Prepared) else None for p in prepared]
    results = await asyncio.gather(*(t for t in tasks if t is not None), return_exceptions=True)
    results_iter = iter(results)

    files_out, failed, sent = [], [], []
    for u, p, t in zip(uploads, prepared, tasks):
        original = u.filename or "file"
        if t is None:
            failed.append({"name": original, "error": str(p)})
            files_out.append({"fileId": None, "id": None, "name": original, "error": str(p)})
            continue
        res = next(results_iter)
        if isinstance(res, BaseException):
            log.error("Не збережено на Диск %s: %s", original, res)
            failed.append({"name": original, "error": str(res)})
            files_out.append({"fileId": None, "id": None, "name": original, "error": str(res)})
            continue
        sent.append((p, res))
        files_out.append({
            "fileId": res["id"],
            "id": res["id"],
            "name": res["name"],
            "mimeType": res.get("mimeType") or p.mime,
            "webViewLink": res.get("webViewLink"),
            "webContentLink": res.get("webContentLink"),
            "size": int(res.get("size") or p.size),
            "originalName": original,
            "originalSize": p.original_size,
        })

    if not sent:
        first = failed[0]["error"] if failed else "невідома помилка"
        return fail(502, f"Не вдалося зберегти файли на Google Диск: {first}")

    warnings = []

    # --- 3D-варіанти: завдання «Розробка 3D візуалізації»
    if inst and stage_key == "project_design":
        rows = [{
            "installation_custom_id": int(inst["custom_id"]),
            "file_name": f["name"],
            "google_file_id": f["id"],
            "public_url": f.get("webViewLink"),
            "is_selected": False,
            "telegram_sent": False,
        } for p, f in sent if p.mime.startswith("image/")]
        try:
            await S.db.design_add(rows)
        except DbError as e:
            log.error("3D-варіанти не записано: %s", e)
            warnings.append("Варіанти 3D не додано до вибору — див. лог сервера")

    # --- у Telegram, у фоні
    telegram = "off"
    if inst and config.SEND_TO_TELEGRAM:
        caption = build_caption(
            doc_type=doc_type, icon=naming.type_icon(doc_type),
            kinds=Counter(p.kind for p, _ in sent), uploaded_by=uploaded_by,
            comment=comment, folder_url=folder_link(folder["id"]))
        S.tg.enqueue(TgJob(
            installation_id=int(inst["id"]), custom_id=int(inst["custom_id"]), title=title, caption=caption,
            files=[TgFile(f["name"], p.data, p.mime, p.kind, f.get("webViewLink") or "") for p, f in sent]))
        telegram = "queued"

    before = sum(p.original_size for p, _ in sent)
    after = sum(p.size for p, _ in sent)
    log.info("#%s «%s»: збережено %s з %s, %.1f → %.1f МБ, Telegram: %s",
             object_number, doc_type, len(sent), len(uploads), before / MB, after / MB, telegram)

    body = {
        "status": "success",
        "count": len(sent),
        "folder": folder["name"],
        "folder_id": folder["id"],
        "folder_link": folder_link(folder["id"]),
        "files": files_out,
        "failed": failed,
        "telegram": telegram,
    }
    if failed:
        warnings.insert(0, "Не збережено: " + ", ".join(f["name"] for f in failed))
    if warnings:
        body["message"] = "; ".join(warnings)
    return body


# ====================================================================
#  Перегляд і видалення
# ====================================================================

def to_document(f: dict) -> dict:
    props = f.get("appProperties") or {}
    return {
        "id": f["id"],
        "name": f.get("name"),
        "mimeType": f.get("mimeType"),
        "createdTime": f.get("createdTime"),
        "webViewLink": f.get("webViewLink"),
        "webContentLink": f.get("webContentLink"),
        "thumbnailLink": f.get("thumbnailLink"),
        "size": int(f["size"]) if f.get("size") else None,
        "docType": props.get("doc_type") or naming.doc_type_from_name(f.get("name") or "") or f.get("_folder"),
        "folder": f.get("_folder"),
    }


@app.get("/documents/{object_number}")
async def documents(object_number: str):
    object_number = object_number.strip()
    empty = {"status": "success", "documents": [], "folder": None}
    target = await target_of(object_number, create=False)
    folder = target[2] if target else None
    if not folder:
        return empty

    # Папку об'єкта сервер сам знайшов чи створив у папці проєктів — отже,
    # усе в ній «наше». Мініатюрам тоді не треба перевіряти це на Диску щоразу.
    S.drive.mark_inside_root(folder["id"])
    docs = [to_document(f) for f in await S.drive.list_tree(folder["id"])]
    docs.sort(key=lambda d: d.get("createdTime") or "", reverse=True)
    return {
        "status": "success",
        "documents": docs,
        "folder": folder["name"],
        "folder_id": folder["id"],
        "folder_link": folder_link(folder["id"]),
    }


@app.post("/delete")
@app.post("/delete/")
async def delete(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = dict(await request.form())
    file_id = str((body or {}).get("file_id") or "").strip()
    if not FILE_ID_RE.match(file_id):
        return fail(400, "Некоректний file_id")

    meta = await S.drive.get(file_id, "id,name,trashed")
    if not meta or meta.get("trashed"):
        return {"status": "success", "message": "Файл уже видалено"}
    if not await S.drive.is_inside_root(file_id):
        return fail(403, "Файл не з папки проєктів — видаляти його сервер не має права")

    await S.drive.trash(file_id)
    S.thumbs.drop_file(file_id)
    try:
        await S.db.design_forget_file(file_id)
    except DbError as e:
        log.warning("3D-варіант для %s не прибрано: %s", file_id, e)
    log.info("У кошик Диска: %s (%s)", meta.get("name"), file_id)
    return {"status": "success"}


@app.get("/thumb/{file_id}")
async def thumb(file_id: str, size: int = 800):
    if not FILE_ID_RE.match(file_id):
        return Response(status_code=404)
    size = max(64, min(1600, int(size)))
    key = (file_id, size)
    hit = S.thumbs.get(key)
    if hit:
        return Response(hit[0], media_type=hit[1], headers=THUMB_HEADERS)
    if not await S.drive.is_inside_root(file_id):
        return Response(status_code=404)
    res = await S.drive.thumbnail(file_id, size)
    if not res:
        return Response(status_code=404)
    S.thumbs.put(key, res)
    return Response(res[0], media_type=res[1], headers=THUMB_HEADERS)


# ====================================================================
#  3D-візуалізації
# ====================================================================

@app.get("/design/variants/{custom_id}")
async def design_variants(custom_id: int):
    return {"status": "success", "items": await S.db.design_variants(custom_id)}


@app.post("/design/select")
async def design_select(request: Request):
    body = await request.json()
    try:
        variant_id = int(body.get("variant_id"))
        custom_id = int(body.get("installation_custom_id"))
    except (TypeError, ValueError):
        return fail(400, "Потрібні variant_id та installation_custom_id")
    item = await S.db.design_select(variant_id, custom_id)
    return {"status": "success", "item": item}


if __name__ == "__main__":
    setup_logging()
    uvicorn.run(app, host=config.HOST, port=config.PORT, proxy_headers=True,
                forwarded_allow_ips="*", log_config=None)

"""
Фонова відправка файлів у гілку об'єкта в Telegram.

Сайт не чекає на Telegram: файли вже на Диску, а сюди вони стають у
чергу і йдуть по одному завданню, щоб не впертися в ліміти групи.

Як групується:
  · фото й відео — альбомами до 10 штук, як медіа (не файлами);
  · решта — групами документів до 10 штук;
  · один файл — звичайним повідомленням (альбом — лише від двох);
  · підпис — під першим повідомленням завантаження;
  · завеликі для бота (> 49 МБ) — посиланням на Диск у підписі.

Якщо щось не пролазить: 429 — чекаємо, скільки сказав Telegram; фото,
яке Telegram не прийняв, — повтор документом; завеликий запит —
по одному файлу. Остаточний збій — адміну в особисті.
"""
from __future__ import annotations

import asyncio
import html
import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

import config
from db import Db
from naming import plural

log = logging.getLogger("telegram")

API = f"https://api.telegram.org/bot{config.BOT_TOKEN}"
CAPTION_LIMIT = 1024
THREAD_RETRY_DELAY = 120   # гілку ще не створив бот — спробуємо пізніше
THREAD_RETRIES = 3


class TgError(Exception):
    def __init__(self, code: int, description: str):
        super().__init__(f"Telegram {code}: {description}")
        self.code = code
        self.description = description or ""


@dataclass
class TgFile:
    name: str
    data: bytes
    mime: str
    kind: str          # photo | video | document
    link: str = ""     # посилання на Диск


@dataclass
class TgJob:
    installation_id: int
    custom_id: int
    title: str
    caption: str
    files: list
    thread_id: Optional[int] = None
    attempts: int = 0


def esc(text) -> str:
    return html.escape(str(text or ""), quote=False)


class TelegramSender:
    def __init__(self, http: httpx.AsyncClient, db: Db):
        self.http = http
        self.db = db
        self.queue: asyncio.Queue = asyncio.Queue()
        self._worker: Optional[asyncio.Task] = None
        self._timers: set = set()

    # ------------------------------------------------------------ черга

    def start(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._run(), name="telegram-sender")

    async def stop(self) -> None:
        for t in list(self._timers):
            t.cancel()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass

    def enqueue(self, job: TgJob) -> None:
        self.queue.put_nowait(job)

    @property
    def pending(self) -> int:
        return self.queue.qsize()

    def _enqueue_later(self, job: TgJob, delay: float) -> None:
        async def later():
            await asyncio.sleep(delay)
            self.queue.put_nowait(job)
        task = asyncio.create_task(later())
        self._timers.add(task)
        task.add_done_callback(self._timers.discard)

    async def _run(self) -> None:
        while True:
            job: TgJob = await self.queue.get()
            try:
                await self._process(job)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.exception("Не вдалося відправити файли об'єкта #%s у Telegram", job.custom_id)
                await self.notify_admin(
                    f"⚠️ Сервер документів: файли не дійшли в гілку Telegram\n"
                    f"Обʼєкт: {job.title} #{job.custom_id}\n"
                    f"Файлів: {len(job.files)} ({', '.join(f.name for f in job.files[:5])}"
                    f"{'…' if len(job.files) > 5 else ''})\n"
                    f"Помилка: {e}\n"
                    f"На Google Диск файли збережено.")
            finally:
                self.queue.task_done()

    # ------------------------------------------------------------ обробка

    async def _process(self, job: TgJob) -> None:
        if job.thread_id is None:
            job.thread_id = await self.db.thread_id(job.installation_id)
        if job.thread_id is None:
            job.attempts += 1
            if job.attempts <= THREAD_RETRIES:
                log.info("Гілки об'єкта #%s ще немає — повтор через %s с", job.custom_id, THREAD_RETRY_DELAY)
                self._enqueue_later(job, THREAD_RETRY_DELAY)
                return
            raise RuntimeError("гілку обʼєкта в Telegram не знайдено (installation_messages)")

        limit = config.TELEGRAM_MAX_FILE_MB * 1024 * 1024
        sendable = [f for f in job.files if len(f.data) <= limit]
        oversized = [f for f in job.files if len(f.data) > limit]
        caption = _caption_with_links(job.caption, oversized)

        media = [f for f in sendable if f.kind in ("photo", "video")]
        docs = [f for f in sendable if f.kind not in ("photo", "video")]
        size = max(2, min(10, config.TELEGRAM_ALBUM_SIZE))
        batches = [media[i:i + size] for i in range(0, len(media), size)] + \
                  [docs[i:i + size] for i in range(0, len(docs), size)]

        if not batches:
            await self._call("sendMessage", {
                "chat_id": config.TELEGRAM_CHAT_ID, "message_thread_id": job.thread_id,
                "text": caption, "parse_mode": "HTML", "disable_web_page_preview": "true",
            })
            return

        for i, batch in enumerate(batches):
            await self._send_batch(job.thread_id, batch, caption if i == 0 else None)
            await asyncio.sleep(1.5 + 0.3 * len(batch))
        log.info("У гілку об'єкта #%s відправлено файлів: %s", job.custom_id, len(sendable))

    async def _send_batch(self, thread_id: int, batch: list, caption: Optional[str]) -> None:
        try:
            if len(batch) == 1:
                await self._send_single(thread_id, batch[0], caption)
            else:
                await self._send_group(thread_id, batch, caption)
        except TgError as e:
            desc = e.description.lower()
            if "thread not found" in desc or ("topic" in desc and ("closed" in desc or "deleted" in desc)):
                raise
            has_photos = any(f.kind == "photo" for f in batch)
            if has_photos and e.code == 400 and ("photo" in desc or "image" in desc or "dimensions" in desc):
                log.info("Telegram не прийняв фото (%s) — шлю документами", e.description)
                as_docs = [TgFile(f.name, f.data, f.mime, "document", f.link) for f in batch]
                await self._send_batch(thread_id, as_docs, caption)
                return
            if len(batch) > 1 and (e.code == 413 or "too big" in desc or "too large" in desc):
                log.info("Завеликий запит — шлю по одному файлу")
                for j, f in enumerate(batch):
                    await self._send_batch(thread_id, [f], caption if j == 0 else None)
                    await asyncio.sleep(1.5)
                return
            raise

    async def _send_single(self, thread_id: int, f: TgFile, caption: Optional[str]) -> None:
        method, field_name = {
            "photo": ("sendPhoto", "photo"),
            "video": ("sendVideo", "video"),
        }.get(f.kind, ("sendDocument", "document"))
        data = {"chat_id": config.TELEGRAM_CHAT_ID, "message_thread_id": thread_id}
        if f.kind == "video":
            data["supports_streaming"] = "true"
        if caption:
            data.update({"caption": caption, "parse_mode": "HTML"})
        await self._call(method, data, {field_name: (f.name, f.data, f.mime)})

    async def _send_group(self, thread_id: int, batch: list, caption: Optional[str]) -> None:
        media, files = [], {}
        for i, f in enumerate(batch):
            key = f"f{i}"
            item = {"type": f.kind if f.kind in ("photo", "video") else "document", "media": f"attach://{key}"}
            if f.kind == "video":
                item["supports_streaming"] = True
            if i == 0 and caption:
                item.update({"caption": caption, "parse_mode": "HTML"})
            media.append(item)
            files[key] = (f.name, f.data, f.mime)
        await self._call("sendMediaGroup", {
            "chat_id": config.TELEGRAM_CHAT_ID, "message_thread_id": thread_id,
            "media": json.dumps(media, ensure_ascii=False),
        }, files)

    # ------------------------------------------------------------ Bot API

    async def _call(self, method: str, data: dict, files: Optional[dict] = None):
        payload = {k: str(v) for k, v in data.items() if v is not None}
        for attempt in range(7):
            try:
                r = await self.http.post(f"{API}/{method}", data=payload, files=files,
                                         timeout=httpx.Timeout(300, connect=20))
            except httpx.TransportError as e:
                if attempt >= 3:
                    raise TgError(0, f"мережа: {e}") from e
                await asyncio.sleep(3 * (attempt + 1))
                continue
            try:
                body = r.json()
            except ValueError:
                body = {"ok": False, "error_code": r.status_code, "description": r.text[:200]}
            if body.get("ok"):
                return body.get("result")
            code = int(body.get("error_code") or r.status_code)
            if code == 429:
                wait = int((body.get("parameters") or {}).get("retry_after") or 5)
                log.info("Ліміт Telegram, чекаю %s с", wait)
                await asyncio.sleep(wait + 1)
                continue
            if code >= 500 and attempt < 3:
                await asyncio.sleep(3 * (attempt + 1))
                continue
            raise TgError(code, body.get("description", ""))
        raise TgError(429, "забагато повторів через ліміт")

    async def notify_admin(self, text: str) -> None:
        if not config.ADMIN_CHAT_ID:
            return
        try:
            await self._call("sendMessage", {"chat_id": config.ADMIN_CHAT_ID, "text": text[:4000]})
        except Exception as e:
            log.error("Не вдалося написати адміну: %s", e)


def _caption_with_links(caption: str, oversized: list) -> str:
    """Додає посилання на завеликі файли — скільки влізе в ліміт підпису."""
    for f in oversized:
        target = f'<a href="{esc(f.link)}">{esc(f.name)}</a>' if f.link else esc(f.name)
        candidate = f"{caption}\n⚠️ Завеликий для Telegram: {target}"
        if len(candidate) > CAPTION_LIMIT:
            break
        caption = candidate
    return caption


def build_caption(*, doc_type: str, icon: str, kinds: dict, uploaded_by: str,
                  comment: str, folder_url: str) -> str:
    """Підпис під першим повідомленням. Гілка й так своя — об'єкт не повторюємо."""
    parts = []
    if kinds.get("photo"):
        parts.append(f"🖼 {kinds['photo']} фото")
    if kinds.get("video"):
        parts.append(f"🎬 {kinds['video']} відео")
    if kinds.get("document"):
        parts.append("📄 " + plural(kinds["document"], "файл", "файли", "файлів"))

    lines = [f"{icon} <b>{esc(doc_type)}</b>"]
    if parts:
        lines.append(" · ".join(parts))
    if uploaded_by:
        lines.append(f"👤 {esc(uploaded_by)}")
    tail = f'📁 <a href="{esc(folder_url)}">Папка на Google Диску</a>'
    if comment:
        # Запас під посилання на завеликі файли; обрізаємо до екранування,
        # щоб не розрізати HTML-сутність навпіл
        room = CAPTION_LIMIT - len("\n".join(lines)) - len(tail) - 200
        c = comment
        while c and len(esc(c)) + 3 > room:
            c = c[:-20]
        if c:
            lines.append(f"💬 {esc(c)}{'…' if c != comment else ''}")
    lines.append(tail)
    return "\n".join(lines)

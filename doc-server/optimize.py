"""
Підготовка файлу перед збереженням: менше місця на Диску і швидше в Telegram.

  · Фото — довша сторона до IMAGE_MAX_SIDE, JPEG із розумною якістю,
    поворот за EXIF, без метаданих. HEIC з iPhone → JPEG (якщо стоїть
    pillow-heif). Прозорі PNG лишаються PNG.
  · PDF — перетискаються вбудовані картинки (скани, фото). Текст і
    векторна графіка не чіпаються. Потрібен pikepdf.
  · Word / Excel / PowerPoint — перетискаються вставлені картинки,
    формат і розмітка документа лишаються ті самі.
  · Решта — як є.

Оптимізований варіант береться, лише якщо він справді менший. Будь-яка
помилка → лишається оригінал: зіпсований файл гірший за великий.
"""
from __future__ import annotations

import io
import logging
import mimetypes
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Optional, Tuple

from PIL import Image, ImageOps

import config

log = logging.getLogger("optimize")

try:
    import pillow_heif  # type: ignore

    pillow_heif.register_heif_opener()
    HEIF_SUPPORT = True
except Exception:  # pragma: no cover — опційна залежність
    HEIF_SUPPORT = False

try:
    import pikepdf  # type: ignore

    PDF_SUPPORT = True
except Exception:  # pragma: no cover — опційна залежність
    PDF_SUPPORT = False

# Великі скани — нормально, але не безмежно (захист від «бомб»)
Image.MAX_IMAGE_PIXELS = 250_000_000

MB = 1024 * 1024

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff"}
OFFICE_EXT = {".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".pptm"}
# Те, що Telegram показує як відео з плеєром; решта відео — файлом
TG_VIDEO_EXT = {".mp4"}
TG_PHOTO_MIME = {"image/jpeg", "image/png"}

_MIME_FIX = {
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".dwg": "application/acad",
}


@dataclass
class Prepared:
    data: bytes
    mime: str
    ext: str               # з крапкою, нижній регістр: ".jpg"
    kind: str              # photo | video | document — як слати в Telegram
    original_name: str
    original_size: int
    width: int = 0
    height: int = 0
    notes: list = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.data)


def _ext_and_mime(name: str, content_type: Optional[str]) -> Tuple[str, str]:
    ext = PurePath(name or "").suffix.lower()
    ct = (content_type or "").split(";")[0].strip().lower()
    if not ext and ct:
        ext = (mimetypes.guess_extension(ct) or "").lower()
        if ext == ".jpe":
            ext = ".jpg"
    mime = _MIME_FIX.get(ext) or mimetypes.guess_type(f"x{ext}")[0] or ct or "application/octet-stream"
    if ct and ct != "application/octet-stream" and mime == "application/octet-stream":
        mime = ct
    return ext, mime


def prepare(name: str, content_type: Optional[str], data: bytes) -> Prepared:
    """Головний вхід. Ніколи не кидає виняток — у гіршому разі віддає оригінал."""
    ext, mime = _ext_and_mime(name, content_type)
    p = Prepared(data=data, mime=mime, ext=ext, kind="document",
                 original_name=name or "file", original_size=len(data))
    try:
        if ext in PHOTO_EXT or (mime.startswith("image/") and mime not in ("image/gif", "image/svg+xml")):
            _prepare_image(p)
        elif ext == ".pdf":
            _prepare_pdf(p)
        elif ext in OFFICE_EXT:
            _prepare_office(p)
        elif mime.startswith("video/") and ext in TG_VIDEO_EXT:
            p.kind = "video"
    except Exception as e:  # оригінал лишається
        log.warning("Оптимізація %s не вдалась, беремо оригінал: %s", name, e)
        p.data, p.mime, p.ext = data, mime, ext
        p.kind = "video" if (mime.startswith("video/") and ext in TG_VIDEO_EXT) else "document"
    return p


# ------------------------------------------------------------------ фото

def _has_real_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        alpha = img.convert("RGBA").getchannel("A")
        return alpha.getextrema()[0] < 250
    return False


def _prepare_image(p: Prepared) -> None:
    img = Image.open(io.BytesIO(p.data))
    img.load()
    if getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1:
        return  # анімацію не перетискаємо — піде файлом як є

    w0, h0 = img.size
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    max_side = config.IMAGE_MAX_SIDE

    small_enough = max(w, h) <= max_side and p.original_size <= config.IMAGE_KEEP_IF_UNDER_MB * MB
    if p.ext in (".jpg", ".jpeg", ".png") and small_enough:
        p.width, p.height = w, h
        _set_photo_kind(p)
        return

    scale = min(1.0, max_side / float(max(w, h)))
    if scale < 1.0:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    buf = io.BytesIO()
    if _has_real_alpha(img):
        img.save(buf, "PNG", optimize=True)
        new_mime, new_ext = "image/png", ".png"
    else:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=config.IMAGE_JPEG_QUALITY, optimize=True,
                 progressive=True, subsampling="4:2:0")
        new_mime, new_ext = "image/jpeg", ".jpg"
    candidate = buf.getvalue()

    # JPEG/PNG, який після обробки не став меншим, лишаємо як є (буває з
    # прозорими PNG). HEIC/WEBP/BMP/TIFF конвертуємо завжди: Telegram і
    # браузери їх як фото не покажуть.
    if p.ext in (".jpg", ".jpeg", ".png") and len(candidate) >= p.original_size:
        p.width, p.height = w, h
    else:
        p.data, p.mime, p.ext = candidate, new_mime, new_ext
        p.width, p.height = img.size
        p.notes.append(f"фото {w0}x{h0} → {img.size[0]}x{img.size[1]}")
    _set_photo_kind(p)


def _set_photo_kind(p: Prepared) -> None:
    w, h = p.width, p.height
    ok = (
        p.mime in TG_PHOTO_MIME
        and p.size <= config.TELEGRAM_MAX_PHOTO_MB * MB
        and w > 0 and h > 0
        and w + h <= 10000
        and max(w, h) / float(min(w, h)) <= 20
    )
    p.kind = "photo" if ok else "document"


# ------------------------------------------------------------------ PDF

def _prepare_pdf(p: Prepared) -> None:
    if not PDF_SUPPORT or p.original_size < config.PDF_OPTIMIZE_FROM_MB * MB:
        return
    out = _optimize_pdf(p.data)
    if out is not None:
        p.notes.append("pdf: перетиснуто картинки")
        p.data = out


def _optimize_pdf(data: bytes) -> Optional[bytes]:
    try:
        pdf = pikepdf.Pdf.open(io.BytesIO(data))
    except Exception as e:  # пароль, битий файл
        log.info("PDF не відкрився для оптимізації: %s", e)
        return None
    with pdf:
        seen = set()
        changed = 0
        for page in pdf.pages:
            try:
                # pikepdf 10+: get_images() бачить і картинки у вкладених формах
                getter = getattr(page, "get_images", None)
                images = list((getter() if getter else page.images).values())
            except Exception:
                continue
            for raw in images:
                key = raw.objgen
                if key in seen:
                    continue
                seen.add(key)
                try:
                    if _recompress_pdf_image(raw):
                        changed += 1
                except Exception as e:
                    log.debug("PDF-картинку пропущено: %s", e)
        if not changed:
            return None
        buf = io.BytesIO()
        pdf.save(buf, compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
    result = buf.getvalue()
    return result if len(result) < len(data) * 0.9 else None


def _recompress_pdf_image(raw) -> bool:
    Name = pikepdf.Name
    if int(raw.get("/Length", 0)) < 150_000:
        return False
    # Маски, прозорість, інвертовані й 1-бітні картинки — не чіпаємо
    for key in ("/ImageMask", "/SMask", "/Mask", "/Decode"):
        if key in raw:
            return False
    if int(raw.get("/BitsPerComponent", 8)) != 8:
        return False
    filt = raw.get("/Filter")
    filters = [str(f) for f in filt] if isinstance(filt, pikepdf.Array) else ([str(filt)] if filt is not None else [])
    if any(f in ("/JBIG2Decode", "/CCITTFaxDecode", "/JPXDecode") for f in filters):
        return False

    pimg = pikepdf.PdfImage(raw)
    if pimg.mode not in ("RGB", "L", "P"):
        return False  # CMYK і екзотика — ризик зіпсувати кольори
    pil = pimg.as_pil_image()
    if pil.mode not in ("RGB", "L"):
        pil = pil.convert("RGB")

    w, h = pil.size
    scale = min(1.0, config.PDF_IMAGE_MAX_SIDE / float(max(w, h)))
    if scale < 1.0:
        pil = pil.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    buf = io.BytesIO()
    pil.save(buf, "JPEG", quality=config.PDF_JPEG_QUALITY, optimize=True)
    new = buf.getvalue()
    if len(new) >= int(raw.Length) * 0.85:
        return False

    raw.write(new, filter=Name.DCTDecode)
    raw.Width, raw.Height = pil.size
    raw.ColorSpace = Name.DeviceGray if pil.mode == "L" else Name.DeviceRGB
    raw.BitsPerComponent = 8
    if "/DecodeParms" in raw:
        del raw["/DecodeParms"]
    return True


# ------------------------------------------------------------------ Office

def _prepare_office(p: Prepared) -> None:
    if p.original_size < config.OFFICE_OPTIMIZE_FROM_MB * MB:
        return
    out = _optimize_office(p.data)
    if out is not None:
        p.notes.append("office: перетиснуто картинки")
        p.data = out


def _optimize_office(data: bytes) -> Optional[bytes]:
    try:
        zin = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return None
    out = io.BytesIO()
    changed = 0
    with zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
        for info in zin.infolist():
            body = zin.read(info)
            low = info.filename.lower()
            if "/media/" in low and low.endswith((".jpg", ".jpeg", ".png")) and len(body) > 200_000:
                new = _shrink_embedded(body, low.endswith(".png"))
                if new is not None:
                    body = new
                    changed += 1
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            zout.writestr(zi, body)
    if not changed:
        return None
    result = out.getvalue()
    return result if len(result) < len(data) * 0.9 else None


def _shrink_embedded(body: bytes, is_png: bool) -> Optional[bytes]:
    """Картинка всередині документа: той самий формат (на нього посилається розмітка)."""
    try:
        img = Image.open(io.BytesIO(body))
        img.load()
        w, h = img.size
        scale = min(1.0, config.OFFICE_IMAGE_MAX_SIDE / float(max(w, h)))
        if scale < 1.0:
            img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        if is_png:
            img.save(buf, "PNG", optimize=True)
        else:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(buf, "JPEG", quality=config.OFFICE_JPEG_QUALITY, optimize=True, progressive=True)
        new = buf.getvalue()
        return new if len(new) < len(body) * 0.9 else None
    except Exception:
        return None


def capabilities() -> dict:
    return {"heic": HEIF_SUPPORT, "pdf": PDF_SUPPORT}

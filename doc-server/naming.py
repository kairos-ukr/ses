"""
Назви файлів і типи документів.

Формат назви: «Тип_ДД_ММ_Назва об'єкта_(N).розширення», наприклад
    Фотозвіт_14_10_Межиріч Саша, Загребля 48_(3).jpg

Підкреслення — лише роздільники. Усередині типу й назви об'єкта їх
замінено пробілами: звіт по об'єкту (rep.jsx) ріже назву по «_» і бере
день і місяць з 2-ї та 3-ї частини. N продовжує нумерацію за день —
повторне завантаження того ж типу не дає однакових назв.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable, Optional

_BAD_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]+')
_SPACES = re.compile(r"\s+")

# Етапи робочого процесу → зрозуміла назва. Дзеркало STAGES_LABELS з
# tg bot/workflow_monitor.py (без емодзі): сайт для багатьох етапів шле
# загальне «Файли етапу», а в назві файлу й підписі в Telegram краще
# бачити, що це саме за етап.
STAGE_LABELS = {
    "tech_review": "Заміри",
    "tech_measurements": "Проведення замірів",
    "project": "Проект",
    "project_design": "3D Візуалізація",
    "project_approval": "Затвердження варіанту",
    "tech_project": "Технічне рішення",
    "proposal": "Комерційна пропозиція",
    "proposal_main": "Комерційна пропозиція",
    "commercial_proposal": "Комерційна пропозиція",
    "advance_payment": "Аванс",
    "equipment": "Обладнання",
    "equipment_main": "Закупівля обладнання",
    "complectation": "Специфікація",
    "comp_materials": "Комплектація матеріалів",
    "comp_protection": "Специфікація захисту",
    "installation": "Монтаж",
    "inst_structure": "Монтаж конструкції",
    "inst_panels": "Встановлення панелей",
    "inst_cabling": "Прокладання траси DC",
    "inst_grounding": "Заземлення",
    "inst_inverter": "Підключення інвертора",
    "grid_connection": "Мережа",
    "grid_power": "Заведення потужності",
    "monitoring_setup": "Запуск",
    "mon_launch_station": "Запуск станції",
}

GENERIC_TYPES = {"", "файли етапу", "файли", "документ"}

# Значок у підписі Telegram — щоб тип читався з першого погляду
_TYPE_ICONS = (
    ("фото", "📷"),
    ("фотозвіт", "📷"),
    ("комерційна", "📑"),
    ("кп", "📑"),
    ("3d", "🎨"),
    ("візуаліз", "🎨"),
    ("проєкт", "📐"),
    ("проект", "📐"),
    ("рішення", "📐"),
    ("замір", "📏"),
    ("специфікац", "📦"),
    ("чек", "🧾"),
    ("накладна", "🧾"),
    ("рахунок", "🧾"),
    ("акт", "📝"),
)


def clean(text, limit: int = 80) -> str:
    """Текст, безпечний для назви файлу: без заборонених символів і «_»."""
    t = _BAD_CHARS.sub(" ", str(text or ""))
    t = t.replace("_", " ")
    t = _SPACES.sub(" ", t).strip(" .")
    return t[:limit].strip(" .")


def effective_doc_type(doc_type: str, stage_key: Optional[str]) -> str:
    """Тип документа: як прислав сайт, а загальне «Файли етапу» — назвою етапу."""
    dt = (doc_type or "").strip()
    if dt.lower() in GENERIC_TYPES and stage_key and stage_key in STAGE_LABELS:
        return STAGE_LABELS[stage_key]
    return dt or (STAGE_LABELS.get(stage_key or "") or "Документ")


def type_icon(doc_type: str) -> str:
    low = (doc_type or "").lower()
    for marker, icon in _TYPE_ICONS:
        if marker in low:
            return icon
    return "📎"


def base_name(doc_type: str, object_title: str, when: datetime) -> str:
    return (
        f"{clean(doc_type, 40) or 'Документ'}"
        f"_{when:%d}_{when:%m}_"
        f"{clean(object_title, 80) or 'Обʼєкт'}"
    )


def next_index(existing_names: Iterable[str], base: str) -> int:
    """Наступний номер для «base_(N)» з урахуванням уже наявних файлів."""
    pattern = re.compile(re.escape(base) + r"_\((\d+)\)")
    best = 0
    for name in existing_names:
        m = pattern.match(name or "")
        if m:
            best = max(best, int(m.group(1)))
    return best + 1


def file_name(base: str, index: int, ext: str) -> str:
    return f"{base}_({index}){ext}"


# Тип зі старих і нових назв: «3D_Візуалізація_22_06_…» → «3D Візуалізація»
_TYPE_FROM_NAME = re.compile(r"^(.+?)_(\d{1,2})_(\d{1,2})_")


def doc_type_from_name(name: str) -> Optional[str]:
    m = _TYPE_FROM_NAME.match(name or "")
    if not m:
        return None
    return m.group(1).replace("_", " ").strip() or None


def plural(n: int, one: str, few: str, many: str) -> str:
    """Українська множина: 1 файл, 2 файли, 5 файлів."""
    n10, n100 = n % 10, n % 100
    if n10 == 1 and n100 != 11:
        word = one
    elif 2 <= n10 <= 4 and not 12 <= n100 <= 14:
        word = few
    else:
        word = many
    return f"{n} {word}"

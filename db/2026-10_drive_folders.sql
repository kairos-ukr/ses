-- =====================================================================
--  K-CORE · Папки об'єктів на Google Диску
--
--  Сервер документів (doc-server/) записує сюди, у яку папку Диска
--  складати файли об'єкта. При першому завантаженні він знаходить
--  стару папку (за номером об'єкта в назві) або створює нову
--  «Назва об'єкта #1234», а далі бере ID звідси — без пошуку.
--
--  folder_key — custom_id об'єкта ('4953') або службовий ключ
--  ('warehouse' — рахунки постачальників без об'єкта).
--
--  Без цієї таблиці сервер теж працює — просто щоразу шукає папку на
--  Диску за назвою. Після міграції перезапуск сервера не потрібен.
--
--  Сервер ходить з ключем anon: читати й записувати може, видаляти —
--  ні. Якщо папку видалили з Диска, сервер створить нову і перепише
--  рядок.
--
--  Застосовувати в Supabase → SQL Editor, цілим файлом.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS drive_folders (
    folder_key             text PRIMARY KEY,
    installation_custom_id integer REFERENCES installations(custom_id) ON DELETE SET NULL,
    folder_id              text NOT NULL,
    folder_name            text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_folders_installation_idx
    ON drive_folders (installation_custom_id);

ALTER TABLE drive_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drive_folders_read" ON drive_folders;
CREATE POLICY "drive_folders_read" ON drive_folders
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "drive_folders_insert" ON drive_folders;
CREATE POLICY "drive_folders_insert" ON drive_folders
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "drive_folders_update" ON drive_folders;
CREATE POLICY "drive_folders_update" ON drive_folders
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON drive_folders TO anon, authenticated;

COMMIT;

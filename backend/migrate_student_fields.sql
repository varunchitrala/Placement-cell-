-- =====================================================
-- MIGRATION: Add new student profile fields
-- Run on existing Neon PostgreSQL database
-- =====================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_name TEXT DEFAULT 'Sandip University';
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_type TEXT DEFAULT 'university';
ALTER TABLE students ADD COLUMN IF NOT EXISTS course           TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS specialization   TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS passout_year     INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url        TEXT;

-- resume_url may already exist — safe to re-add
ALTER TABLE students ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'students' ORDER BY ordinal_position;

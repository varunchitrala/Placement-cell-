-- =====================================================
-- MIGRATION: Add new student profile fields
-- Run on your Neon PostgreSQL database
-- =====================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS passout_year     INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_name TEXT DEFAULT 'Sandip University';
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_type TEXT DEFAULT 'university';
  -- institution_type values:
  --   'university'  → Sandip University (degree programmes)
  --   'foundation'  → Sandip Foundation (diploma / other)
  --   'other'       → External / other institution
ALTER TABLE students ADD COLUMN IF NOT EXISTS course           TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS specialization   TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url        TEXT;
  -- photo_url: stores base64 data-URL of passport photo
  -- resume_url already exists (stores base64 or external link)

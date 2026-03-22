-- ================================================
-- MIGRATION: Add Recruiter feature
-- Run this on your Neon PostgreSQL database
-- ================================================

-- 1. Add room + slot_time to drives (if not already added)
ALTER TABLE drives
  ADD COLUMN IF NOT EXISTS room      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS slot_time TEXT DEFAULT '';

-- 2. Create the recruiters table
CREATE TABLE IF NOT EXISTS recruiters (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  company_name  TEXT NOT NULL,
  drive_id      INTEGER REFERENCES drives(id) ON DELETE SET NULL,
  created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  role          TEXT DEFAULT 'recruiter',
  created_at    TIMESTAMP DEFAULT now()
);

-- 3. Add marked_by to attendance (tracks whether student or recruiter marked it)
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS marked_by TEXT DEFAULT 'student';

-- 4. Add updated_by to enrollments (tracks admin vs recruiter changes)
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by  TEXT DEFAULT 'system';

-- 5. Index for recruiter lookups
CREATE INDEX IF NOT EXISTS idx_recruiters_drive ON recruiters(drive_id);

-- =============================================================
-- Migration: Recruiter → Student Coordinator Redesign
-- Run this on your Neon PostgreSQL database
-- =============================================================

-- 1. Add unique_code column to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS unique_code CHAR(4) UNIQUE;

-- 2. Populate existing students with unique 4-digit codes (1000-9999)
DO $$
DECLARE
  r RECORD;
  code TEXT;
BEGIN
  FOR r IN SELECT id FROM students WHERE unique_code IS NULL LOOP
    LOOP
      code := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
      BEGIN
        UPDATE students SET unique_code = code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- retry with new code
      END;
    END LOOP;
  END LOOP;
END $$;

-- 3. Update recruiter role labels to coordinator
UPDATE recruiters SET role = 'coordinator' WHERE role = 'recruiter';

-- 4. Verify
SELECT id, name, roll_no, unique_code FROM students ORDER BY id LIMIT 10;

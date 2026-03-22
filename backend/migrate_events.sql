-- =====================================================
-- MIGRATION: Introduce mega_drive_events
-- Run on your existing Neon PostgreSQL database
-- =====================================================

-- 1. Create the mega_drive_events table
CREATE TABLE IF NOT EXISTS mega_drive_events (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'CREATED'
              CHECK (status IN ('CREATED','REGISTRATION_OPEN','IN_PROGRESS','COMPLETED')),
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);

-- 2. Add event_id column to drives
ALTER TABLE drives ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES mega_drive_events(id) ON DELETE CASCADE;

-- 3. Migrate existing drives: create one default event and link all existing drives to it
DO $$
DECLARE
  v_event_id INTEGER;
  v_date DATE;
BEGIN
  -- Only migrate if there are drives but no events yet
  IF (SELECT COUNT(*) FROM drives) > 0 AND (SELECT COUNT(*) FROM mega_drive_events) = 0 THEN
    -- Use the earliest drive date as event date
    SELECT MIN(drive_date) INTO v_date FROM drives;
    IF v_date IS NULL THEN v_date := CURRENT_DATE; END IF;

    INSERT INTO mega_drive_events (name, event_date, status)
    VALUES ('Campus Mega Drive (Migrated)', v_date, 'COMPLETED')
    RETURNING id INTO v_event_id;

    UPDATE drives SET event_id = v_event_id WHERE event_id IS NULL;
  END IF;
END $$;

-- 4. Remove status, room, slot_time from drives (they belong on the event now)
ALTER TABLE drives DROP COLUMN IF EXISTS status;
ALTER TABLE drives DROP COLUMN IF EXISTS room;
ALTER TABLE drives DROP COLUMN IF EXISTS slot_time;
ALTER TABLE drives DROP COLUMN IF EXISTS drive_date;

-- 5. Remove attendance_sessions table (no longer needed)
DROP TABLE IF EXISTS attendance_sessions CASCADE;

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_drives_event ON drives(event_id);

-- Done! Verify:
-- SELECT e.name, e.status, COUNT(d.id) as companies
-- FROM mega_drive_events e LEFT JOIN drives d ON d.event_id = e.id
-- GROUP BY e.id, e.name, e.status;

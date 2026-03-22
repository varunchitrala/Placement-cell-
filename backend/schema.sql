-- =====================================================
-- Placement Cell Management System
-- PostgreSQL Schema (FINAL PRODUCTION)
-- Run on Neon PostgreSQL
-- =====================================================

DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS attendance_sessions CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS drives CASCADE;
DROP TABLE IF EXISTS mega_drive_events CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS recruiters CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- ── ADMINS ──────────────────────────────────────────
CREATE TABLE admins (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT now()
);

-- ── STUDENTS ─────────────────────────────────────────
CREATE TABLE students (
  id                SERIAL PRIMARY KEY,
  -- Personal
  name              TEXT NOT NULL,
  roll_no           TEXT UNIQUE NOT NULL,   -- PRN / Student ID
  date_of_birth     DATE NOT NULL,
  email             TEXT UNIQUE,
  phone             TEXT,
  -- Institution
  institution_name  TEXT DEFAULT 'Sandip University',
  institution_type  TEXT DEFAULT 'university',
    -- 'university'  = Sandip University (degree)
    -- 'foundation'  = Sandip Foundation (diploma/other)
    -- 'other'       = External institution
  -- Academic
  course            TEXT,                   -- e.g. B.Tech, MBA, MCA, BCA
  branch            TEXT NOT NULL,          -- e.g. CSE, ECE, IT
  specialization    TEXT,                   -- e.g. Data Science, VLSI
  year              INTEGER NOT NULL,       -- current year of study
  passout_year      INTEGER,               -- expected graduation year
  cgpa              DECIMAL(4,2) DEFAULT 0.00,
  backlogs          INTEGER DEFAULT 0,
  -- Skills & Projects
  skills            TEXT,
  projects          TEXT,
  -- Documents (base64 data-URL or external link)
  photo_url         TEXT,                  -- HD passport photo
  resume_url        TEXT,                  -- CV / Resume
  -- System
  role              TEXT DEFAULT 'student',
  created_at        TIMESTAMP DEFAULT now()
);

-- ── MEGA DRIVE EVENTS ────────────────────────────────
CREATE TABLE mega_drive_events (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'CREATED'
              CHECK (status IN ('CREATED','REGISTRATION_OPEN','IN_PROGRESS','COMPLETED')),
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);

-- ── DRIVES (Companies in a mega drive event) ─────────
CREATE TABLE drives (
  id                            SERIAL PRIMARY KEY,
  event_id                      INTEGER REFERENCES mega_drive_events(id) ON DELETE CASCADE,
  company_name                  TEXT NOT NULL,
  job_role                      TEXT NOT NULL,
  ctc                           NUMERIC(10,2),
  description                   TEXT,
  eligibility_min_cgpa          DECIMAL(4,2) DEFAULT 0.00,
  eligibility_backlogs_allowed  INTEGER DEFAULT 0,
  eligibility_branches          TEXT,
  created_at                    TIMESTAMP DEFAULT now(),
  updated_at                    TIMESTAMP DEFAULT now()
);

-- ── RECRUITERS ───────────────────────────────────────
CREATE TABLE recruiters (
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

-- ── ENROLLMENTS ──────────────────────────────────────
CREATE TABLE enrollments (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
  drive_id    INTEGER REFERENCES drives(id) ON DELETE CASCADE,
  status      TEXT DEFAULT 'applied'
              CHECK (status IN ('applied','shortlisted','rejected','offered')),
  applied_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now(),
  updated_by  TEXT DEFAULT 'system',
  UNIQUE(student_id, drive_id)
);

-- ── ATTENDANCE ───────────────────────────────────────
CREATE TABLE attendance (
  id            SERIAL PRIMARY KEY,
  student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE,
  drive_id      INTEGER REFERENCES drives(id) ON DELETE CASCADE,
  present       BOOLEAN DEFAULT false,
  marked_by     TEXT DEFAULT 'student',
  checked_in_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT now(),
  UNIQUE(student_id, drive_id)
);

-- ── INDEXES ──────────────────────────────────────────
CREATE INDEX idx_roll             ON students(roll_no);
CREATE INDEX idx_enroll           ON enrollments(student_id, drive_id);
CREATE INDEX idx_attendance       ON attendance(student_id, drive_id);
CREATE INDEX idx_recruiters_drive ON recruiters(drive_id);
CREATE INDEX idx_drives_event     ON drives(event_id);

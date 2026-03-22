// ─────────────────────────────────────────────────────────────────
//  Auto-Migration — runs on every server start
//  Uses IF NOT EXISTS / DO NOTHING so it is always safe to re-run.
//  Add new migrations at the BOTTOM of the `migrations` array.
// ─────────────────────────────────────────────────────────────────
const db = require('./config/db');

const migrations = [

  // ── 001: mega_drive_events table ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS mega_drive_events (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    event_date  DATE NOT NULL,
    description TEXT,
    status      TEXT DEFAULT 'CREATED'
                CHECK (status IN ('CREATED','REGISTRATION_OPEN','IN_PROGRESS','COMPLETED')),
    created_at  TIMESTAMP DEFAULT now(),
    updated_at  TIMESTAMP DEFAULT now()
  )`,

  // ── 002: add event_id to drives (if column missing) ───────────
  `ALTER TABLE drives ADD COLUMN IF NOT EXISTS event_id INTEGER
   REFERENCES mega_drive_events(id) ON DELETE CASCADE`,

  // ── 003: index on drives.event_id ────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_drives_event ON drives(event_id)`,

  // ── 004: new student profile fields ──────────────────────────
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_name TEXT DEFAULT 'Sandip University'`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_type TEXT DEFAULT 'university'`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS course           TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS specialization   TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS passout_year     INTEGER`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url        TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS resume_url       TEXT`,

  // ── 005: drop old columns that no longer exist in schema ──────
  `ALTER TABLE drives DROP COLUMN IF EXISTS status`,
  `ALTER TABLE drives DROP COLUMN IF EXISTS room`,
  `ALTER TABLE drives DROP COLUMN IF EXISTS slot_time`,
  `ALTER TABLE drives DROP COLUMN IF EXISTS drive_date`,

  // ── 006: admin brute-force lockout columns ────────────────────
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMP DEFAULT NULL`,

  // ── 007: make job_role nullable on drives ─────────────────────
  // job_role is now filled by the recruiter from their dashboard,
  // not by admin when adding the company — so it can be NULL initially.
  `ALTER TABLE drives ALTER COLUMN job_role DROP NOT NULL`,

];

async function runMigrations() {
  console.log('🗄️  Running database migrations...');
  let applied = 0;

  for (let i = 0; i < migrations.length; i++) {
    try {
      await db.query(migrations[i]);
      applied++;
    } catch (err) {
      if (
        err.message.includes('already exists') ||
        err.message.includes('does not exist')
      ) {
        // silently skip — idempotent
      } else {
        console.error(`⚠️  Migration ${i + 1} warning: ${err.message}`);
      }
    }
  }

  console.log(`✅ Migrations complete (${applied}/${migrations.length} statements ran)`);
}

module.exports = runMigrations;

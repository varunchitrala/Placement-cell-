/**
 * DB Initialization Script — uses @neondatabase/serverless
 * Run with: node scripts/initDb.js
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function initDb() {
  try {
    console.log('🔗 Connecting to Neon PostgreSQL...');

    // Drop tables in correct order (dependents first)
    const drops = [
      'DROP TABLE IF EXISTS attendance CASCADE',
      'DROP TABLE IF EXISTS attendance_sessions CASCADE',
      'DROP TABLE IF EXISTS enrollments CASCADE',
      'DROP TABLE IF EXISTS drives CASCADE',
      'DROP TABLE IF EXISTS rooms CASCADE',
      'DROP TABLE IF EXISTS students CASCADE',
      'DROP TABLE IF EXISTS admins CASCADE'
    ];

    for (const stmt of drops) {
      await sql(stmt);
    }
    console.log('🗑️  Old tables dropped.');

    // Create tables
    await sql`
      CREATE TABLE admins (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT DEFAULT 'admin',
        created_at    TIMESTAMP DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE students (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        roll_no       TEXT UNIQUE NOT NULL,
        date_of_birth DATE NOT NULL,
        email         TEXT UNIQUE,
        phone         TEXT,
        branch        TEXT NOT NULL,
        year          INTEGER NOT NULL,
        cgpa          DECIMAL(4,2) DEFAULT 0.00,
        backlogs      INTEGER DEFAULT 0,
        skills        TEXT,
        projects      TEXT,
        resume_url    TEXT,
        role          TEXT DEFAULT 'student',
        created_at    TIMESTAMP DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE rooms (
        id            SERIAL PRIMARY KEY,
        room_name     TEXT NOT NULL,
        block         TEXT,
        max_capacity  INTEGER DEFAULT 30
      )
    `;

    await sql`
      CREATE TABLE drives (
        id                           SERIAL PRIMARY KEY,
        company_name                 TEXT NOT NULL,
        drive_date                   DATE NOT NULL,
        job_role                     TEXT NOT NULL,
        ctc                          NUMERIC(10,2),
        description                  TEXT,
        eligibility_min_cgpa         DECIMAL(4,2) DEFAULT 0.00,
        eligibility_backlogs_allowed INTEGER DEFAULT 0,
        eligibility_branches         TEXT,
        status                       TEXT DEFAULT 'CREATED'
                                     CHECK (status IN ('CREATED','REGISTRATION_OPEN','CLOSED','IN_PROGRESS','COMPLETED')),
        created_at                   TIMESTAMP DEFAULT now(),
        updated_at                   TIMESTAMP DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE enrollments (
        id          SERIAL PRIMARY KEY,
        student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
        drive_id    INTEGER REFERENCES drives(id) ON DELETE CASCADE,
        status      TEXT DEFAULT 'applied'
                    CHECK (status IN ('applied','shortlisted','rejected','offered')),
        applied_at  TIMESTAMP DEFAULT now(),
        UNIQUE(student_id, drive_id)
      )
    `;

    await sql`
      CREATE TABLE attendance_sessions (
        id          SERIAL PRIMARY KEY,
        drive_id    INTEGER REFERENCES drives(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        status      TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
        start_time  TIMESTAMP DEFAULT now(),
        end_time    TIMESTAMP
      )
    `;

    await sql`
      CREATE TABLE attendance (
        id            SERIAL PRIMARY KEY,
        student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE,
        drive_id      INTEGER REFERENCES drives(id) ON DELETE CASCADE,
        present       BOOLEAN DEFAULT false,
        room          TEXT DEFAULT '',
        slot_time     TEXT DEFAULT '',
        checked_in_at TIMESTAMP,
        created_at    TIMESTAMP DEFAULT now(),
        UNIQUE(student_id, drive_id)
      )
    `;

    // Indexes
    await sql`CREATE INDEX idx_roll ON students(roll_no)`;
    await sql`CREATE INDEX idx_enroll ON enrollments(student_id, drive_id)`;
    await sql`CREATE INDEX idx_attendance ON attendance(student_id, drive_id)`;
    await sql`CREATE INDEX idx_sessions_drive ON attendance_sessions(drive_id)`;
    await sql`CREATE INDEX idx_students_branch ON students(branch)`;

    console.log('✅ All tables and indexes created successfully in Neon PostgreSQL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error initialising database:', err.message);
    process.exit(1);
  }
}

initDb();

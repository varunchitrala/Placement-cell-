// ─────────────────────────────────────────────────────────────────
//  reset-admin.js  —  run LOCALLY on the server only
//
//  Usage:
//    1. Set these in your .env file:
//         ADMIN_NAME=Your Name
//         ADMIN_EMAIL=you@example.com
//         ADMIN_PASSWORD=YourNewStrongPassword123!
//    2. Run:  node scripts/reset-admin.js
//    3. Remove ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env after running
//
//  This script is the ONLY way to set or change admin credentials.
//  There is no API endpoint for this — by design.
// ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('@neondatabase/serverless');

const NAME     = process.env.ADMIN_NAME;
const EMAIL    = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

// ── Validation ────────────────────────────────────────────────────
if (!NAME || !EMAIL || !PASSWORD) {
  console.error('❌  Missing required env vars.');
  console.error('    Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD in your .env file then re-run.');
  process.exit(1);
}

if (PASSWORD.length < 12) {
  console.error('❌  ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

if (!/[A-Z]/.test(PASSWORD) || !/[0-9]/.test(PASSWORD) || !/[^A-Za-z0-9]/.test(PASSWORD)) {
  console.error('❌  ADMIN_PASSWORD must contain at least one uppercase letter, one number, and one special character.');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) {
  console.error('❌  ADMIN_EMAIL is not a valid email address.');
  process.exit(1);
}

async function resetAdmin() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log('🔗 Connecting to database...');
    const hash = await bcrypt.hash(PASSWORD, 12); // cost 12 — stronger than default 10

    // Upsert — creates admin if none exists, or resets credentials if one does
    const { rows } = await pool.query(
      `INSERT INTO admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET name          = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash
       RETURNING id, name, email`,
      [NAME.trim(), EMAIL.trim().toLowerCase(), hash]
    );

    // Also reset any login lockout for this admin
    await pool.query(
      `UPDATE admins SET failed_attempts = 0, locked_until = NULL WHERE email = $1`,
      [EMAIL.trim().toLowerCase()]
    ).catch(() => {}); // ignore if columns don't exist yet

    console.log('✅ Admin credentials set successfully.');
    console.log('   Name  :', rows[0].name);
    console.log('   Email :', rows[0].email);
    console.log('   ID    :', rows[0].id);
    console.log('');
    console.log('⚠️  Now remove ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from your .env file!');
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

resetAdmin();

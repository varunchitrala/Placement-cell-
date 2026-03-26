const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db     = require('../config/db');

// ── Token signing ─────────────────────────────────────────────────
const signToken = (id, role) =>
  jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d', algorithm: 'HS256' }
  );

// ── Simple inline validators ──────────────────────────────────────
const isValidEmail = (e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const isValidPhone = (p) => !p || /^\d{10}$/.test(p.trim());
const isValidUrl   = (u) => !u || /^https?:\/\/.+/.test(u.trim());

// ── Brute-force config ────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;           // lock after 5 consecutive failures
const LOCKOUT_MINUTES     = 15;          // lock for 15 minutes

// ── GET /api/auth/registration-status  (public) ───────────────────
exports.getRegistrationStatus = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, event_date, status
       FROM mega_drive_events
       WHERE status IN ('REGISTRATION_OPEN','IN_PROGRESS')
       ORDER BY event_date ASC
       LIMIT 1`
    );
    if (rows.length) {
      res.json({
        success:      true,
        open:         true,
        event_name:   rows[0].name,
        event_date:   rows[0].event_date,
        event_status: rows[0].status
      });
    } else {
      res.json({ success: true, open: false });
    }
  } catch (err) {
    console.error('getRegistrationStatus error:', err.message);
    res.status(500).json({ success: false, message: 'Could not check registration status.' });
  }
};

// ── POST /api/auth/register-student ──────────────────────────────
exports.registerStudent = async (req, res) => {
  try {
    // Gate: only allowed when an event is open
    const statusCheck = await db.query(
      `SELECT id FROM mega_drive_events
       WHERE status IN ('REGISTRATION_OPEN','IN_PROGRESS')
       LIMIT 1`
    );
    if (!statusCheck.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Student registration is currently closed. No placement drive is open at this time.'
      });
    }

    const {
      name, roll_no, date_of_birth, email, phone,
      institution_name, institution_type,
      course, branch, specialization,
      year, passout_year, cgpa, backlogs,
      photo_url, resume_url
    } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    if (!roll_no || !roll_no.trim())
      return res.status(400).json({ success: false, message: 'Student ID / PRN is required.' });
    if (!date_of_birth)
      return res.status(400).json({ success: false, message: 'Date of birth is required.' });
    if (!branch || !year || !course)
      return res.status(400).json({ success: false, message: 'Course, branch and year are required.' });
    if (email && !isValidEmail(email))
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    if (!isValidPhone(phone))
      return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits.' });
    if (photo_url  && !isValidUrl(photo_url))
      return res.status(400).json({ success: false, message: 'Invalid photo URL.' });
    if (resume_url && !isValidUrl(resume_url))
      return res.status(400).json({ success: false, message: 'Invalid resume URL.' });

    const cgpaNum    = parseFloat(cgpa)   || 0;
    const backlogNum = parseInt(backlogs) || 0;
    if (cgpaNum < 0 || cgpaNum > 10)
      return res.status(400).json({ success: false, message: 'CGPA must be between 0 and 10.' });

    const exist = await db.query(
      'SELECT id FROM students WHERE roll_no=$1',
      [roll_no.trim().toUpperCase()]
    );
    if (exist.rows.length)
      return res.status(409).json({ success: false, message: 'This PRN is already registered.' });

    if (email) {
      const emailExist = await db.query(
        'SELECT id FROM students WHERE email=$1',
        [email.trim().toLowerCase()]
      );
      if (emailExist.rows.length)
        return res.status(409).json({ success: false, message: 'This email is already registered.' });
    }

    // Generate a unique 4-digit code (1000–9999)
    let uniqueCode;
    for (let attempt = 0; attempt < 50; attempt++) {
      uniqueCode = String(Math.floor(Math.random() * 9000) + 1000);
      const codeCheck = await db.query('SELECT id FROM students WHERE unique_code=$1', [uniqueCode]);
      if (!codeCheck.rows.length) break;
      if (attempt === 49) {
        return res.status(500).json({ success: false, message: 'Could not generate unique code. Please try again.' });
      }
    }

    const { rows } = await db.query(
      `INSERT INTO students
         (name, roll_no, date_of_birth, email, phone, unique_code,
          institution_name, institution_type,
          course, branch, specialization,
          year, passout_year, cgpa, backlogs,
          photo_url, resume_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, name, roll_no, email, branch, year, role, unique_code`,
      [
        name.trim(),
        roll_no.trim().toUpperCase(),
        date_of_birth,
        email  ? email.trim().toLowerCase() : null,
        phone  ? phone.trim()               : null,
        uniqueCode,
        institution_name || 'Sandip University',
        institution_type || 'university',
        course.trim(),
        branch.trim(),
        specialization ? specialization.trim() : null,
        parseInt(year),
        passout_year ? parseInt(passout_year) : null,
        cgpaNum,
        backlogNum,
        photo_url  || null,
        resume_url || null,
      ]
    );

    const token = signToken(rows[0].id, 'student');
    res.status(201).json({ success: true, token, user: { ...rows[0], role: 'student' } });

  } catch (err) {
    console.error('registerStudent error:', err.message);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// ── POST /api/auth/student-login  (Phone + DOB) ──────────────────
exports.studentLogin = async (req, res) => {
  try {
    const { phone, date_of_birth } = req.body;
    if (!phone || !date_of_birth)
      return res.status(400).json({ success: false, message: 'Phone number and Date of Birth are required.' });

    const { rows } = await db.query(
      `SELECT id, name, roll_no, email, phone, branch, year, role, unique_code
       FROM students WHERE phone=$1 AND date_of_birth=$2`,
      [phone.trim(), date_of_birth]
    );

    if (!rows[0])
      return res.status(401).json({ success: false, message: 'Invalid phone number or Date of Birth.' });

    const token = signToken(rows[0].id, 'student');
    res.json({ success: true, token, user: { ...rows[0], role: 'student' } });

  } catch (err) {
    console.error('studentLogin error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ── POST /api/auth/admin-login ────────────────────────────────────
// Protected by brute-force lockout:
//   - 5 consecutive wrong passwords → account locked for 15 minutes
//   - Correct password → counter resets
//   - Timing-safe: always runs bcrypt even when account not found
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const { rows } = await db.query(
      'SELECT * FROM admins WHERE email=$1',
      [email.trim().toLowerCase()]
    );

    // Always run bcrypt even when no account found — prevents user enumeration via timing
    const dummyHash = '$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
    const hash      = rows[0] ? rows[0].password_hash : dummyHash;

    // ── Check lockout before doing anything else ──────────────
    if (rows[0] && rows[0].locked_until) {
      const lockedUntil = new Date(rows[0].locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil - new Date()) / 60000);
        return res.status(429).json({
          success: false,
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
        });
      }
    }

    const match = await bcrypt.compare(password, hash);

    if (!rows[0] || !match) {
      // Increment failure counter if account exists
      if (rows[0]) {
        const newCount = (rows[0].failed_attempts || 0) + 1;
        if (newCount >= MAX_FAILED_ATTEMPTS) {
          // Lock the account
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await db.query(
            'UPDATE admins SET failed_attempts=$1, locked_until=$2 WHERE id=$3',
            [newCount, lockUntil, rows[0].id]
          );
          console.warn(`🔒 Admin account locked: ${email} (${newCount} failed attempts)`);
          return res.status(429).json({
            success: false,
            message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`
          });
        } else {
          await db.query(
            'UPDATE admins SET failed_attempts=$1 WHERE id=$2',
            [newCount, rows[0].id]
          );
        }
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // ── Success — reset failure counter ───────────────────────
    await db.query(
      'UPDATE admins SET failed_attempts=0, locked_until=NULL WHERE id=$1',
      [rows[0].id]
    );

    const token = signToken(rows[0].id, 'admin');
    res.json({
      success: true, token,
      user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'admin' }
    });

  } catch (err) {
    console.error('adminLogin error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ── POST /api/auth/recruiter-login ───────────────────────────────
exports.recruiterLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const { rows } = await db.query(
      `SELECT r.*,
              d.company_name as drive_company, d.job_role,
              e.name as event_name, e.event_date, e.status as event_status
       FROM recruiters r
       LEFT JOIN drives d ON r.drive_id = d.id
       LEFT JOIN mega_drive_events e ON d.event_id = e.id
       WHERE r.email = $1`,
      [email.trim().toLowerCase()]
    );

    const dummyHash = '$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
    const hash      = rows[0] ? rows[0].password_hash : dummyHash;
    const match     = await bcrypt.compare(password, hash);

    if (!rows[0] || !match)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = signToken(rows[0].id, 'coordinator');
    res.json({
      success: true, token,
      user: {
        id:            rows[0].id,
        name:          rows[0].name,
        email:         rows[0].email,
        company_name:  rows[0].company_name,
        drive_id:      rows[0].drive_id,
        drive_company: rows[0].drive_company,
        job_role:      rows[0].job_role,
        event_name:    rows[0].event_name,
        event_date:    rows[0].event_date,
        event_status:  rows[0].event_status,
        role:          'coordinator'
      }
    });

  } catch (err) {
    console.error('recruiterLogin error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

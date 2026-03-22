const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, studentOnly } = require('../middleware/auth');

router.use(protect, studentOnly);

// GET /api/student/profile
router.get('/profile', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id,name,roll_no,email,phone,branch,year,cgpa,backlogs,skills,projects,resume_url FROM students WHERE id=$1',
      [req.user.id]
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/student/profile
router.put('/profile', async (req, res) => {
  try {
    const { name, phone, cgpa, backlogs, skills, projects, resume_url } = req.body;
    const skillsStr = Array.isArray(skills) ? skills.join(',') : skills;
    const { rows } = await db.query(
      `UPDATE students SET name=$1,phone=$2,cgpa=$3,backlogs=$4,skills=$5,projects=$6,resume_url=$7,updated_at=NOW()
       WHERE id=$8 RETURNING id,name,roll_no,email,phone,branch,year,cgpa,backlogs,skills,projects,resume_url`,
      [name, phone, cgpa, backlogs, skillsStr, projects, resume_url, req.user.id]
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/drives  - only eligible drives
router.get('/drives', async (req, res) => {
  try {
    const { rows: student } = await db.query('SELECT cgpa,backlogs,branch FROM students WHERE id=$1', [req.user.id]);
    const s = student[0];
    const { rows: drives } = await db.query(
      `SELECT * FROM drives
       WHERE eligibility_min_cgpa <= $1
         AND eligibility_backlogs_allowed >= $2
         AND (eligibility_branches IS NULL OR eligibility_branches = '' OR eligibility_branches LIKE $3)
       ORDER BY drive_date DESC`,
      [s.cgpa, s.backlogs, `%${s.branch}%`]
    );
    res.json({ success: true, drives });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/student/apply/:driveId
router.post('/apply/:driveId', async (req, res) => {
  try {
    const { driveId } = req.params;
    const existing = await db.query('SELECT id FROM enrollments WHERE student_id=$1 AND drive_id=$2', [req.user.id, driveId]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'Already applied to this drive' });
    const { rows } = await db.query(
      'INSERT INTO enrollments (student_id,drive_id) VALUES ($1,$2) RETURNING *',
      [req.user.id, driveId]
    );
    res.status(201).json({ success: true, enrollment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/student/journey  - all drives applied to
router.get('/journey', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.status, e.applied_at,
              d.company_name, d.job_role, d.ctc, d.drive_date,
              a.present, a.room, a.slot_time
       FROM enrollments e
       JOIN drives d ON e.drive_id = d.id
       LEFT JOIN attendance a ON a.student_id = e.student_id AND a.drive_id = e.drive_id
       WHERE e.student_id = $1
       ORDER BY d.drive_date DESC`,
      [req.user.id]
    );
    res.json({ success: true, journey: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/student/attendance  - check in with code
router.post('/attendance', async (req, res) => {
  try {
    const { drive_id, roll_no, code } = req.body;
    // Verify student
    const { rows: studentRows } = await db.query('SELECT id FROM students WHERE roll_no=$1', [roll_no]);
    if (studentRows.length === 0) return res.status(400).json({ success: false, message: 'Invalid roll number' });
    const studentId = studentRows[0].id;
    // Verify code
    const { rows: driveRows } = await db.query('SELECT attendance_code,code_generated_at FROM drives WHERE id=$1', [drive_id]);
    if (!driveRows[0]) return res.status(404).json({ success: false, message: 'Drive not found' });
    const drive = driveRows[0];
    if (!drive.attendance_code || drive.attendance_code !== code)
      return res.status(400).json({ success: false, message: 'Invalid attendance code' });
    // Check enrollment
    const enrolled = await db.query('SELECT id FROM enrollments WHERE student_id=$1 AND drive_id=$2', [studentId, drive_id]);
    if (enrolled.rows.length === 0) return res.status(400).json({ success: false, message: 'You are not enrolled in this drive' });
    // Mark present
    const { rows } = await db.query(
      `INSERT INTO attendance (student_id, drive_id, present, checked_in_at)
       VALUES ($1,$2,true,NOW())
       ON CONFLICT (student_id, drive_id) DO UPDATE SET present=true, checked_in_at=NOW()
       RETURNING room, slot_time`,
      [studentId, drive_id]
    );
    res.json({ success: true, message: 'Attendance marked!', room: rows[0].room, slot_time: rows[0].slot_time });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

// Apply protect + adminOnly to all routes
router.use(protect, adminOnly);

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [students, drives, enrollments, present] = await Promise.all([
      db.query('SELECT COUNT(*) FROM students'),
      db.query('SELECT COUNT(*) FROM drives'),
      db.query('SELECT COUNT(*) FROM enrollments'),
      db.query('SELECT COUNT(*) FROM attendance WHERE present = true')
    ]);
    res.json({
      success: true,
      stats: {
        total_students: parseInt(students.rows[0].count),
        total_drives: parseInt(drives.rows[0].count),
        total_enrollments: parseInt(enrollments.rows[0].count),
        total_present: parseInt(present.rows[0].count)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── STUDENTS ─────────────────────────────────────────────────────────────────
// GET /api/admin/students
router.get('/students', async (req, res) => {
  try {
    const { branch, min_cgpa, max_cgpa, backlogs } = req.query;
    let whereClause = [];
    let params = [];
    let i = 1;
    if (branch) { whereClause.push(`branch = $${i++}`); params.push(branch); }
    if (min_cgpa) { whereClause.push(`cgpa >= $${i++}`); params.push(parseFloat(min_cgpa)); }
    if (max_cgpa) { whereClause.push(`cgpa <= $${i++}`); params.push(parseFloat(max_cgpa)); }
    if (backlogs !== undefined && backlogs !== '') { whereClause.push(`backlogs <= $${i++}`); params.push(parseInt(backlogs)); }
    const where = whereClause.length ? 'WHERE ' + whereClause.join(' AND ') : '';
    const { rows } = await db.query(`SELECT id,name,roll_no,email,phone,branch,year,cgpa,backlogs,skills,projects,resume_url FROM students ${where} ORDER BY name`, params);
    res.json({ success: true, students: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DRIVES ───────────────────────────────────────────────────────────────────
// GET /api/admin/drives
router.get('/drives', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM drives ORDER BY drive_date DESC');
    res.json({ success: true, drives: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/drives
router.post('/drives', async (req, res) => {
  try {
    const { company_name, drive_date, job_role, ctc, description, eligibility_min_cgpa, eligibility_backlogs_allowed, eligibility_branches } = req.body;
    const branches = Array.isArray(eligibility_branches) ? eligibility_branches.join(',') : eligibility_branches;
    const { rows } = await db.query(
      `INSERT INTO drives (company_name,drive_date,job_role,ctc,description,eligibility_min_cgpa,eligibility_backlogs_allowed,eligibility_branches)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [company_name, drive_date, job_role, ctc, description, eligibility_min_cgpa || 0, eligibility_backlogs_allowed || 0, branches]
    );
    res.status(201).json({ success: true, drive: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/drives/:id
router.put('/drives/:id', async (req, res) => {
  try {
    const { company_name, drive_date, job_role, ctc, description, eligibility_min_cgpa, eligibility_backlogs_allowed, eligibility_branches, status } = req.body;
    const branches = Array.isArray(eligibility_branches) ? eligibility_branches.join(',') : eligibility_branches;
    const { rows } = await db.query(
      `UPDATE drives SET company_name=$1,drive_date=$2,job_role=$3,ctc=$4,description=$5,eligibility_min_cgpa=$6,eligibility_backlogs_allowed=$7,eligibility_branches=$8,status=$9,updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [company_name, drive_date, job_role, ctc, description, eligibility_min_cgpa, eligibility_backlogs_allowed, branches, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Drive not found' });
    res.json({ success: true, drive: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/drives/:id
router.delete('/drives/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM drives WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Drive deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ENROLLMENTS ──────────────────────────────────────────────────────────────
// GET /api/admin/enrollments/:driveId
router.get('/enrollments/:driveId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.status, e.applied_at, s.name, s.roll_no, s.email, s.branch, s.cgpa, s.backlogs
       FROM enrollments e JOIN students s ON e.student_id = s.id
       WHERE e.drive_id = $1 ORDER BY s.name`,
      [req.params.driveId]
    );
    res.json({ success: true, enrollments: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/enrollments/:enrollmentId/status
router.put('/enrollments/:enrollmentId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['applied', 'shortlisted', 'rejected', 'offered'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const { rows } = await db.query(
      'UPDATE enrollments SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.enrollmentId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    res.json({ success: true, enrollment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
// POST /api/admin/attendance/generate-code
router.post('/attendance/generate-code', async (req, res) => {
  try {
    const { drive_id } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.query(
      'UPDATE drives SET attendance_code=$1, code_generated_at=NOW() WHERE id=$2',
      [code, drive_id]
    );
    res.json({ success: true, code, drive_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/attendance/assign-room
router.post('/attendance/assign-room', async (req, res) => {
  try {
    const { drive_id, student_id, room, slot_time } = req.body;
    await db.query(
      `INSERT INTO attendance (student_id, drive_id, room, slot_time)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id, drive_id) DO UPDATE SET room=$3, slot_time=$4`,
      [student_id, drive_id, room, slot_time]
    );
    res.json({ success: true, message: 'Room assigned' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/attendance/:driveId
router.get('/attendance/:driveId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.present, a.room, a.slot_time, a.checked_in_at,
              s.name, s.roll_no, s.branch
       FROM attendance a JOIN students s ON a.student_id = s.id
       WHERE a.drive_id = $1 ORDER BY a.room, s.name`,
      [req.params.driveId]
    );
    const total = rows.length;
    const present = rows.filter(r => r.present).length;
    res.json({ success: true, attendance: rows, summary: { total, present, absent: total - present } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/reports/drive/:driveId
router.get('/reports/drive/:driveId', async (req, res) => {
  try {
    const [drive, enrolled, shortlisted, offered, present] = await Promise.all([
      db.query('SELECT * FROM drives WHERE id=$1', [req.params.driveId]),
      db.query('SELECT COUNT(*) FROM enrollments WHERE drive_id=$1', [req.params.driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='shortlisted'", [req.params.driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='offered'", [req.params.driveId]),
      db.query('SELECT COUNT(*) FROM attendance WHERE drive_id=$1 AND present=true', [req.params.driveId])
    ]);
    res.json({
      success: true,
      drive: drive.rows[0],
      report: {
        enrolled: parseInt(enrolled.rows[0].count),
        shortlisted: parseInt(shortlisted.rows[0].count),
        offered: parseInt(offered.rows[0].count),
        present: parseInt(present.rows[0].count)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

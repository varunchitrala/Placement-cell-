const db = require('../config/db');

// GET /api/recruiter/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const driveId = req.user.drive_id;
    if (!driveId) return res.json({ success: true, drive: null, stats: {} });

    const { rows: driveRows } = await db.query(
      `SELECT d.*, e.name as event_name, e.event_date, e.status as event_status
       FROM drives d JOIN mega_drive_events e ON d.event_id = e.id WHERE d.id = $1`,
      [driveId]
    );

    const [enrolled, shortlisted, offered, rejected, present] = await Promise.all([
      db.query('SELECT COUNT(*) FROM enrollments WHERE drive_id=$1', [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='shortlisted'", [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='offered'", [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='rejected'", [driveId]),
      db.query('SELECT COUNT(*) FROM attendance WHERE drive_id=$1 AND present=true', [driveId])
    ]);

    res.json({
      success: true,
      drive: driveRows[0] || null,
      stats: {
        enrolled:    parseInt(enrolled.rows[0].count),
        shortlisted: parseInt(shortlisted.rows[0].count),
        offered:     parseInt(offered.rows[0].count),
        rejected:    parseInt(rejected.rows[0].count),
        present:     parseInt(present.rows[0].count)
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/recruiter/students
exports.getStudents = async (req, res) => {
  try {
    const driveId = req.user.drive_id;
    if (!driveId) return res.json({ success: true, students: [] });

    const { rows } = await db.query(
      `SELECT
         e.id   AS enrollment_id, e.status, e.applied_at, e.updated_at, e.updated_by,
         s.id   AS student_id,
         s.name, s.roll_no, s.email, s.phone,
         s.institution_name, s.institution_type,
         s.course, s.branch, s.specialization,
         s.year, s.passout_year, s.cgpa, s.backlogs,
         s.skills, s.photo_url, s.resume_url,
         a.present, a.checked_in_at, a.marked_by
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       LEFT JOIN attendance a ON a.student_id = e.student_id AND a.drive_id = e.drive_id
       WHERE e.drive_id = $1
       ORDER BY s.name`,
      [driveId]
    );
    res.json({ success: true, students: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/recruiter/attendance
exports.markAttendance = async (req, res) => {
  try {
    const { student_id, present } = req.body;
    const driveId = req.user.drive_id;
    if (!driveId) return res.status(400).json({ success: false, message: 'No drive assigned to you.' });
    if (student_id === undefined || present === undefined)
      return res.status(400).json({ success: false, message: 'student_id and present are required.' });

    const { rows: enroll } = await db.query(
      'SELECT id FROM enrollments WHERE student_id=$1 AND drive_id=$2', [student_id, driveId]
    );
    if (!enroll.length)
      return res.status(400).json({ success: false, message: 'Student is not enrolled in this drive.' });

    await db.query(
      `INSERT INTO attendance (student_id, drive_id, present, marked_by, checked_in_at)
       VALUES ($1,$2,$3,'recruiter', CASE WHEN $3 THEN now() ELSE NULL END)
       ON CONFLICT (student_id, drive_id)
       DO UPDATE SET present=$3, marked_by='recruiter', checked_in_at=CASE WHEN $3 THEN now() ELSE NULL END`,
      [student_id, driveId, present]
    );
    res.json({ success: true, message: `Attendance ${present ? 'marked present' : 'marked absent'}.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/recruiter/bulk-attendance
exports.markBulkAttendance = async (req, res) => {
  try {
    const { attendances } = req.body;
    const driveId = req.user.drive_id;
    if (!driveId) return res.status(400).json({ success: false, message: 'No drive assigned.' });

    // BUG FIX: missing validation for attendances array
    if (!Array.isArray(attendances) || attendances.length === 0)
      return res.status(400).json({ success: false, message: 'attendances must be a non-empty array.' });

    // BUG FIX: was using sequential await in loop (N+1 queries). Use Promise.all for parallel execution.
    await Promise.all(attendances.map(a =>
      db.query(
        `INSERT INTO attendance (student_id, drive_id, present, marked_by, checked_in_at)
         VALUES ($1,$2,$3,'recruiter', CASE WHEN $3 THEN now() ELSE NULL END)
         ON CONFLICT (student_id, drive_id)
         DO UPDATE SET present=$3, marked_by='recruiter', checked_in_at=CASE WHEN $3 THEN now() ELSE NULL END`,
        [a.student_id, driveId, a.present]
      )
    ));
    res.json({ success: true, message: `Attendance updated for ${attendances.length} students.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/recruiter/status/:enrollmentId
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const driveId = req.user.drive_id;
    const valid = ['shortlisted','offered','rejected','applied'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    const { rows: check } = await db.query(
      'SELECT id FROM enrollments WHERE id=$1 AND drive_id=$2', [req.params.enrollmentId, driveId]
    );
    if (!check.length)
      return res.status(403).json({ success: false, message: 'Enrollment does not belong to your drive.' });
    const { rows } = await db.query(
      `UPDATE enrollments SET status=$1, updated_at=now(), updated_by='recruiter' WHERE id=$2 RETURNING *`,
      [status, req.params.enrollmentId]
    );
    res.json({ success: true, enrollment: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/recruiter/bulk-status
exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { updates } = req.body;
    const driveId = req.user.drive_id;

    // BUG FIX: missing validation for updates array
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ success: false, message: 'updates must be a non-empty array.' });

    const valid = ['shortlisted','offered','rejected','applied'];

    // BUG FIX: was using sequential await in loop. Use Promise.all.
    await Promise.all(
      updates
        .filter(u => valid.includes(u.status))
        .map(u =>
          db.query(
            `UPDATE enrollments SET status=$1, updated_at=now(), updated_by='recruiter' WHERE id=$2 AND drive_id=$3`,
            [u.status, u.enrollment_id, driveId]
          )
        )
    );
    res.json({ success: true, message: `${updates.length} statuses updated.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const db = require('../config/db');

// GET /api/student/profile
exports.getProfile = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, roll_no, email, phone,
              institution_name, institution_type,
              course, branch, specialization,
              year, passout_year, cgpa, backlogs,
              skills, projects, photo_url, resume_url
       FROM students WHERE id=$1`,
      [req.user.id]
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/student/profile
exports.updateProfile = async (req, res) => {
  try {
    const {
      name, phone, cgpa, backlogs,
      skills, projects,
      specialization, passout_year,
      photo_url, resume_url
    } = req.body;

    // BUG FIX: name was not validated — prevent empty name updates
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
    }

    // BUG FIX: phone was not validated here (only on frontend)
    if (phone && !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits.' });
    }

    const skillsStr = Array.isArray(skills) ? skills.join(',') : (skills || '');

    const { rows } = await db.query(
      `UPDATE students
       SET name=$1, phone=$2, cgpa=$3, backlogs=$4,
           skills=$5, projects=$6,
           specialization=$7, passout_year=$8,
           photo_url=COALESCE($9, photo_url),
           resume_url=COALESCE($10, resume_url)
       WHERE id=$11
       RETURNING id, name, roll_no, email, phone,
                 institution_name, institution_type,
                 course, branch, specialization,
                 year, passout_year, cgpa, backlogs,
                 skills, projects, photo_url, resume_url`,
      [
        String(name).trim(),
        phone ? String(phone).trim() : null,
        parseFloat(cgpa) || 0,
        parseInt(backlogs) || 0,
        skillsStr,
        projects || null,
        specialization || null,
        passout_year ? parseInt(passout_year) : null,
        photo_url  || null,
        resume_url || null,
        req.user.id
      ]
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/student/drives — eligible companies from open events
exports.getEligibleDrives = async (req, res) => {
  try {
    const { rows: [s] } = await db.query('SELECT cgpa,backlogs,branch FROM students WHERE id=$1', [req.user.id]);
    const { rows } = await db.query(
      `SELECT d.*, e.name as event_name, e.event_date, e.status as event_status,
              en.status as enrollment_status
       FROM drives d
       JOIN mega_drive_events e ON d.event_id = e.id
       LEFT JOIN enrollments en ON en.drive_id = d.id AND en.student_id = $1
       WHERE e.status = 'REGISTRATION_OPEN'
         AND d.eligibility_min_cgpa <= $2
         AND d.eligibility_backlogs_allowed >= $3
         AND (d.eligibility_branches IS NULL OR d.eligibility_branches = '' OR d.eligibility_branches ILIKE $4)
       ORDER BY e.event_date DESC, d.company_name`,
      [req.user.id, s.cgpa, s.backlogs, `%${s.branch}%`]
    );
    res.json({ success: true, drives: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/student/apply/:driveId
exports.applyToDrive = async (req, res) => {
  try {
    const { driveId } = req.params;
    const { rows: [drive] } = await db.query(
      `SELECT d.id, e.status as event_status FROM drives d
       JOIN mega_drive_events e ON d.event_id = e.id WHERE d.id=$1`, [driveId]
    );
    if (!drive) return res.status(404).json({ success: false, message: 'Company drive not found.' });
    if (drive.event_status !== 'REGISTRATION_OPEN')
      return res.status(400).json({ success: false, message: 'Registration is not open for this event.' });

    const exist = await db.query('SELECT id FROM enrollments WHERE student_id=$1 AND drive_id=$2', [req.user.id, driveId]);
    if (exist.rows.length) return res.status(400).json({ success: false, message: 'Already applied to this company.' });

    const { rows } = await db.query(
      'INSERT INTO enrollments (student_id,drive_id) VALUES ($1,$2) RETURNING *',
      [req.user.id, driveId]
    );
    res.status(201).json({ success: true, enrollment: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/student/attendance
exports.markAttendance = async (req, res) => {
  try {
    const { drive_id, roll_no } = req.body;

    // BUG FIX: req.user.roll_no was undefined because the auth middleware SELECT was missing roll_no.
    // That is now fixed in middleware/auth.js. This check is correct and will now work.
    if (req.user.roll_no !== roll_no)
      return res.status(400).json({ success: false, message: 'PRN does not match your account.' });

    const { rows: [drive] } = await db.query(
      `SELECT d.id, e.status as event_status FROM drives d
       JOIN mega_drive_events e ON d.event_id = e.id WHERE d.id=$1`, [drive_id]
    );
    if (!drive) return res.status(404).json({ success: false, message: 'Drive not found.' });
    if (drive.event_status !== 'IN_PROGRESS')
      return res.status(400).json({ success: false, message: 'The drive event is not currently in progress.' });

    const { rows: [enroll] } = await db.query(
      'SELECT id FROM enrollments WHERE student_id=$1 AND drive_id=$2', [req.user.id, drive_id]
    );
    if (!enroll) return res.status(400).json({ success: false, message: 'You are not enrolled in this company drive.' });

    await db.query(
      `INSERT INTO attendance (student_id,drive_id,present,checked_in_at)
       VALUES ($1,$2,true,now())
       ON CONFLICT (student_id,drive_id) DO UPDATE SET present=true,checked_in_at=now()`,
      [req.user.id, drive_id]
    );
    res.json({ success: true, message: 'Attendance marked!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/student/journey
exports.getJourney = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT en.id, en.status, en.applied_at, en.drive_id,
              d.company_name, d.job_role, d.ctc,
              e.name as event_name, e.event_date, e.status as event_status,
              a.present, a.checked_in_at
       FROM enrollments en
       JOIN drives d ON en.drive_id = d.id
       JOIN mega_drive_events e ON d.event_id = e.id
       LEFT JOIN attendance a ON a.student_id = en.student_id AND a.drive_id = en.drive_id
       WHERE en.student_id = $1
       ORDER BY e.event_date DESC, d.company_name`,
      [req.user.id]
    );
    res.json({ success: true, journey: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

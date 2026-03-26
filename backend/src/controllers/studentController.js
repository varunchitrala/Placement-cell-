const db = require('../config/db');

// GET /api/student/profile
exports.getProfile = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, roll_no, email, phone, unique_code,
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

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
    }

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
       RETURNING id, name, roll_no, email, phone, unique_code,
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

// GET /api/student/my-code — return the student's 4-digit unique code
exports.getMyCode = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT unique_code, name, roll_no FROM students WHERE id=$1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, unique_code: rows[0].unique_code, name: rows[0].name, roll_no: rows[0].roll_no });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/student/companies — view-only list of companies in open events (no apply)
exports.getCompanies = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.company_name, d.job_role, d.ctc, d.description,
              d.eligibility_min_cgpa, d.eligibility_backlogs_allowed, d.eligibility_branches,
              e.name as event_name, e.event_date, e.status as event_status
       FROM drives d
       JOIN mega_drive_events e ON d.event_id = e.id
       WHERE e.status IN ('REGISTRATION_OPEN','IN_PROGRESS')
       ORDER BY e.event_date DESC, d.company_name`
    );
    res.json({ success: true, companies: rows });
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

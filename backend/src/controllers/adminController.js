const db = require('../config/db');
const bcrypt = require('bcryptjs');

// ─── DASHBOARD ──────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [students, events, companies, enrollments, offered] = await Promise.all([
      db.query('SELECT COUNT(*) FROM students'),
      db.query('SELECT COUNT(*) FROM mega_drive_events'),
      db.query('SELECT COUNT(*) FROM drives'),
      db.query('SELECT COUNT(*) FROM enrollments'),
      db.query("SELECT COUNT(*) FROM enrollments WHERE status='offered'")
    ]);
    const recentEvents = await db.query(
      'SELECT id, name, event_date, status FROM mega_drive_events ORDER BY created_at DESC LIMIT 5'
    );
    res.json({
      success: true,
      stats: {
        total_students:    parseInt(students.rows[0].count),
        total_events:      parseInt(events.rows[0].count),
        total_companies:   parseInt(companies.rows[0].count),
        total_enrollments: parseInt(enrollments.rows[0].count),
        total_offered:     parseInt(offered.rows[0].count)
      },
      recent_events: recentEvents.rows
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── STUDENTS ───────────────────────────────────────
exports.getStudents = async (req, res) => {
  try {
    const { branch, min_cgpa, backlogs, search } = req.query;
    const conds = []; const params = []; let i = 1;
    if (branch)   { conds.push(`branch=$${i++}`);  params.push(branch); }
    if (min_cgpa) { conds.push(`cgpa>=$${i++}`);   params.push(parseFloat(min_cgpa)); }
    if (backlogs !== undefined && backlogs !== '') { conds.push(`backlogs<=$${i++}`); params.push(parseInt(backlogs)); }
    if (search) {
      conds.push(`(name ILIKE $${i} OR roll_no ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT id, name, roll_no, email, phone, unique_code,
              institution_name, institution_type,
              course, branch, specialization,
              year, passout_year, cgpa, backlogs,
              skills, resume_url, photo_url
       FROM students ${where} ORDER BY name`,
      params
    );
    res.json({ success: true, students: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT name,roll_no FROM students WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Student not found' });
    await db.query('DELETE FROM students WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: `Student ${rows[0].name} deleted` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── ADD OFFLINE STUDENT (single) ───────────────────
// Shared logic for one student insert
async function insertOfflineStudent(s) {
  // Generate unique 4-digit code
  let uniqueCode;
  for (let attempt = 0; attempt < 50; attempt++) {
    uniqueCode = String(Math.floor(Math.random() * 9000) + 1000);
    const check = await db.query('SELECT id FROM students WHERE unique_code=$1', [uniqueCode]);
    if (!check.rows.length) break;
    if (attempt === 49) throw new Error('Could not generate unique code');
  }

  const { rows } = await db.query(
    `INSERT INTO students
       (name, roll_no, date_of_birth, email, phone, unique_code,
        institution_name, institution_type,
        course, branch, specialization,
        year, passout_year, cgpa, backlogs,
        skills, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'offline')
     RETURNING id, name, roll_no, email, branch, year, unique_code`,
    [
      s.name.trim(),
      s.roll_no.trim().toUpperCase(),
      s.date_of_birth || null,
      s.email  ? s.email.trim().toLowerCase() : null,
      s.phone  ? s.phone.trim()               : null,
      uniqueCode,
      s.institution_name || 'Sandip University',
      s.institution_type || 'university',
      s.course  ? s.course.trim()  : null,
      s.branch.trim(),
      s.specialization ? s.specialization.trim() : null,
      parseInt(s.year),
      s.passout_year ? parseInt(s.passout_year) : null,
      parseFloat(s.cgpa) || 0,
      parseInt(s.backlogs) || 0,
      s.skills || null,
    ]
  );
  return rows[0];
}

exports.addOfflineStudent = async (req, res) => {
  try {
    const s = req.body;
    if (!s.name || !s.roll_no || !s.branch || !s.year)
      return res.status(400).json({ success: false, message: 'Name, PRN, branch and year are required.' });

    // Check duplicate PRN
    const dup = await db.query('SELECT id FROM students WHERE roll_no=$1', [s.roll_no.trim().toUpperCase()]);
    if (dup.rows.length)
      return res.status(409).json({ success: false, message: `PRN ${s.roll_no} is already registered.` });

    const student = await insertOfflineStudent(s);

    // Optionally enroll into a drive
    if (s.drive_id) {
      const enrollStatus = s.enrollment_status || 'applied';
      await db.query(
        `INSERT INTO enrollments (student_id, drive_id, status, updated_by)
         VALUES ($1,$2,$3,'admin') ON CONFLICT DO NOTHING`,
        [student.id, s.drive_id, enrollStatus]
      );
      // Mark attendance if result implies presence
      if (['shortlisted','offered','rejected'].includes(enrollStatus)) {
        await db.query(
          `INSERT INTO attendance (student_id, drive_id, present, marked_by)
           VALUES ($1,$2,true,'admin') ON CONFLICT DO NOTHING`,
          [student.id, s.drive_id]
        );
      }
    }

    res.status(201).json({ success: true, student });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Duplicate PRN or email.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addOfflineStudentsBulk = async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0)
    return res.status(400).json({ success: false, message: 'students array is required.' });

  const results = { inserted: 0, skipped: [], errors: [] };

  for (const s of students) {
    if (!s.name || !s.roll_no || !s.branch || !s.year) {
      results.skipped.push({ roll_no: s.roll_no || '?', reason: 'Missing required fields' });
      continue;
    }
    try {
      const dup = await db.query('SELECT id FROM students WHERE roll_no=$1', [s.roll_no.trim().toUpperCase()]);
      if (dup.rows.length) {
        results.skipped.push({ roll_no: s.roll_no, reason: 'PRN already exists' });
        continue;
      }
      const student = await insertOfflineStudent(s);
      if (s.drive_id) {
        const enrollStatus = s.enrollment_status || 'applied';
        await db.query(
          `INSERT INTO enrollments (student_id, drive_id, status, updated_by)
           VALUES ($1,$2,$3,'admin') ON CONFLICT DO NOTHING`,
          [student.id, s.drive_id, enrollStatus]
        );
        if (['shortlisted','offered','rejected'].includes(enrollStatus)) {
          await db.query(
            `INSERT INTO attendance (student_id, drive_id, present, marked_by)
             VALUES ($1,$2,true,'admin') ON CONFLICT DO NOTHING`,
            [student.id, s.drive_id]
          );
        }
      }
      results.inserted++;
    } catch (err) {
      results.errors.push({ roll_no: s.roll_no, reason: err.message });
    }
  }

  res.status(201).json({ success: true, ...results });
};

// ─── MEGA DRIVE EVENTS ──────────────────────────────
exports.getEvents = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT e.*,
        COUNT(d.id) AS company_count,
        COUNT(DISTINCT en.student_id) AS student_count
      FROM mega_drive_events e
      LEFT JOIN drives d ON d.event_id = e.id
      LEFT JOIN enrollments en ON en.drive_id = d.id
      GROUP BY e.id ORDER BY e.event_date DESC`);
    res.json({ success: true, events: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createEvent = async (req, res) => {
  try {
    const { name, event_date, description } = req.body;
    if (!name || !event_date)
      return res.status(400).json({ success: false, message: 'Event name and date are required.' });
    const { rows } = await db.query(
      `INSERT INTO mega_drive_events (name, event_date, description) VALUES ($1,$2,$3) RETURNING *`,
      [name, event_date, description || '']
    );
    res.status(201).json({ success: true, event: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateEvent = async (req, res) => {
  try {
    const { name, event_date, description, status } = req.body;
    const { rows } = await db.query(
      `UPDATE mega_drive_events SET name=$1, event_date=$2, description=$3, status=$4, updated_at=now() WHERE id=$5 RETURNING *`,
      [name, event_date, description || '', status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateEventStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['CREATED','REGISTRATION_OPEN','IN_PROGRESS','COMPLETED'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });
    const { rows } = await db.query(
      'UPDATE mega_drive_events SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT name FROM mega_drive_events WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Event not found' });
    await db.query('DELETE FROM mega_drive_events WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: `Event "${rows[0].name}" deleted` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── DRIVES ─────────────────────────────────────────
exports.getDrives = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT d.*, e.name as event_name, e.event_date, e.status as event_status
      FROM drives d JOIN mega_drive_events e ON d.event_id = e.id
      ORDER BY e.event_date DESC, d.company_name`);
    res.json({ success: true, drives: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getEventDrives = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*,
         COUNT(DISTINCT en.student_id) as enrolled,
         COUNT(DISTINCT a.student_id) FILTER (WHERE a.present=true) as present,
         COUNT(DISTINCT en.student_id) FILTER (WHERE en.status='offered') as offered
       FROM drives d
       LEFT JOIN enrollments en ON en.drive_id = d.id
       LEFT JOIN attendance  a ON a.drive_id = d.id
       WHERE d.event_id = $1
       GROUP BY d.id ORDER BY d.company_name`,
      [req.params.eventId]
    );
    res.json({ success: true, drives: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createDrive = async (req, res) => {
  try {
    const {
      event_id, company_name,
      job_role, ctc, description,
      eligibility_min_cgpa, eligibility_backlogs_allowed, eligibility_branches,
      mode
    } = req.body;

    // job_role is now optional — recruiter fills it in later
    if (!event_id || !company_name)
      return res.status(400).json({ success: false, message: 'Event and company name are required.' });

    const driveMode = ['online', 'offline'].includes(mode) ? mode : 'offline';

    const branches = Array.isArray(eligibility_branches)
      ? eligibility_branches.join(',')
      : (eligibility_branches || '');

    const { rows } = await db.query(
      `INSERT INTO drives
         (event_id, company_name, job_role, ctc, description,
          eligibility_min_cgpa, eligibility_backlogs_allowed, eligibility_branches, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        event_id,
        company_name,
        job_role  ? job_role.trim()  : null,
        ctc       ? ctc              : null,
        description || '',
        parseFloat(eligibility_min_cgpa)        || 0,
        parseInt(eligibility_backlogs_allowed)  || 0,
        branches,
        driveMode
      ]
    );
    res.status(201).json({ success: true, drive: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateDrive = async (req, res) => {
  try {
    const {
      company_name, job_role, ctc, description,
      eligibility_min_cgpa, eligibility_backlogs_allowed, eligibility_branches,
      mode
    } = req.body;
    const driveMode = ['online', 'offline'].includes(mode) ? mode : 'offline';
    const branches = Array.isArray(eligibility_branches)
      ? eligibility_branches.join(',')
      : (eligibility_branches || '');
    const { rows } = await db.query(
      `UPDATE drives
       SET company_name=$1, job_role=$2, ctc=$3, description=$4,
           eligibility_min_cgpa=$5, eligibility_backlogs_allowed=$6,
           eligibility_branches=$7, mode=$8, updated_at=now()
       WHERE id=$9 RETURNING *`,
      [
        company_name,
        job_role  ? job_role.trim()  : null,
        ctc       ? ctc              : null,
        description || '',
        parseFloat(eligibility_min_cgpa)       || 0,
        parseInt(eligibility_backlogs_allowed) || 0,
        branches,
        driveMode,
        req.params.id
      ]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Company drive not found' });
    res.json({ success: true, drive: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteDrive = async (req, res) => {
  try {
    const { rows: check } = await db.query('SELECT id FROM drives WHERE id=$1', [req.params.id]);
    if (!check[0]) return res.status(404).json({ success: false, message: 'Company drive not found' });
    await db.query('DELETE FROM drives WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Company drive deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── RECRUITERS ─────────────────────────────────────
exports.getRecruiters = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.id, r.name, r.email, r.company_name, r.drive_id, r.created_at,
             d.company_name as drive_company, d.job_role,
             e.name as event_name, e.event_date
      FROM recruiters r
      LEFT JOIN drives d ON r.drive_id = d.id
      LEFT JOIN mega_drive_events e ON d.event_id = e.id
      ORDER BY r.created_at DESC`);
    res.json({ success: true, recruiters: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createRecruiter = async (req, res) => {
  try {
    const { name, email, password, company_name, drive_id } = req.body;
    if (!name || !email || !password || !company_name)
      return res.status(400).json({ success: false, message: 'Name, email, password and company name required.' });

    // Max 2 coordinators per drive
    if (drive_id) {
      const { rows: existing } = await db.query(
        'SELECT COUNT(*) FROM recruiters WHERE drive_id=$1', [drive_id]
      );
      if (parseInt(existing[0].count) >= 2)
        return res.status(400).json({ success: false, message: 'Maximum 2 coordinators allowed per company. Please remove an existing coordinator first.' });
    }

    const exist = await db.query('SELECT id FROM recruiters WHERE email=$1', [email.trim().toLowerCase()]);
    if (exist.rows.length) return res.status(400).json({ success: false, message: 'Email already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO recruiters (name,email,password_hash,company_name,drive_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email,company_name,drive_id,created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, company_name.trim(), drive_id || null, req.user.id]
    );
    res.status(201).json({ success: true, coordinator: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteRecruiter = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT name FROM recruiters WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Recruiter not found' });
    await db.query('DELETE FROM recruiters WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: `Recruiter ${rows[0].name} deleted` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── ENROLLMENTS ────────────────────────────────────
exports.getEnrollments = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.status, e.applied_at, e.updated_at, e.updated_by, e.student_id,
              s.name, s.roll_no, s.email, s.phone,
              s.institution_name, s.institution_type,
              s.course, s.branch, s.specialization,
              s.year, s.passout_year, s.cgpa, s.backlogs,
              s.photo_url, s.resume_url
       FROM enrollments e JOIN students s ON e.student_id=s.id
       WHERE e.drive_id=$1 ORDER BY s.name`,
      [req.params.driveId]
    );
    res.json({ success: true, enrollments: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['applied','shortlisted','rejected','offered'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const { rows } = await db.query(
      `UPDATE enrollments SET status=$1,updated_at=now(),updated_by='admin' WHERE id=$2 RETURNING *`,
      [status, req.params.enrollmentId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    res.json({ success: true, enrollment: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── ATTENDANCE SUMMARY ─────────────────────────────
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        s.id AS student_id, s.name, s.roll_no, s.branch, s.year, s.cgpa, s.email,
        s.course, s.institution_name, s.institution_type, s.passout_year, s.photo_url,
        COUNT(DISTINCT e.drive_id)                                         AS applied_count,
        COUNT(DISTINCT a.drive_id) FILTER (WHERE a.present = true)         AS attended_count,
        COUNT(DISTINCT e.drive_id) FILTER (WHERE e.status = 'shortlisted') AS shortlisted_count,
        COUNT(DISTINCT e.drive_id) FILTER (WHERE e.status = 'offered')     AS offered_count
      FROM students s
      LEFT JOIN enrollments e ON e.student_id = s.id
      LEFT JOIN attendance  a ON a.student_id = s.id AND a.drive_id = e.drive_id
      GROUP BY s.id, s.name, s.roll_no, s.branch, s.year, s.cgpa, s.email,
               s.course, s.institution_name, s.institution_type, s.passout_year, s.photo_url
      HAVING COUNT(DISTINCT e.drive_id) > 0
      ORDER BY s.name
    `);
    const totalStudents = rows.length;
    const totalAttended = rows.filter(r => parseInt(r.attended_count) > 0).length;
    const totalOffered  = rows.filter(r => parseInt(r.offered_count)  > 0).length;
    res.json({ success: true, students: rows, summary: { totalStudents, totalAttended, totalOffered } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStudentAttendanceDetail = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        d.id AS drive_id, d.company_name, d.job_role, d.ctc,
        e.name as event_name, e.event_date,
        en.status AS result, en.applied_at,
        a.present, a.checked_in_at, a.marked_by
      FROM enrollments en
      JOIN drives d ON en.drive_id = d.id
      JOIN mega_drive_events e ON d.event_id = e.id
      LEFT JOIN attendance a ON a.student_id = en.student_id AND a.drive_id = en.drive_id
      WHERE en.student_id = $1
      ORDER BY d.company_name
    `, [req.params.studentId]);
    res.json({ success: true, companies: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── DRIVE PIPELINE ─────────────────────────────────
exports.getDrivePipeline = async (req, res) => {
  try {
    const driveId = req.params.driveId;
    const [drive, enrolled, present, shortlisted, offered, rejected] = await Promise.all([
      db.query(`SELECT d.*, e.name as event_name, e.event_date, e.status as event_status
                FROM drives d JOIN mega_drive_events e ON d.event_id=e.id WHERE d.id=$1`, [driveId]),
      db.query('SELECT COUNT(*) FROM enrollments WHERE drive_id=$1', [driveId]),
      db.query('SELECT COUNT(*) FROM attendance WHERE drive_id=$1 AND present=true', [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='shortlisted'", [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='offered'", [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='rejected'", [driveId])
    ]);

    if (!drive.rows[0]) return res.status(404).json({ success: false, message: 'Drive not found' });

    const { rows: branchRows } = await db.query(`
      SELECT s.branch,
        COUNT(en.id) as enrolled,
        COUNT(a.id) FILTER (WHERE a.present=true) as present,
        COUNT(en.id) FILTER (WHERE en.status='shortlisted') as shortlisted,
        COUNT(en.id) FILTER (WHERE en.status='offered') as offered
      FROM enrollments en
      JOIN students s ON en.student_id=s.id
      LEFT JOIN attendance a ON a.student_id=en.student_id AND a.drive_id=en.drive_id
      WHERE en.drive_id=$1
      GROUP BY s.branch ORDER BY enrolled DESC`, [driveId]);

    res.json({
      success: true, drive: drive.rows[0],
      pipeline: {
        enrolled:    parseInt(enrolled.rows[0].count),
        present:     parseInt(present.rows[0].count),
        shortlisted: parseInt(shortlisted.rows[0].count),
        offered:     parseInt(offered.rows[0].count),
        rejected:    parseInt(rejected.rows[0].count)
      },
      branches: branchRows
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getDriveReport = async (req, res) => {
  try {
    const { driveId } = req.params;
    const [drive, enrolled, shortlisted, offered, present] = await Promise.all([
      db.query(`SELECT d.*, e.name as event_name, e.status as event_status
                FROM drives d JOIN mega_drive_events e ON d.event_id=e.id WHERE d.id=$1`, [driveId]),
      db.query('SELECT COUNT(*) FROM enrollments WHERE drive_id=$1', [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='shortlisted'", [driveId]),
      db.query("SELECT COUNT(*) FROM enrollments WHERE drive_id=$1 AND status='offered'", [driveId]),
      db.query('SELECT COUNT(*) FROM attendance WHERE drive_id=$1 AND present=true', [driveId])
    ]);

    if (!drive.rows[0]) return res.status(404).json({ success: false, message: 'Drive not found' });

    res.json({
      success: true, drive: drive.rows[0],
      report: {
        enrolled:    parseInt(enrolled.rows[0].count),
        shortlisted: parseInt(shortlisted.rows[0].count),
        offered:     parseInt(offered.rows[0].count),
        present:     parseInt(present.rows[0].count)
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

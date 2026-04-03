const db = require('../config/db');

// ─── EXCEL EXPORT — full data for all report types ──────────────

// GET /api/admin/export/full
exports.getFullExportData = async (req, res) => {
  try {

    // 1. All students with full profile
    const { rows: students } = await db.query(`
      SELECT
        s.id, s.name, s.roll_no, s.email, s.phone,
        s.institution_name, s.institution_type,
        s.course, s.branch, s.specialization,
        s.year, s.passout_year, s.cgpa, s.backlogs,
        s.skills, s.resume_url,
        COALESCE(s.source,'online') AS source,
        COUNT(DISTINCT e.drive_id)                                          AS applied_count,
        COUNT(DISTINCT a.drive_id) FILTER (WHERE a.present = true)          AS attended_count,
        COUNT(DISTINCT e.drive_id) FILTER (WHERE e.status = 'shortlisted')  AS shortlisted_count,
        COUNT(DISTINCT e.drive_id) FILTER (WHERE e.status = 'offered')      AS offered_count
      FROM students s
      LEFT JOIN enrollments e ON e.student_id = s.id
      LEFT JOIN attendance  a ON a.student_id = s.id AND a.drive_id = e.drive_id
      GROUP BY s.id ORDER BY s.name
    `);

    // 2. All companies with stats
    const { rows: companies } = await db.query(`
      SELECT
        d.id, d.company_name, d.job_role, d.ctc,
        d.eligibility_min_cgpa, d.eligibility_backlogs_allowed, d.eligibility_branches,
        e.name AS event_name, e.event_date, e.status AS event_status,
        COUNT(DISTINCT en.student_id)                                        AS enrolled,
        COUNT(DISTINCT a.student_id)  FILTER (WHERE a.present = true)        AS present,
        COUNT(DISTINCT en.student_id) FILTER (WHERE en.status='shortlisted') AS shortlisted,
        COUNT(DISTINCT en.student_id) FILTER (WHERE en.status='offered')     AS offered,
        COUNT(DISTINCT en.student_id) FILTER (WHERE en.status='rejected')    AS rejected
      FROM drives d
      JOIN mega_drive_events e ON d.event_id = e.id
      LEFT JOIN enrollments en ON en.drive_id = d.id
      LEFT JOIN attendance  a  ON a.drive_id  = d.id
      GROUP BY d.id, e.id ORDER BY e.event_date DESC, d.company_name
    `);

    // 3. All events with stats
    const { rows: events } = await db.query(`
      SELECT
        e.id, e.name, e.event_date, e.status, e.description,
        COUNT(DISTINCT d.id)                                               AS company_count,
        COUNT(DISTINCT en.student_id)                                      AS total_enrolled,
        COUNT(DISTINCT en.student_id) FILTER (WHERE en.status='offered')   AS total_offered,
        COUNT(DISTINCT a.student_id)  FILTER (WHERE a.present = true)      AS total_present
      FROM mega_drive_events e
      LEFT JOIN drives d      ON d.event_id  = e.id
      LEFT JOIN enrollments en ON en.drive_id = d.id
      LEFT JOIN attendance  a  ON a.drive_id  = d.id
      GROUP BY e.id ORDER BY e.event_date DESC
    `);

    // 4. Full enrollment details (every student × company row)
    const { rows: enrollments } = await db.query(`
      SELECT
        s.name, s.roll_no, s.email, s.phone,
        s.institution_name, s.course, s.branch, s.year, s.cgpa, s.backlogs,
        COALESCE(s.source,'online') AS source,
        d.company_name, d.job_role, d.ctc,
        e.name AS event_name, e.event_date,
        en.status AS result, en.applied_at, en.updated_at,
        a.present, a.checked_in_at
      FROM enrollments en
      JOIN students s ON en.student_id = s.id
      JOIN drives d   ON en.drive_id   = d.id
      JOIN mega_drive_events e ON d.event_id = e.id
      LEFT JOIN attendance a ON a.student_id = en.student_id AND a.drive_id = en.drive_id
      ORDER BY e.event_date DESC, d.company_name, s.name
    `);

    res.json({ success: true, students, companies, events, enrollments });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const token = auth.split(' ')[1];

  try {
    // Only enforce HS256 — no issuer check so old tokens keep working
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    if (!['admin', 'recruiter', 'student'].includes(decoded.role)) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    if (decoded.role === 'admin') {
      const { rows } = await db.query(
        'SELECT id, name, email, role FROM admins WHERE id=$1',
        [decoded.id]
      );
      if (!rows[0]) return res.status(401).json({ success: false, message: 'Account not found.' });
      req.user = { ...rows[0], role: 'admin' };

    } else if (decoded.role === 'recruiter') {
      const { rows } = await db.query(
        'SELECT id, name, email, company_name, drive_id, role FROM recruiters WHERE id=$1',
        [decoded.id]
      );
      if (!rows[0]) return res.status(401).json({ success: false, message: 'Account not found.' });
      req.user = { ...rows[0], role: 'recruiter' };

    } else {
      // BUG FIX: roll_no was missing from the SELECT — studentController.markAttendance
      // checks req.user.roll_no, so it must be fetched here.
      const { rows } = await db.query(
        `SELECT id, name, roll_no, email, branch, year, cgpa, backlogs,
                skills, projects, resume_url, role
         FROM students WHERE id=$1`,
        [decoded.id]
      );
      if (!rows[0]) return res.status(401).json({ success: false, message: 'Account not found.' });
      req.user = { ...rows[0], role: 'student' };
    }

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required.' });
};

const studentOnly = (req, res, next) => {
  if (req.user?.role === 'student') return next();
  res.status(403).json({ success: false, message: 'Student access required.' });
};

const recruiterOnly = (req, res, next) => {
  if (req.user?.role === 'recruiter') return next();
  res.status(403).json({ success: false, message: 'Recruiter access required.' });
};

module.exports = { protect, adminOnly, studentOnly, recruiterOnly };

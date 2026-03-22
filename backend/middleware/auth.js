const jwt = require('jsonwebtoken');
const db = require('../config/db');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user;
    if (decoded.role === 'admin') {
      const { rows } = await db.query('SELECT id,name,email,role FROM admins WHERE id=$1', [decoded.id]);
      user = rows[0];
    } else {
      const { rows } = await db.query('SELECT id,name,email,role,roll_no,branch,year,cgpa,backlogs,skills,projects,resume_url FROM students WHERE id=$1', [decoded.id]);
      user = rows[0];
    }
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = { ...user, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required' });
};

const studentOnly = (req, res, next) => {
  if (req.user && req.user.role === 'student') return next();
  res.status(403).json({ success: false, message: 'Student access required' });
};

module.exports = { protect, adminOnly, studentOnly };

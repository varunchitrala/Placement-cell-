const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, role } = req.body;
    let user;
    if (role === 'admin') {
      const { rows } = await db.query('SELECT * FROM admins WHERE email = $1', [identifier]);
      user = rows[0];
    } else {
      const { rows } = await db.query(
        'SELECT * FROM students WHERE email = $1 OR roll_no = $1', [identifier]
      );
      user = rows[0];
    }
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateToken(user.id, user.role || role);
    res.json({
      success: true, token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role || role, roll_no: user.roll_no || null }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/register-student
router.post('/register-student', async (req, res) => {
  try {
    const { name, roll_no, email, phone, branch, year, password } = req.body;
    const exist = await db.query('SELECT id FROM students WHERE email=$1 OR roll_no=$2', [email, roll_no]);
    if (exist.rows.length > 0) return res.status(400).json({ success: false, message: 'Student already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO students (name,roll_no,email,phone,branch,year,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,email,role,roll_no',
      [name, roll_no, email, phone || '', branch, year, hash]
    );
    const student = rows[0];
    const token = generateToken(student.id, 'student');
    res.status(201).json({ success: true, token, user: { ...student, role: 'student' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/setup-admin  (first-time only)
router.post('/setup-admin', async (req, res) => {
  try {
    const count = await db.query('SELECT COUNT(*) FROM admins');
    if (parseInt(count.rows[0].count) > 0)
      return res.status(403).json({ success: false, message: 'Admin already exists.' });
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO admins (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email',
      [name, email, hash]
    );
    res.status(201).json({ success: true, message: 'Admin created!', admin: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

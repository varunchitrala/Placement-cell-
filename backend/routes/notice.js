const express = require('express');
const router = express.Router();
const db = require('../config/db');
const QRCode = require('qrcode');

// GET /api/notice/drive/:driveId  - public notice board info
router.get('/drive/:driveId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, company_name, drive_date, job_role, attendance_code, code_generated_at FROM drives WHERE id=$1',
      [req.params.driveId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Drive not found' });
    const drive = rows[0];
    // Generate QR Code pointing to the student attendance page
    const attendanceUrl = `${req.protocol}://${req.get('host')}/notice.html?drive=${drive.id}`;
    const qrCode = await QRCode.toDataURL(attendanceUrl);
    res.json({ success: true, drive, qr_code: qrCode, attendance_url: attendanceUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/notice/drives  - list active drives (no auth required)
router.get('/drives', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, company_name, drive_date, job_role, ctc FROM drives WHERE status IN ('upcoming','active') ORDER BY drive_date ASC"
    );
    res.json({ success: true, drives: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

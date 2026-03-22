const router = require('express').Router();
const db = require('../config/db');
const QRCode = require('qrcode');

// GET /api/notice/drive/:driveId  – public, returns code + QR
router.get('/drive/:driveId', async (req, res) => {
  try {
    // BUG FIX: was selecting drive_date which was a dropped column. Now selecting only valid columns.
    const { rows: [drive] } = await db.query(
      'SELECT id, company_name, job_role FROM drives WHERE id=$1',
      [req.params.driveId]
    );
    if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });
    const { rows: [session] } = await db.query(
      "SELECT code FROM attendance_sessions WHERE drive_id=$1 AND status='ACTIVE' LIMIT 1",
      [drive.id]
    );
    const attendanceUrl = `${req.protocol}://${req.get('host')}/notice.html?drive=${drive.id}`;
    const qrCode = session ? await QRCode.toDataURL(attendanceUrl) : null;
    res.json({ success: true, drive, session: session || null, qr_code: qrCode, attendance_url: attendanceUrl });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/notice/drives  – public list of active drives
router.get('/drives', async (req, res) => {
  try {
    // BUG FIX: was filtering by drives.status which was a dropped column.
    // Now filter by the parent event status via JOIN.
    const { rows } = await db.query(
      `SELECT d.id, d.company_name, d.job_role, d.ctc,
              e.event_date, e.status as event_status
       FROM drives d
       JOIN mega_drive_events e ON d.event_id = e.id
       WHERE e.status IN ('REGISTRATION_OPEN','IN_PROGRESS')
       ORDER BY e.event_date ASC, d.company_name`
    );
    res.json({ success: true, drives: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

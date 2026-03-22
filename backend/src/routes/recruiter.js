const router = require('express').Router();
const { protect, recruiterOnly } = require('../middleware/auth');
const c = require('../controllers/recruiterController');

router.use(protect, recruiterOnly);

router.get('/dashboard',                      c.getDashboard);
router.get('/students',                       c.getStudents);

// Recruiter fills in job role, CTC, description for their assigned drive
router.put('/drive-details',                  c.updateDriveDetails);

router.post('/attendance',                    c.markAttendance);
router.post('/bulk-attendance',               c.markBulkAttendance);
router.put('/status/:enrollmentId',           c.updateStatus);
router.put('/bulk-status',                    c.bulkUpdateStatus);

module.exports = router;

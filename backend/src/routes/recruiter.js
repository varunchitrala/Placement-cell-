const router = require('express').Router();
const { protect, recruiterOnly } = require('../middleware/auth');
const c = require('../controllers/recruiterController');

router.use(protect, recruiterOnly);

router.get('/dashboard',                      c.getDashboard);
router.get('/students',                       c.getStudents);
router.post('/attendance',                    c.markAttendance);
router.post('/bulk-attendance',               c.markBulkAttendance);
router.put('/status/:enrollmentId',           c.updateStatus);
router.put('/bulk-status',                    c.bulkUpdateStatus);

module.exports = router;

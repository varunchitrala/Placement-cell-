const router = require('express').Router();
const { protect, studentOnly } = require('../middleware/auth');
const c = require('../controllers/studentController');

router.use(protect, studentOnly);

router.get('/profile',        c.getProfile);
router.put('/profile',        c.updateProfile);
router.get('/drives',         c.getEligibleDrives);
router.post('/apply/:driveId',c.applyToDrive);
router.post('/attendance',    c.markAttendance);
router.get('/journey',        c.getJourney);

module.exports = router;

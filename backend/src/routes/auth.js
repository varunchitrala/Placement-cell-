const router = require('express').Router();
const c = require('../controllers/authController');

// Public — called by register.html on page load
router.get('/registration-status', c.getRegistrationStatus);

router.post('/register-student',  c.registerStudent);
router.post('/student-login',     c.studentLogin);
router.post('/admin-login',       c.adminLogin);
router.post('/recruiter-login',   c.recruiterLogin);

// NOTE: There is NO /setup-admin or /change-password endpoint.
// Admin credentials are managed exclusively via:
//   node scripts/reset-admin.js   (run locally on the server)

module.exports = router;

const router = require('express').Router();
const c = require('../controllers/authController');

router.post('/register-student',  c.registerStudent);
router.post('/student-login',     c.studentLogin);
router.post('/admin-login',       c.adminLogin);
router.post('/recruiter-login',   c.recruiterLogin);
router.post('/setup-admin',       c.setupAdmin);

module.exports = router;

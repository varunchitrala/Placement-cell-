const router = require('express').Router();
const { protect, studentOnly } = require('../middleware/auth');
const c = require('../controllers/studentController');

router.use(protect, studentOnly);

router.get('/profile',        c.getProfile);
router.put('/profile',        c.updateProfile);
router.get('/my-code',        c.getMyCode);
router.get('/companies',      c.getCompanies);
router.get('/journey',        c.getJourney);

module.exports = router;

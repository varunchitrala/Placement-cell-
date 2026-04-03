const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const c = require('../controllers/adminController');
const ex = require('../controllers/exportController');

router.use(protect, adminOnly);

// Dashboard
router.get('/dashboard', c.getDashboard);

// Students
router.get('/students',              c.getStudents);
router.delete('/students/:id',       c.deleteStudent);
router.post('/students/offline',     c.addOfflineStudent);
router.post('/students/offline-bulk',c.addOfflineStudentsBulk);

// Mega Drive Events
router.get('/events',                 c.getEvents);
router.post('/events',                c.createEvent);
router.put('/events/:id',             c.updateEvent);
router.put('/events/:id/status',      c.updateEventStatus);
router.delete('/events/:id',          c.deleteEvent);
router.get('/events/:eventId/drives', c.getEventDrives);

// Companies
router.get('/drives',          c.getDrives);
router.post('/drives',         c.createDrive);
router.put('/drives/:id',      c.updateDrive);
router.delete('/drives/:id',   c.deleteDrive);

// Recruiters
router.get('/recruiters',         c.getRecruiters);
router.post('/recruiters',        c.createRecruiter);
router.delete('/recruiters/:id',  c.deleteRecruiter);

// Enrollments
router.get('/enrollments/:driveId',             c.getEnrollments);
router.put('/enrollments/:enrollmentId/status', c.updateEnrollmentStatus);

// Attendance
router.get('/attendance-summary',           c.getAttendanceSummary);
router.get('/attendance-detail/:studentId', c.getStudentAttendanceDetail);

// Pipeline
router.get('/pipeline/:driveId', c.getDrivePipeline);

// Reports
router.get('/reports/drive/:driveId', c.getDriveReport);

// Excel Export
router.get('/export/full', ex.getFullExportData);

module.exports = router;

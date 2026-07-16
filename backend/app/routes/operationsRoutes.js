const router = require('express').Router();
const controller = require('../controllers/operationsController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor'));
router.get('/cockpit', controller.cockpit);
module.exports = router;

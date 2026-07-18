const router = require('express').Router();
const controller = require('../controllers/operationsController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/pending-menu', controller.pendingMenu);
router.get('/cockpit', requireRoles('admin', 'supervisor', 'estoquista'), controller.cockpit);
module.exports = router;

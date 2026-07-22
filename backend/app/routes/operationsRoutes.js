const router = require('express').Router();
const controller = require('../controllers/operationsController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/pending-menu', controller.pendingMenu);
router.get('/cockpit', requireModule('operationsCockpit'), controller.cockpit);
module.exports = router;

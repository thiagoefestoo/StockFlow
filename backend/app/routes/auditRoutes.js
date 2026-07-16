const router = require('express').Router();
const controller = require('../controllers/auditController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor'));
router.get('/', controller.list);
module.exports = router;

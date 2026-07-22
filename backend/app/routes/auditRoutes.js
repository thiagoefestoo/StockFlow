const router = require('express').Router();
const controller = require('../controllers/auditController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('audit'));
router.get('/', controller.list);
module.exports = router;

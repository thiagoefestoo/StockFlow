const router = require('express').Router();
const controller = require('../controllers/approvalController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('approvals'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/:id/approve', requireRoles('admin'), controller.approve);
router.post('/:id/reject', requireRoles('admin'), controller.reject);
module.exports = router;

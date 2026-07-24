const router = require('express').Router();
const controller = require('../controllers/approvalController');
const { authenticate, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('approvals'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
module.exports = router;

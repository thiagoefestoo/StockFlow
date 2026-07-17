const router = require('express').Router();
const controller = require('../controllers/approvalController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor', 'estoquista'));
router.get('/', controller.list);
router.get('/:id', controller.get);
module.exports = router;

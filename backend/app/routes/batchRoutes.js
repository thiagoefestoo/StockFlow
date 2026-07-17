const router = require('express').Router();
const controller = require('../controllers/batchController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor', 'estoquista'));
router.get('/', controller.list);
router.post('/', controller.create);
module.exports = router;

const router = require('express').Router();
const controller = require('../controllers/batchController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor', 'estoquista'), requireModule('receiving'));
router.get('/', controller.list);
router.post('/', controller.create);
module.exports = router;

const router = require('express').Router();
const controller = require('../controllers/batchController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('receiving'));
router.get('/', controller.list);
router.post('/', controller.create);
module.exports = router;

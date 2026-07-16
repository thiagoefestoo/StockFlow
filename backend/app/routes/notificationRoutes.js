const router = require('express').Router();
const controller = require('../controllers/notificationController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/', controller.list);
router.post('/generate', requireRoles('admin', 'supervisor'), controller.generate);
router.post('/:id/read', controller.markRead);
module.exports = router;

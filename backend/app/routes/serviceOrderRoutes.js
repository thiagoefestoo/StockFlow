const router = require('express').Router();
const controller = require('../controllers/serviceOrderController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/', controller.list);
router.post('/', requireRoles('admin', 'supervisor', 'tecnico'), controller.create);
router.put('/:id', requireRoles('admin'), controller.update);
module.exports = router;

const router = require('express').Router();
const controller = require('../controllers/serviceOrderController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('serviceOrders'));
router.get('/', controller.list);
router.post('/', requireRoles('admin', 'supervisor', 'tecnico'), controller.create);
router.put('/:id', requireRoles('admin'), controller.update);
module.exports = router;

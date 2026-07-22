const router = require('express').Router();
const controller = require('../controllers/serviceOrderController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireModule('serviceOrders'));
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
module.exports = router;

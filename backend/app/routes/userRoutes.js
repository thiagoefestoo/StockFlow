const router = require('express').Router();
const controller = require('../controllers/userController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');

router.use(authenticate, requireRoles('admin'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.patch('/:id/password', controller.resetPassword);
router.delete('/:id', controller.remove);

module.exports = router;

const router = require('express').Router();
const controller = require('../controllers/materialController');
const { authenticate, requireRoles } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requireRoles('admin', 'supervisor'), controller.create);
router.put('/:id', requireRoles('admin', 'supervisor'), controller.update);
module.exports = router;

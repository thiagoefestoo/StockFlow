const router = require('express').Router();
const controller = require('../controllers/companyController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate, requireRoles('admin', 'supervisor'), requireModule('technicians'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
module.exports = router;

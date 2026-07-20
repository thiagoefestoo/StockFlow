const router = require('express').Router();
const controller = require('../controllers/materialController');
const { authenticate, requireRoles, requireModule } = require('../middlewares/authMiddleware');
router.use(authenticate);
router.get('/', requireModule('stock', 'receiving', 'transfers', 'materialRequests', 'technicianInbox', 'technicianLosses'), controller.list);
router.get('/:id', requireModule('stock', 'receiving', 'transfers', 'materialRequests', 'technicianInbox', 'technicianLosses'), controller.get);
router.post('/', requireRoles('admin', 'supervisor', 'estoquista'), requireModule('stock'), controller.create);
router.put('/:id', requireRoles('admin', 'supervisor', 'estoquista'), requireModule('stock'), controller.update);
module.exports = router;

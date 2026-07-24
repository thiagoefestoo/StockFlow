const router = require('express').Router({ mergeParams: true });
const controller = require('../controllers/technicianToolController');
const { authenticate, requireModule } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.get('/', requireModule('technicians', 'technicianTools'), controller.list);
router.get('/term', requireModule('technicians', 'technicianTools'), controller.termData);
router.post('/', requireModule('technicianToolsEdit'), controller.create);
router.put('/:id', requireModule('technicianToolsEdit'), controller.update);
router.post('/:id/remove', requireModule('technicianToolsEdit'), controller.remove);

module.exports = router;

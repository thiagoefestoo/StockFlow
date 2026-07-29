const router = require('express').Router({ mergeParams: true });
const controller = require('../controllers/technicianToolController');
const { authenticate, requireModule } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.get('/', requireModule('technicians', 'technicianTools', 'technicianLosses'), controller.list);
router.get('/available-stock', requireModule('technicians', 'technicianTools', 'technicianToolsEdit'), controller.availableStock);
router.get('/term', requireModule('technicians', 'technicianTools'), controller.termData);
router.get('/documents', requireModule('technicians', 'technicianTools'), controller.listDocuments);
router.get('/documents/:documentId', requireModule('technicians', 'technicianTools'), controller.getDocument);
router.post('/documents', requireModule('technicianToolsEdit'), controller.uploadDocument);
router.delete('/documents/:documentId', requireModule('technicianToolsEdit'), controller.deleteDocument);
router.post('/', requireModule('technicianToolsEdit'), controller.create);
router.put('/:id', requireModule('technicianToolsEdit'), controller.update);
router.post('/:id/remove', requireModule('technicianToolsEdit'), controller.remove);

module.exports = router;

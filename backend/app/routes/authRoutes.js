const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');
router.post('/setup-admin', controller.setupAdmin);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);
router.put('/me', authenticate, controller.updateMe);
router.patch('/me/password', authenticate, controller.changePassword);
module.exports = router;

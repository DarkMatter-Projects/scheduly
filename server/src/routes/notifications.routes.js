const { Router } = require('express');
const ctrl = require('../controllers/notifications.controller');
const authenticate = require('../middleware/auth');

const router = Router();
router.get('/',           authenticate, ctrl.list);
router.get('/unread-count', authenticate, ctrl.unreadCount);
router.post('/:id/read',  authenticate, ctrl.markRead);
router.post('/read-all',  authenticate, ctrl.markAllRead);

module.exports = router;

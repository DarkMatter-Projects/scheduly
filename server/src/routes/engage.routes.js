const { Router } = require('express');
const ctrl = require('../controllers/engage.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/threads', authenticate, ctrl.listThreads);
router.get('/threads/counts', authenticate, ctrl.counts);
router.post('/refresh', authenticate, ctrl.refresh);
router.get('/threads/:id', authenticate, ctrl.getThread);
router.post('/threads/:id/read', authenticate, ctrl.markRead);
router.post('/threads/:id/status', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.setStatus);
router.post('/threads/:id/assign', authenticate, requireRole('admin', 'manager'), ctrl.assign);
router.post('/threads/:id/reply', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.reply);

router.post('/threads/:id/notes', authenticate, ctrl.addNote);
router.delete('/threads/notes/:noteId', authenticate, ctrl.deleteNote);

module.exports = router;

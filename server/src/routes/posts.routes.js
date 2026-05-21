const { Router } = require('express');
const postsController = require('../controllers/posts.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/stats', authenticate, postsController.stats);
router.get('/', authenticate, postsController.list);
router.post('/', authenticate, requireRole('admin', 'manager', 'editor'), postsController.create);
router.get('/:id', authenticate, postsController.get);
router.put('/:id', authenticate, requireRole('admin', 'manager', 'editor'), postsController.update);
router.delete('/:id', authenticate, requireRole('admin', 'manager'), postsController.remove);
router.post('/:id/submit', authenticate, requireRole('admin', 'manager', 'editor'), postsController.submitForApproval);
router.post('/:id/approve', authenticate, requireRole('admin', 'manager'), postsController.approve);
router.post('/:id/reject', authenticate, requireRole('admin', 'manager'), postsController.reject);
router.post('/:id/schedule', authenticate, requireRole('admin', 'manager'), postsController.schedule);
router.post('/:id/publish-now', authenticate, requireRole('admin', 'manager'), postsController.publishNow);
router.get('/targets/:targetId/tiktok-status', authenticate, postsController.refreshTiktokTargetStatus);

module.exports = router;

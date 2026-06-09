const { Router } = require('express');
const postsController = require('../controllers/posts.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/stats', authenticate, postsController.stats);
router.get('/', authenticate, postsController.list);
router.post('/', authenticate, requireRole('admin', 'manager', 'editor'), postsController.create);
router.post('/bulk', authenticate, requireRole('admin', 'manager', 'editor'), postsController.bulkCreate);
router.post('/ai-caption', authenticate, requireRole('admin', 'manager', 'editor'), postsController.aiCaption);
router.post('/ai-hashtags', authenticate, requireRole('admin', 'manager', 'editor'), postsController.aiHashtags);
router.get('/geo-search', authenticate, postsController.geoSearch);
router.get('/:id', authenticate, postsController.get);
router.put('/:id', authenticate, requireRole('admin', 'manager', 'editor'), postsController.update);
router.delete('/:id', authenticate, requireRole('admin', 'manager'), postsController.remove);
router.post('/:id/submit', authenticate, requireRole('admin', 'manager', 'editor'), postsController.submitForApproval);
router.post('/:id/approve', authenticate, requireRole('admin', 'manager'), postsController.approve);
router.post('/:id/reject', authenticate, requireRole('admin', 'manager'), postsController.reject);
router.post('/:id/schedule', authenticate, requireRole('admin', 'manager'), postsController.schedule);
router.post('/:id/publish-now', authenticate, requireRole('admin', 'manager'), postsController.publishNow);
router.get('/targets/:targetId/tiktok-status', authenticate, postsController.refreshTiktokTargetStatus);
router.post('/targets/:targetId/pin', authenticate, requireRole('admin', 'manager'), postsController.setTargetPinned);

// Client sign-off tokens — let the brand stakeholder approve / reject
// via a public link without logging in. Token creation + listing is
// behind auth; the public resolve + decide endpoints sit on /approve.
router.post('/:id/approval-tokens',  authenticate, requireRole('admin', 'manager', 'editor'), postsController.createApprovalToken);
router.get('/:id/approval-tokens',   authenticate, requireRole('admin', 'manager', 'editor'), postsController.listApprovalTokens);
router.delete('/approval-tokens/:tokenId', authenticate, requireRole('admin', 'manager'), postsController.revokeApprovalToken);

module.exports = router;

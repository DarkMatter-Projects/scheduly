const { Router } = require('express');
const analyticsController = require('../controllers/analytics.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/overview', authenticate, analyticsController.getOverview);
router.get('/posts/:id', authenticate, analyticsController.getPostAnalytics);
router.post('/fetch/:postTargetId', authenticate, requireRole('admin', 'manager'), analyticsController.fetchInsights);
router.post('/posts/:postId/refresh', authenticate, requireRole('admin', 'manager'), analyticsController.refreshPost);
router.post('/refresh', authenticate, requireRole('admin', 'manager'), analyticsController.refreshAll);

module.exports = router;

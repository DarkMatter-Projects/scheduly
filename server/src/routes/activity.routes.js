const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const activityService = require('../services/activity.service');

const router = Router();

// Backwards-compat — flat array, used by the home dashboard widget.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { limit, entityType, entityId } = req.query;
    const activity = await activityService.getRecentActivity({
      limit: parseInt(limit, 10) || 20,
      entityType,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
    });
    res.json(activity);
  } catch (err) { next(err); }
});

// Paginated audit log — used by the audit log page. Manager+ only since
// it exposes everyone's actions across the workspace.
router.get('/log', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { limit, page, entityType, entityId, userId, action, since, until } = req.query;
    const result = await activityService.listActivity({
      limit:      parseInt(limit, 10) || 50,
      page:       parseInt(page, 10)  || 1,
      entityType: entityType || undefined,
      entityId:   entityId ? parseInt(entityId, 10) : undefined,
      userId:     userId ? parseInt(userId, 10) : undefined,
      action:     action || undefined,
      since:      since || undefined,
      until:      until || undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/facets', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const facets = await activityService.getActivityFacets();
    res.json(facets);
  } catch (err) { next(err); }
});

module.exports = router;

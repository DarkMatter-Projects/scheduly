const { Router } = require('express');
const ctrl = require('../controllers/dashboards.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

// Static metric catalogue used by the AddWidgetModal. Must come before
// the /:id route so it doesn't get swallowed.
router.get('/metrics', authenticate, ctrl.listMetrics);
// Per-widget data for the renderer.
router.get('/widgets/:widgetId/data', authenticate, ctrl.getWidgetData);

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.create);
router.get('/:id', authenticate, ctrl.get);
router.put('/:id', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.update);
router.delete('/:id', authenticate, requireRole('admin', 'manager'), ctrl.remove);

// Widgets
router.post('/:id/widgets', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.addWidget);
router.put('/widgets/:widgetId', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.updateWidget);
router.delete('/widgets/:widgetId', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.deleteWidget);
router.put('/:id/widgets/order', authenticate, requireRole('admin', 'manager', 'editor'), ctrl.reorderWidgets);

// Share links
router.post('/:id/share', authenticate, requireRole('admin', 'manager'), ctrl.createShare);
router.delete('/share/:tokenId', authenticate, requireRole('admin', 'manager'), ctrl.revokeShare);

// Public viewer — NO auth. Token in URL is the authn.
router.get('/share/:token', ctrl.viewShared);

module.exports = router;

const { Router } = require('express');
const adsController = require('../controllers/ads.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/accounts', authenticate, adsController.listAccounts);
router.get('/campaigns', authenticate, adsController.listCampaigns);
router.get('/overview', authenticate, adsController.getOverview);

router.post('/sync', authenticate, requireRole('admin', 'manager'), adsController.syncAll);
router.post('/accounts/:id/sync', authenticate, requireRole('admin', 'manager'), adsController.syncOne);
router.post('/accounts/:id/client', authenticate, requireRole('admin', 'manager'), adsController.assignAccountClient);
router.delete('/accounts/:id', authenticate, requireRole('admin'), adsController.disconnectAccount);

module.exports = router;

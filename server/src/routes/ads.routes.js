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

// ── Google Ads ──
router.get('/google/accounts', authenticate, adsController.listGoogleAccounts);
router.get('/google/pending-grants', authenticate, adsController.listGooglePendingGrants);
router.get('/google/overview', authenticate, adsController.getGoogleOverview);

router.post('/google/sync', authenticate, requireRole('admin', 'manager'), adsController.syncAllGoogle);
router.post('/google/accounts/:id/sync', authenticate, requireRole('admin', 'manager'), adsController.syncOneGoogle);
router.post('/google/grants/:grantId/discover', authenticate, requireRole('admin', 'manager'), adsController.discoverGoogleGrant);
router.post('/google/accounts/:id/client', authenticate, requireRole('admin', 'manager'), adsController.assignGoogleAccountClient);
router.delete('/google/accounts/:id', authenticate, requireRole('admin'), adsController.disconnectGoogleAccount);
router.delete('/google/grants/:grantId', authenticate, requireRole('admin'), adsController.disconnectGoogleGrant);

module.exports = router;

const { Router } = require('express');
const socialController = require('../controllers/social.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/accounts', authenticate, socialController.listAccounts);
// Public so <img src> tags can load without auth headers; URLs returned are
// already public on the social platforms.
router.get('/accounts/:id/avatar', socialController.getAccountAvatar);
router.get('/auth/facebook', authenticate, requireRole('admin'), socialController.startOAuth);
router.get('/auth/facebook/callback', socialController.oauthCallback); // No auth — redirected from Facebook
router.get('/auth/instagram', authenticate, requireRole('admin'), socialController.startInstagramOAuth);
router.get('/auth/instagram/callback', socialController.instagramCallback); // No auth — redirected from Instagram
router.delete('/accounts/:id', authenticate, requireRole('admin'), socialController.disconnectAccount);
router.post('/accounts/:id/reconnect', authenticate, requireRole('admin'), socialController.reconnectAccount);

module.exports = router;

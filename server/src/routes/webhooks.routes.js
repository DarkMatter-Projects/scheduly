const { Router } = require('express');
const express = require('express');
const ctrl = require('../controllers/webhooks.controller');

const router = Router();

// Raw body is required to verify Meta's X-Hub-Signature-256. We capture it on
// just this route, then JSON-parse manually in the controller.
router.get('/meta', ctrl.verifyMeta);
router.post('/meta', express.raw({ type: '*/*', limit: '5mb' }), ctrl.receiveMeta);

module.exports = router;

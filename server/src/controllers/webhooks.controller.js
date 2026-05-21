const fb = require('../config/facebook');
const meta = require('../services/meta_webhook.service');
const logger = require('../utils/logger');

// Meta's verification handshake. They GET our endpoint with the verify token
// we configured in the app dashboard; we echo `hub.challenge` back if it matches.
function verifyMeta(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === fb.webhookVerifyToken) {
    logger.info('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  logger.warn('Meta webhook verify failed (token mismatch or missing)');
  return res.sendStatus(403);
}

// Receives every webhook POST from Meta. We ack with 200 immediately and
// process asynchronously — Meta retries on non-2xx, but slow processing can
// trigger duplicate deliveries.
function receiveMeta(req, res) {
  const signature = req.get('x-hub-signature-256');
  const raw = req.rawBody || (req.body && Buffer.isBuffer(req.body) ? req.body : null);
  if (!raw || !meta.verifySignature(raw, signature)) {
    logger.warn('Meta webhook: signature verify failed');
    return res.sendStatus(401);
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return res.sendStatus(400);
  }

  // Ack immediately so Meta doesn't retry while we're still processing.
  res.sendStatus(200);

  meta.processWebhookPayload(payload).catch((err) => {
    logger.error(`Webhook processing failed: ${err.message}`);
  });
}

module.exports = { verifyMeta, receiveMeta };

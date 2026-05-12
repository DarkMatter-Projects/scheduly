const metaAds = require('../services/meta_ads.service');
const googleAds = require('../services/google_ads.service');
const logger = require('../utils/logger');

async function runAdsSyncJob() {
  try {
    const meta = await metaAds.syncAll();
    if (meta.total > 0) {
      logger.info(`Meta ads sync: ${meta.ok} success, ${meta.failed} failed (of ${meta.total})`);
    } else {
      logger.debug('Meta ads sync: no ad accounts connected');
    }
  } catch (err) {
    logger.error('Meta ads sync: fatal error', { error: err.message });
  }

  try {
    const g = await googleAds.syncAll();
    if (g.total > 0) {
      logger.info(`Google ads sync: ${g.ok} success, ${g.failed} failed (of ${g.total})`);
    } else {
      logger.debug('Google ads sync: no ad accounts connected');
    }
  } catch (err) {
    logger.error('Google ads sync: fatal error', { error: err.message });
  }
}

module.exports = { runAdsSyncJob };

const { syncAll } = require('../services/meta_ads.service');
const logger = require('../utils/logger');

async function runAdsSyncJob() {
  try {
    const { ok, failed, total } = await syncAll();
    if (total === 0) {
      logger.debug('Ads sync: no ad accounts connected');
      return;
    }
    logger.info(`Ads sync complete: ${ok} success, ${failed} failed (of ${total})`);
  } catch (err) {
    logger.error('Ads sync job: fatal error', { error: err.message });
  }
}

module.exports = { runAdsSyncJob };

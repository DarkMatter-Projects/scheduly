const pool = require('../config/db');
const { snapshotDemographicsForAccount } = require('../services/channel_demographics.service');
const logger = require('../utils/logger');

// Daily snapshot of audience demographics (country + gender/age) for
// every connected FB Page / IG Business account. One row per
// (account, snapshot_date, dimension, dimension_key) in
// channel_demographics. Idempotent.
async function runChannelDemographicsJob() {
  try {
    const [accounts] = await pool.execute(
      `SELECT id, platform, platform_account_id, access_token
       FROM social_accounts
       WHERE is_active = 1
         AND access_token IS NOT NULL
         AND platform IN ('facebook_page','instagram_business','linkedin','youtube')`
    );

    if (accounts.length === 0) {
      logger.debug('Channel demographics: no active accounts');
      return;
    }
    logger.info(`Channel demographics: ${accounts.length} account(s)`);

    let total = 0, skipped = 0, failed = 0;
    for (const acc of accounts) {
      try {
        const { stored } = await snapshotDemographicsForAccount(acc);
        if (stored > 0) total += stored; else skipped++;
      } catch (err) {
        failed++;
        logger.warn(`Channel demographics failed for account ${acc.id} (${acc.platform}): ${err.message}`);
      }
    }
    logger.info(`Channel demographics complete: ${total} rows stored, ${skipped} accounts skipped, ${failed} failed`);
  } catch (err) {
    logger.error('Channel demographics job: fatal error', { error: err.message });
  }
}

module.exports = { runChannelDemographicsJob };

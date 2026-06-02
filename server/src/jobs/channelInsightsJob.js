const pool = require('../config/db');
const { fetchInsightsForAccount, recordSnapshot } = require('../services/channel_insights.service');
const logger = require('../utils/logger');

// Pulls yesterday's page-level insights for every active FB Page / IG
// Business account and upserts into channel_insights_daily. Powers the
// Engaged users, Profile views, Profile taps and Follow/Non-follow split
// widgets on the dashboards.
async function runChannelInsightsJob() {
  try {
    const [accounts] = await pool.execute(
      `SELECT id, platform, platform_account_id, access_token
       FROM social_accounts
       WHERE is_active = 1
         AND access_token IS NOT NULL
         AND platform IN ('facebook_page','instagram_business','linkedin','youtube')`
    );

    if (accounts.length === 0) {
      logger.debug('Channel insights: no active accounts');
      return;
    }
    logger.info(`Channel insights: ${accounts.length} account(s)`);

    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let stored = 0, skipped = 0, failed = 0;

    for (const acc of accounts) {
      try {
        const values = await fetchInsightsForAccount(acc, day);
        if (!values) { skipped++; continue; }
        const ok = await recordSnapshot(acc.id, day, values);
        if (ok) stored++; else skipped++;
      } catch (err) {
        failed++;
        logger.warn(`Channel insights failed for account ${acc.id} (${acc.platform}): ${err.message}`);
      }
    }
    logger.info(`Channel insights complete: ${stored} stored, ${skipped} skipped, ${failed} failed`);
  } catch (err) {
    logger.error('Channel insights job: fatal error', { error: err.message });
  }
}

module.exports = { runChannelInsightsJob };

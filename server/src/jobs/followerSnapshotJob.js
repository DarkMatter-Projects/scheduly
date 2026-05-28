const pool = require('../config/db');
const { fetchFollowerCount, recordSnapshot } = require('../services/followers.service');
const logger = require('../utils/logger');

// Walks every active social account, pulls today's follower count, and
// upserts a row in follower_history. Skips accounts that return null (no
// scope, missing field, transient error) — we'd rather have a gap than a
// fake 0 in the time series. Idempotent: re-running on the same day
// updates the row in place via the ON DUPLICATE KEY UPDATE in recordSnapshot.
async function runFollowerSnapshotJob() {
  try {
    const [accounts] = await pool.execute(
      `SELECT id, platform, platform_account_id, access_token
       FROM social_accounts
       WHERE is_active = 1
         AND access_token IS NOT NULL
         AND platform IN ('facebook_page','instagram_business','tiktok','youtube')`
    );

    if (accounts.length === 0) {
      logger.debug('Follower snapshot: no active accounts');
      return;
    }

    logger.info(`Follower snapshot: ${accounts.length} account(s)`);
    let stored = 0;
    let skipped = 0;
    let failed = 0;

    for (const acc of accounts) {
      try {
        const count = await fetchFollowerCount(acc);
        if (count === null) {
          skipped++;
          continue;
        }
        await recordSnapshot(acc.id, count);
        stored++;
      } catch (err) {
        failed++;
        logger.warn(`Follower snapshot failed for account ${acc.id} (${acc.platform}): ${err.message}`);
      }
    }

    logger.info(`Follower snapshot complete: ${stored} stored, ${skipped} skipped, ${failed} failed`);
  } catch (err) {
    logger.error('Follower snapshot job: fatal error', { error: err.message });
  }
}

module.exports = { runFollowerSnapshotJob };

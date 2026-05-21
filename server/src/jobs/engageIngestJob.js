const pool = require('../config/db');
const meta = require('../services/meta_engage.service');
const tiktok = require('../services/tiktok_engage.service');
const logger = require('../utils/logger');

async function runEngageIngestJob() {
  try {
    const [accounts] = await pool.execute(
      `SELECT * FROM social_accounts
       WHERE is_active = 1
         AND platform IN ('facebook_page', 'instagram_business', 'tiktok')
         AND access_token IS NOT NULL`
    );

    if (accounts.length === 0) return;

    let totals = { comments: 0, dms: 0, accounts: 0, errors: 0 };
    for (const account of accounts) {
      if (account.platform === 'tiktok') {
        try {
          totals.comments += await tiktok.ingestTikTokComments(account);
        } catch (err) {
          const msg = err.response?.data?.error?.message || err.message;
          logger.error(`Engage ingest tiktok:comments for ${account.account_name} — ${msg}`);
          totals.errors++;
        }
      } else {
        const stats = await meta.ingestAllForAccount(account);
        totals.comments += stats.comments;
        totals.dms += stats.dms;
        totals.errors += stats.errors.length;
      }
      totals.accounts++;
    }
    if (totals.comments + totals.dms > 0 || totals.errors > 0) {
      logger.info(
        `Engage ingest: ${totals.accounts} acct(s), +${totals.comments} comments, +${totals.dms} DMs, ${totals.errors} error(s)`
      );
    }
  } catch (err) {
    logger.error('Engage ingest job: fatal', { error: err.message });
  }
}

module.exports = { runEngageIngestJob };

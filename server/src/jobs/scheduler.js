const cron = require('node-cron');
const { runPublishJob } = require('./publishJob');
const { runTokenRefreshJob } = require('./tokenRefreshJob');
const { runAnalyticsFetchJob } = require('./analyticsFetchJob');
const { runAdsSyncJob } = require('./adsSyncJob');
const { runEngageIngestJob } = require('./engageIngestJob');
const { runFollowerSnapshotJob } = require('./followerSnapshotJob');
const { runChannelInsightsJob } = require('./channelInsightsJob');
const logger = require('../utils/logger');

function startScheduler() {
  // Check for due posts every minute
  cron.schedule('* * * * *', async () => {
    logger.debug('Scheduler: running publish job');
    await runPublishJob();
  });

  // Refresh expiring tokens daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('Scheduler: running token refresh job');
    await runTokenRefreshJob();
  });

  // Snapshot follower counts daily at 5 AM (before analytics fetch so the
  // Followers / Net new followers cells show today's number on the dashboard).
  cron.schedule('0 5 * * *', async () => {
    logger.info('Scheduler: running follower snapshot job');
    await runFollowerSnapshotJob();
  });

  // Pull yesterday's page-level insights (engaged users, profile views,
  // profile taps, follow/non-follow split) at 5:15 AM.
  cron.schedule('15 5 * * *', async () => {
    logger.info('Scheduler: running channel insights job');
    await runChannelInsightsJob();
  });

  // Fetch analytics for published posts daily at 6 AM
  cron.schedule('0 6 * * *', async () => {
    logger.info('Scheduler: running analytics fetch job');
    await runAnalyticsFetchJob();
  });

  // Sync Meta Ads campaigns + insights daily at 7 AM
  cron.schedule('0 7 * * *', async () => {
    logger.info('Scheduler: running Meta ads sync job');
    await runAdsSyncJob();
  });

  // Pull new comments + DMs into the Engage inbox every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Scheduler: running engage ingest job');
    await runEngageIngestJob();
  });

  logger.info('Scheduler started: publish (every min), engage ingest (every 5 min), token refresh (3 AM), follower snapshot (5 AM), channel insights (5:15 AM), analytics (6 AM), ads sync (7 AM)');
}

module.exports = { startScheduler };

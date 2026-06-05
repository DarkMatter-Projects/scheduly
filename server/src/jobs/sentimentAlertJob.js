const pool = require('../config/db');
const notifications = require('../services/notifications.service');
const logger = require('../utils/logger');

// Hourly sweep: for each team's engage messages in the last 6h, fire a
// notification when the negative-sentiment ratio crosses a threshold AND
// a similar alert hasn't already fired in the last 12h (so we don't spam
// the bell during a sustained spike).
//
// Thresholds picked deliberately conservative so the alert lands when
// something's actually wrong:
//   - need >= 5 incoming messages in window (avoid 1-in-1 = 100% noise)
//   - negative ratio >= 40%
const MIN_MESSAGES   = 5;
const NEGATIVE_RATIO = 0.40;
const COOLDOWN_HOURS = 12;

async function runSentimentAlertJob() {
  try {
    const [teamRows] = await pool.execute(
      `SELECT DISTINCT t.team_id, tm.name AS team_name
         FROM engage_threads t
         LEFT JOIN teams tm ON t.team_id = tm.id
        WHERE t.team_id IS NOT NULL`
    );
    if (teamRows.length === 0) return;

    let alerts = 0;
    for (const tr of teamRows) {
      const teamId = tr.team_id;
      try {
        const [rows] = await pool.execute(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END) AS neg
             FROM engage_messages m
             JOIN engage_threads t ON m.thread_id = t.id
            WHERE t.team_id = ?
              AND m.direction = 'incoming'
              AND m.sent_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)`,
          [teamId]
        );
        const total = Number(rows[0]?.total) || 0;
        const neg   = Number(rows[0]?.neg) || 0;
        if (total < MIN_MESSAGES) continue;
        const ratio = neg / total;
        if (ratio < NEGATIVE_RATIO) continue;

        // Cooldown — has the same alert type already gone out recently?
        const [recent] = await pool.execute(
          `SELECT id FROM notifications
            WHERE team_id = ? AND type = 'sentiment_spike'
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            LIMIT 1`,
          [teamId, COOLDOWN_HOURS]
        );
        if (recent.length > 0) continue;

        await notifications.notify({
          type: 'sentiment_spike',
          severity: 'warning',
          teamId,
          title: 'Negative sentiment spike in the inbox',
          body: `${neg} of the last ${total} incoming messages (last 6h) were negative.`,
          link: '/engage',
          payload: { neg, total, ratio: Number(ratio.toFixed(3)), windowHours: 6 },
        });
        alerts++;
      } catch (err) {
        logger.warn(`Sentiment alert failed for team ${teamId}: ${err.message}`);
      }
    }
    if (alerts > 0) logger.info(`Sentiment alert job: fired ${alerts} alert(s)`);
  } catch (err) {
    logger.error('Sentiment alert job: fatal error', { error: err.message });
  }
}

module.exports = { runSentimentAlertJob };

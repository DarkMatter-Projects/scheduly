const axios = require('axios');
const pool = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');

// Post a message to a team's Slack (or Teams) webhook. Best-effort —
// failures log but never re-throw, so notification dispatch never
// blocks on a misconfigured / offline webhook.
//
// Webhook URL is keyed on the team, so any notification with teamId
// set gets dispatched. Single-user notifications (target_user_id only)
// don't post to a team-wide channel.
async function postTeamWebhook({ teamId, title, body, link, severity = 'info' }) {
  if (!teamId) return false;
  try {
    const [rows] = await pool.execute(
      'SELECT slack_webhook_url FROM teams WHERE id = ?',
      [teamId]
    );
    const url = rows[0]?.slack_webhook_url;
    if (!url) return false;

    const ctaUrl = link ? `${env.email?.appUrl || 'https://scheduly.darkm.co'}${link.startsWith('/') ? link : '/' + link}` : null;
    const message = buildSlackMessage({ title, body, ctaUrl, severity });

    await axios.post(url, message, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' },
    });
    return true;
  } catch (err) {
    logger.warn(`Team webhook (${teamId}) failed: ${err.response?.status || err.code || ''} ${err.message}`);
    return false;
  }
}

// Slack Block Kit message — Microsoft Teams also accepts this shape
// (it just ignores the colored block elements and renders the text).
// Color comes from severity so warnings + errors actually stand out in
// the channel.
function buildSlackMessage({ title, body, ctaUrl, severity }) {
  const color = severity === 'error'   ? '#ef4444'
              : severity === 'warning' ? '#f59e0b'
              :                          '#2563eb';
  const attachment = {
    color,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${escape(title)}*${body ? `\n${escape(body)}` : ''}` },
      },
    ],
  };
  if (ctaUrl) {
    attachment.blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open in Scheduly' },
          url: ctaUrl,
          style: severity === 'error' ? 'danger' : 'primary',
        },
      ],
    });
  }
  return {
    text: title, // Plaintext fallback for notifications + Teams
    attachments: [attachment],
  };
}

function escape(s) {
  // Slack mrkdwn — escape just the most disruptive chars. Don't
  // double-escape or the message looks weirdly literal.
  return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
}

module.exports = { postTeamWebhook };

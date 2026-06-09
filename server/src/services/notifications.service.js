const pool = require('../config/db');
const email = require('./email.service');
const webhook = require('./webhook.service');
const logger = require('../utils/logger');

// Insert a notification row. team_id null + target_user_id set =
// notification for one user. team_id set + target_user_id null =
// fan out to every member of the team at read time.
//
// When RESEND_API_KEY is set, also dispatches a best-effort email to
// the resolved recipients. Failures don't block the insert (we already
// captured the alert in-app via the bell dropdown).
async function notify({ type, title, body, link, severity, teamId, targetUserId, payload }) {
  await pool.execute(
    `INSERT INTO notifications
       (type, title, body, link, severity, team_id, target_user_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      type,
      String(title).slice(0, 255),
      body || null,
      link || null,
      severity || 'info',
      teamId || null,
      targetUserId || null,
      payload ? JSON.stringify(payload) : null,
    ]
  );
  // Email side — best-effort. Resolve recipients here so we don't fan
  // out at read time (the user could be offline when an alert fires).
  try {
    const recipients = await resolveRecipientEmails({ teamId, targetUserId });
    if (recipients.length > 0) {
      const subject = title;
      const html = email.layout({
        title,
        preheader: body || '',
        bodyHtml: `<p style="margin:0 0 12px;">${escapeHtml(body || '')}</p>`,
        ctaLabel: ctaLabelFor(type),
        ctaPath: link || null,
      });
      await email.sendEmail({ to: recipients, subject, html });
    }
  } catch (err) {
    logger.warn(`notifications.notify email dispatch failed: ${err.message}`);
  }
  // Slack / Teams webhook — best-effort. Only fires for team-scoped
  // notifications because the webhook URL lives on the team row;
  // single-user notifications go through email + bell only.
  if (teamId) {
    try {
      await webhook.postTeamWebhook({ teamId, title, body, link, severity });
    } catch (err) {
      logger.warn(`notifications.notify webhook dispatch failed: ${err.message}`);
    }
  }
}

async function resolveRecipientEmails({ teamId, targetUserId }) {
  if (targetUserId) {
    const [rows] = await pool.execute(
      `SELECT email FROM users WHERE id = ? AND email IS NOT NULL AND email <> ''`,
      [targetUserId]
    );
    return rows.map(r => r.email);
  }
  if (teamId) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.email
         FROM users u
         JOIN user_teams ut ON ut.user_id = u.id
        WHERE ut.team_id = ?
          AND u.email IS NOT NULL AND u.email <> ''`,
      [teamId]
    );
    return rows.map(r => r.email);
  }
  return [];
}

function ctaLabelFor(type) {
  switch (type) {
    case 'sentiment_spike':       return 'Open the inbox';
    case 'post_pending_approval': return 'Review the post';
    case 'post_approved':         return 'View the post';
    case 'post_rejected':         return 'See the note';
    default:                      return 'Open in Scheduly';
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// List notifications relevant to a user: their own + their team's. Cap
// at 50 newest so the bell dropdown stays snappy.
async function listForUser(userId, { unreadOnly = false } = {}) {
  const where = `(n.target_user_id = ? OR (n.team_id IS NOT NULL AND n.team_id IN (
                    SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = ?
                  )))`;
  const readFilter = unreadOnly ? 'AND n.is_read = 0' : '';
  const [rows] = await pool.execute(
    `SELECT n.* FROM notifications n
     WHERE ${where} ${readFilter}
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [userId, userId]
  );
  return rows.map(formatNotification);
}

async function unreadCountForUser(userId) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) AS v FROM notifications n
     WHERE (n.target_user_id = ? OR (n.team_id IS NOT NULL AND n.team_id IN (
              SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = ?
            )))
       AND n.is_read = 0`,
    [userId, userId]
  );
  return Number(r[0]?.v) || 0;
}

async function markRead(id) {
  await pool.execute(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?`,
    [id]
  );
}

async function markAllRead(userId) {
  await pool.execute(
    `UPDATE notifications n
        SET is_read = 1, read_at = NOW()
      WHERE is_read = 0
        AND (n.target_user_id = ? OR (n.team_id IS NOT NULL AND n.team_id IN (
              SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = ?
            )))`,
    [userId, userId]
  );
}

function formatNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    severity: row.severity,
    isRead: !!row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at,
    payload: row.payload && typeof row.payload === 'string' ? safeParse(row.payload) : row.payload,
  };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = { notify, listForUser, unreadCountForUser, markRead, markAllRead };

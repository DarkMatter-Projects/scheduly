const pool = require('../config/db');

// Insert a notification row. team_id null + target_user_id set =
// notification for one user. team_id set + target_user_id null =
// fan out to every member of the team at read time.
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

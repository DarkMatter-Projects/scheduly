const pool = require('../config/db');
const sentiment = require('./sentiment.service');

// ── Threads (inbox items) ─────────────────────────────────────────────────────

// Filters supported in list:
//   feed:        'all' | 'unread' | 'assigned_to_me' | 'open' | 'closed'
//   platform:    one of facebook_page | instagram_business | tiktok
//   sourceType:  comment | dm | mention
//   clientId:    scope to a single client (via social_accounts.client_id)
async function listThreads({ userId, feed = 'all', platform, sourceType, sentiment, clientId, search, limit = 100 }) {
  let where = '1=1';
  const params = [];

  if (platform)   { where += ' AND t.platform = ?';      params.push(platform); }
  if (sourceType) { where += ' AND t.source_type = ?';   params.push(sourceType); }
  if (sentiment)  { where += ' AND t.sentiment = ?';     params.push(sentiment); }

  if (feed === 'unread')          { where += ' AND t.unread_count > 0'; }
  else if (feed === 'open')       { where += " AND t.status = 'open'"; }
  else if (feed === 'closed')     { where += " AND t.status = 'closed'"; }
  else if (feed === 'snoozed')    { where += " AND t.status = 'snoozed'"; }
  else if (feed === 'assigned_to_me') { where += ' AND t.assigned_to = ?'; params.push(userId); }

  if (clientId) {
    where += ' AND EXISTS (SELECT 1 FROM social_accounts sa WHERE sa.id = t.social_account_id AND sa.client_id = ?)';
    params.push(clientId);
  }

  if (search) {
    where += ' AND (t.participant_name LIKE ? OR t.participant_handle LIKE ? OR t.last_message_preview LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const safeLimit = Math.max(10, Math.min(500, parseInt(limit, 10) || 100));

  const [rows] = await pool.execute(
    `SELECT t.*, sa.account_name AS account_account_name, sa.platform AS account_platform,
            c.id AS client_id_resolved, c.name AS client_name, c.color AS client_color,
            u.first_name, u.last_name
     FROM engage_threads t
     JOIN social_accounts sa ON t.social_account_id = sa.id
     LEFT JOIN clients c ON sa.client_id = c.id
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE ${where}
     ORDER BY t.last_message_at DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows.map(formatThread);
}

async function getThreadCounts({ userId, clientId }) {
  // One conditional-sum query gives us all six bucket totals in a single
  // round trip — much cheaper than six separate COUNT queries.
  const params = [userId];
  let clientFilter = '';
  if (clientId) {
    clientFilter = ' AND EXISTS (SELECT 1 FROM social_accounts sa WHERE sa.id = t.social_account_id AND sa.client_id = ?)';
    params.push(clientId);
  }
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN t.unread_count > 0 THEN 1 ELSE 0 END) AS unread,
       SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open_cnt,
       SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) AS closed_cnt,
       SUM(CASE WHEN t.status = 'snoozed' THEN 1 ELSE 0 END) AS snoozed_cnt,
       SUM(CASE WHEN t.assigned_to = ? THEN 1 ELSE 0 END) AS mine
     FROM engage_threads t
     WHERE 1=1 ${clientFilter}`,
    params
  );

  const r = rows[0] || {};
  return {
    all: Number(r.total) || 0,
    unread: Number(r.unread) || 0,
    open: Number(r.open_cnt) || 0,
    closed: Number(r.closed_cnt) || 0,
    snoozed: Number(r.snoozed_cnt) || 0,
    assignedToMe: Number(r.mine) || 0,
  };
}

async function getThread(id) {
  const [rows] = await pool.execute(
    `SELECT t.*, sa.account_name AS account_account_name, sa.platform AS account_platform,
            c.name AS client_name, c.color AS client_color,
            u.first_name, u.last_name, u.id AS assigned_to_id
     FROM engage_threads t
     JOIN social_accounts sa ON t.social_account_id = sa.id
     LEFT JOIN clients c ON sa.client_id = c.id
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.id = ?`,
    [id]
  );
  if (rows.length === 0) throw Object.assign(new Error('Thread not found'), { status: 404 });
  const thread = formatThread(rows[0]);

  const [messages] = await pool.execute(
    `SELECT m.*, u.first_name, u.last_name
     FROM engage_messages m
     LEFT JOIN users u ON m.sent_by_user_id = u.id
     WHERE m.thread_id = ?
     ORDER BY m.sent_at ASC, m.id ASC`,
    [id]
  );
  thread.messages = messages.map(formatMessage);

  const [notes] = await pool.execute(
    `SELECT n.*, u.first_name, u.last_name
     FROM engage_notes n
     JOIN users u ON n.user_id = u.id
     WHERE n.thread_id = ?
     ORDER BY n.created_at DESC`,
    [id]
  );
  thread.notes = notes.map(formatNote);

  return thread;
}

async function markRead(threadId) {
  await pool.execute('UPDATE engage_threads SET unread_count = 0 WHERE id = ?', [threadId]);
  await pool.execute(
    `UPDATE engage_messages SET is_read = 1 WHERE thread_id = ? AND is_read = 0`,
    [threadId]
  );
}

async function setStatus(threadId, status) {
  if (!['open', 'closed', 'snoozed'].includes(status)) {
    throw Object.assign(new Error('Invalid status'), { status: 400 });
  }
  await pool.execute('UPDATE engage_threads SET status = ? WHERE id = ?', [status, threadId]);
}

async function assignThread(threadId, assigneeUserId) {
  await pool.execute(
    'UPDATE engage_threads SET assigned_to = ? WHERE id = ?',
    [assigneeUserId || null, threadId]
  );
}

// Apply one action across a list of threads in a single SQL pass per action.
// Returns the number of rows affected.
async function bulkUpdate({ threadIds, action, userId }) {
  if (!Array.isArray(threadIds) || threadIds.length === 0) return 0;
  const ids = threadIds.map(Number).filter(n => Number.isFinite(n));
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');

  switch (action) {
    case 'close': {
      const [r] = await pool.execute(
        `UPDATE engage_threads SET status = 'closed' WHERE id IN (${placeholders})`, ids);
      return r.affectedRows;
    }
    case 'open': {
      const [r] = await pool.execute(
        `UPDATE engage_threads SET status = 'open' WHERE id IN (${placeholders})`, ids);
      return r.affectedRows;
    }
    case 'snooze': {
      const [r] = await pool.execute(
        `UPDATE engage_threads SET status = 'snoozed' WHERE id IN (${placeholders})`, ids);
      return r.affectedRows;
    }
    case 'mark_read': {
      await pool.execute(
        `UPDATE engage_messages SET is_read = 1 WHERE thread_id IN (${placeholders}) AND is_read = 0`, ids);
      const [r] = await pool.execute(
        `UPDATE engage_threads SET unread_count = 0 WHERE id IN (${placeholders})`, ids);
      return r.affectedRows;
    }
    case 'assign_self': {
      const [r] = await pool.execute(
        `UPDATE engage_threads SET assigned_to = ? WHERE id IN (${placeholders})`, [userId, ...ids]);
      return r.affectedRows;
    }
    case 'unassign': {
      const [r] = await pool.execute(
        `UPDATE engage_threads SET assigned_to = NULL WHERE id IN (${placeholders})`, ids);
      return r.affectedRows;
    }
    default:
      throw Object.assign(new Error(`Unknown bulk action: ${action}`), { status: 400 });
  }
}

// ── Messages: incoming (used by ingestion) + outgoing (replies) ──────────────

// Upsert an incoming item. Used by the platform-specific ingestion services.
async function upsertIncomingMessage({
  threadId, platformMessageId, authorId, authorHandle, authorName, authorAvatarUrl,
  body, sentAt,
}) {
  const s = sentiment.analyze(body || '');
  const [result] = await pool.execute(
    `INSERT INTO engage_messages
       (thread_id, platform_message_id, direction, author_id, author_handle, author_name,
        author_avatar_url, body, sentiment, sent_at)
     VALUES (?, ?, 'incoming', ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       body = VALUES(body),
       sentiment = VALUES(sentiment),
       author_name = VALUES(author_name),
       author_avatar_url = VALUES(author_avatar_url)`,
    [
      threadId, platformMessageId, authorId, authorHandle, authorName, authorAvatarUrl,
      body || '', s.label, sentAt,
    ]
  );

  // Update the thread's last_message_* + bump unread if this was a new message.
  const isInsert = result.affectedRows === 1; // 1 = insert, 2 = update on ON DUPLICATE KEY UPDATE
  await pool.execute(
    `UPDATE engage_threads
       SET last_message_at = ?, last_message_preview = ?, sentiment = ?
          ${isInsert ? ', unread_count = unread_count + 1' : ''}
     WHERE id = ?`,
    [sentAt, (body || '').slice(0, 500), s.label, threadId]
  );

  return { messageId: result.insertId, isNew: isInsert, sentiment: s.label };
}

async function recordOutgoingMessage({ threadId, platformMessageId, body, sentAt, sentByUserId, errorMessage }) {
  await pool.execute(
    `INSERT INTO engage_messages
       (thread_id, platform_message_id, direction, body, sent_at, sent_by_user_id, error_message, is_read)
     VALUES (?, ?, 'outgoing', ?, ?, ?, ?, 1)`,
    [threadId, platformMessageId || null, body, sentAt || new Date(), sentByUserId, errorMessage || null]
  );
  if (!errorMessage) {
    await pool.execute(
      `UPDATE engage_threads
         SET last_message_at = ?, last_message_preview = ?
       WHERE id = ?`,
      [sentAt || new Date(), body.slice(0, 500), threadId]
    );
  }
}

// Convenience used by ingestion: find or create a thread keyed on the
// platform's natural ids and return its id.
async function upsertThread({
  platform, sourceType, socialAccountId, postTargetId, platformPostId,
  participantId, participantHandle, participantName, participantAvatarUrl,
}) {
  const [existing] = await pool.execute(
    `SELECT id FROM engage_threads
     WHERE platform = ? AND source_type = ? AND social_account_id = ?
       AND participant_id = ?
       AND (platform_post_id <=> ?)`,
    [platform, sourceType, socialAccountId, participantId, platformPostId || null]
  );
  if (existing.length > 0) {
    await pool.execute(
      `UPDATE engage_threads
         SET participant_handle = COALESCE(?, participant_handle),
             participant_name   = COALESCE(?, participant_name),
             participant_avatar_url = COALESCE(?, participant_avatar_url)
       WHERE id = ?`,
      [participantHandle || null, participantName || null, participantAvatarUrl || null, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO engage_threads
       (platform, source_type, social_account_id, post_target_id, platform_post_id,
        participant_id, participant_handle, participant_name, participant_avatar_url,
        last_message_at, unread_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 'open')`,
    [
      platform, sourceType, socialAccountId, postTargetId || null, platformPostId || null,
      participantId, participantHandle || null, participantName || null, participantAvatarUrl || null,
    ]
  );
  return result.insertId;
}

// ── Notes ────────────────────────────────────────────────────────────────────

async function addNote(threadId, userId, body) {
  const [result] = await pool.execute(
    `INSERT INTO engage_notes (thread_id, user_id, body) VALUES (?, ?, ?)`,
    [threadId, userId, body]
  );
  const [rows] = await pool.execute(
    `SELECT n.*, u.first_name, u.last_name
     FROM engage_notes n JOIN users u ON n.user_id = u.id WHERE n.id = ?`,
    [result.insertId]
  );
  return formatNote(rows[0]);
}

async function deleteNote(noteId, userId, userRole) {
  const [existing] = await pool.execute('SELECT user_id FROM engage_notes WHERE id = ?', [noteId]);
  if (existing.length === 0) throw Object.assign(new Error('Note not found'), { status: 404 });
  if (existing[0].user_id !== userId && userRole !== 'admin' && userRole !== 'manager') {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }
  await pool.execute('DELETE FROM engage_notes WHERE id = ?', [noteId]);
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatThread(r) {
  return {
    id: r.id,
    platform: r.platform,
    sourceType: r.source_type,
    socialAccountId: r.social_account_id,
    accountName: r.account_account_name,
    postTargetId: r.post_target_id,
    platformPostId: r.platform_post_id,
    participantId: r.participant_id,
    participantHandle: r.participant_handle,
    participantName: r.participant_name,
    participantAvatarUrl: r.participant_avatar_url,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    unreadCount: r.unread_count,
    status: r.status,
    sentiment: r.sentiment,
    assignedTo: r.assigned_to,
    assigneeName: r.first_name ? `${r.first_name} ${r.last_name}` : undefined,
    clientId: r.client_id,
    clientName: r.client_name,
    clientColor: r.client_color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function formatMessage(r) {
  return {
    id: r.id,
    threadId: r.thread_id,
    platformMessageId: r.platform_message_id,
    direction: r.direction,
    authorId: r.author_id,
    authorHandle: r.author_handle,
    authorName: r.author_name,
    authorAvatarUrl: r.author_avatar_url,
    body: r.body,
    sentiment: r.sentiment,
    sentAt: r.sent_at,
    sentByUserId: r.sent_by_user_id,
    sentByName: r.first_name ? `${r.first_name} ${r.last_name}` : undefined,
    isRead: !!r.is_read,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

function formatNote(r) {
  return {
    id: r.id,
    threadId: r.thread_id,
    userId: r.user_id,
    userName: `${r.first_name} ${r.last_name}`,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

module.exports = {
  listThreads,
  getThreadCounts,
  getThread,
  markRead,
  setStatus,
  assignThread,
  bulkUpdate,
  upsertIncomingMessage,
  recordOutgoingMessage,
  upsertThread,
  addNote,
  deleteNote,
};

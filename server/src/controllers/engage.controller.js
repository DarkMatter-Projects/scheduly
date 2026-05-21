const pool = require('../config/db');
const engage = require('../services/engage.service');
const metaEngage = require('../services/meta_engage.service');
const tiktokEngage = require('../services/tiktok_engage.service');
const { runEngageIngestJob } = require('../jobs/engageIngestJob');
const logger = require('../utils/logger');

// Cooldown so a mashing user doesn't hammer Meta/TikTok with parallel ingests.
// Shared across all callers in this server process.
let lastRefreshAt = 0;
let refreshInFlight = null;

async function listThreads(req, res, next) {
  try {
    const { feed, platform, sourceType, sentiment, clientId, search, limit } = req.query;
    const threads = await engage.listThreads({
      userId: req.user.userId,
      feed: feed || 'all',
      platform: platform || undefined,
      sourceType: sourceType || undefined,
      sentiment: sentiment || undefined,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      search: search || undefined,
      limit,
    });
    res.json(threads);
  } catch (err) { next(err); }
}

async function counts(req, res, next) {
  try {
    const { clientId } = req.query;
    const data = await engage.getThreadCounts({
      userId: req.user.userId,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function getThread(req, res, next) {
  try {
    const t = await engage.getThread(parseInt(req.params.id, 10));
    res.json(t);
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    await engage.markRead(parseInt(req.params.id, 10));
    res.json({ message: 'Marked read' });
  } catch (err) { next(err); }
}

async function setStatus(req, res, next) {
  try {
    await engage.setStatus(parseInt(req.params.id, 10), req.body?.status);
    res.json({ message: 'Status updated' });
  } catch (err) { next(err); }
}

async function assign(req, res, next) {
  try {
    const { userId } = req.body;
    await engage.assignThread(
      parseInt(req.params.id, 10),
      userId ? parseInt(userId, 10) : null
    );
    res.json({ message: 'Assigned' });
  } catch (err) { next(err); }
}

async function addNote(req, res, next) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Note body required' });
    const note = await engage.addNote(parseInt(req.params.id, 10), req.user.userId, body.trim());
    res.status(201).json(note);
  } catch (err) { next(err); }
}

async function deleteNote(req, res, next) {
  try {
    await engage.deleteNote(
      parseInt(req.params.noteId, 10),
      req.user.userId,
      req.user.role
    );
    res.json({ message: 'Note deleted' });
  } catch (err) { next(err); }
}

async function reply(req, res, next) {
  try {
    const threadId = parseInt(req.params.id, 10);
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Reply body required' });
    const text = body.trim();

    const [rows] = await pool.execute('SELECT * FROM engage_threads WHERE id = ?', [threadId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
    const thread = rows[0];

    let platformMessageId = null;
    let errorMessage = null;

    try {
      if (thread.platform === 'facebook_page' || thread.platform === 'instagram_business') {
        const result = await metaEngage.sendReply({ thread, body: text });
        platformMessageId = result.platformMessageId;
      } else if (thread.platform === 'tiktok' && thread.source_type === 'comment') {
        platformMessageId = await tiktokEngage.replyToTikTokComment({ thread, body: text });
      } else {
        errorMessage = `Reply delivery not yet implemented for ${thread.platform}/${thread.source_type}`;
      }
    } catch (err) {
      errorMessage = err.response?.data?.error?.message || err.message;
      logger.error(`Engage reply failed (thread ${threadId}): ${errorMessage}`);
    }

    await engage.recordOutgoingMessage({
      threadId,
      platformMessageId,
      body: text,
      sentByUserId: req.user.userId,
      errorMessage,
    });

    if (errorMessage) return res.status(502).json({ error: errorMessage });
    res.status(201).json({ message: 'Reply sent', platformMessageId });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const COOLDOWN_MS = 30 * 1000;
    const since = Date.now() - lastRefreshAt;
    if (since < COOLDOWN_MS) {
      return res.status(429).json({
        error: 'Refreshed recently — wait a moment before trying again.',
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - since) / 1000),
      });
    }
    // If a refresh is already running, return its promise so concurrent
    // callers get the same result instead of starting parallel ingests.
    if (!refreshInFlight) {
      lastRefreshAt = Date.now();
      refreshInFlight = runEngageIngestJob().finally(() => { refreshInFlight = null; });
    }
    await refreshInFlight;
    res.json({ message: 'Inbox refreshed' });
  } catch (err) { next(err); }
}

module.exports = {
  listThreads, counts, getThread, markRead, setStatus, assign,
  addNote, deleteNote, reply, refresh,
};

const pool = require('../config/db');
const engage = require('../services/engage.service');
const metaEngage = require('../services/meta_engage.service');
const logger = require('../utils/logger');

async function listThreads(req, res, next) {
  try {
    const { feed, platform, sourceType, clientId, search, limit } = req.query;
    const threads = await engage.listThreads({
      userId: req.user.userId,
      feed: feed || 'all',
      platform: platform || undefined,
      sourceType: sourceType || undefined,
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
      } else {
        errorMessage = `Reply delivery not yet implemented for ${thread.platform}`;
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

module.exports = {
  listThreads, counts, getThread, markRead, setStatus, assign,
  addNote, deleteNote, reply,
};

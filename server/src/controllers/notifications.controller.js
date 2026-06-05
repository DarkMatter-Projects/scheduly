const service = require('../services/notifications.service');

async function list(req, res, next) {
  try {
    const rows = await service.listForUser(req.user.userId, { unreadOnly: req.query.unreadOnly === '1' });
    res.json(rows);
  } catch (err) { next(err); }
}

async function unreadCount(req, res, next) {
  try {
    const v = await service.unreadCountForUser(req.user.userId);
    res.json({ count: v });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    await service.markRead(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    await service.markAllRead(req.user.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { list, unreadCount, markRead, markAllRead };

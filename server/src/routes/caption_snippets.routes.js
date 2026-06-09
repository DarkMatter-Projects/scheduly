const { Router } = require('express');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const svc = require('../services/caption_snippets.service');

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const rows = await svc.listForUser(req.user.userId, { search: req.query.q });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', authenticate, requireRole('admin', 'manager', 'editor'), async (req, res, next) => {
  try {
    const { title, body, teamId } = req.body || {};
    const row = await svc.create({
      title, body, teamId,
      createdBy: req.user.userId,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', authenticate, requireRole('admin', 'manager', 'editor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Owner / admin can edit. Manager can edit team-shared snippets.
    // Keep it simple: only the creator + admin can edit for now.
    const existing = await svc.getById(id);
    if (!existing) return res.status(404).json({ error: 'Snippet not found' });
    if (existing.createdBy !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const row = await svc.update(id, req.body || {});
    res.json(row);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', authenticate, requireRole('admin', 'manager', 'editor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await svc.getById(id);
    if (!existing) return res.status(404).json({ error: 'Snippet not found' });
    if (existing.createdBy !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    await svc.remove(id);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;

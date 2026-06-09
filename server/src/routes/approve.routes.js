const { Router } = require('express');
const tokens = require('../services/post_approval_tokens.service');

// Public, no-auth tokenized approval surface. Recipients land here from
// a link the agency sent them. They see a read-only preview of the
// post + targets + media, then submit { decision, reviewerName, note }.
const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const resolved = await tokens.resolveToken(req.params.token);
    if (!resolved) return res.status(404).json({ error: 'Link not found' });
    if (resolved.expired) return res.status(410).json({ error: 'Link has expired' });
    res.json(resolved);
  } catch (err) { next(err); }
});

router.post('/:token/decide', async (req, res, next) => {
  try {
    const { decision, reviewerName, reviewerEmail, note } = req.body || {};
    const out = await tokens.recordDecision({
      token: req.params.token,
      decision, reviewerName, reviewerEmail, note,
    });
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

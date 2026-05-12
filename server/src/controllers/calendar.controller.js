const pool = require('../config/db');

async function getEvents(req, res, next) {
  try {
    const { start, end, clientId } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required' });
    }

    const params = [start, end, start, end, start, end];
    let clientFilter = '';
    if (clientId) {
      clientFilter = ` AND EXISTS (
        SELECT 1 FROM post_targets pt
        JOIN social_accounts sa ON pt.social_account_id = sa.id
        WHERE pt.post_id = p.id AND sa.client_id = ?
      )`;
      params.push(parseInt(clientId, 10));
    }

    const [rows] = await pool.execute(
      `SELECT p.id, p.title, p.content, p.post_type, p.status, p.scheduled_at, p.published_at, p.created_at,
              u.first_name, u.last_name,
              (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
              (SELECT m.thumbnail_path FROM media m JOIN post_media pm ON m.id = pm.media_id WHERE pm.post_id = p.id ORDER BY pm.sort_order LIMIT 1) AS thumbnail
       FROM posts p
       JOIN users u ON p.created_by = u.id
       WHERE (
         (p.scheduled_at BETWEEN ? AND ?)
         OR (p.published_at BETWEEN ? AND ?)
         OR (p.scheduled_at IS NULL AND p.created_at BETWEEN ? AND ?)
       )${clientFilter}
       ORDER BY COALESCE(p.scheduled_at, p.published_at, p.created_at)`,
      params
    );

    const events = rows.map(r => ({
      id: r.id,
      title: r.title || r.content.substring(0, 50),
      start: r.scheduled_at || r.published_at || r.created_at,
      extendedProps: {
        postId: r.id,
        status: r.status,
        postType: r.post_type,
        content: r.content,
        creatorName: `${r.first_name} ${r.last_name}`,
        mediaCount: r.media_count,
        thumbnail: r.thumbnail ? `/uploads/${r.thumbnail}` : null,
      },
    }));

    res.json(events);
  } catch (err) {
    next(err);
  }
}

module.exports = { getEvents };

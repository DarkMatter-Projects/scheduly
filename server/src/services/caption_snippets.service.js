const pool = require('../config/db');

// List snippets accessible to a user: anything they created (regardless
// of team) PLUS anything shared to a team they belong to.
async function listForUser(userId, { search } = {}) {
  const params = [userId, userId];
  let extra = '';
  if (search && search.trim()) {
    extra = `AND (s.title LIKE ? OR s.body LIKE ?)`;
    const like = `%${search.trim()}%`;
    params.push(like, like);
  }
  const [rows] = await pool.execute(
    `SELECT s.*, u.first_name, u.last_name
       FROM caption_snippets s
       LEFT JOIN users u ON s.created_by = u.id
      WHERE (s.created_by = ?
             OR (s.team_id IS NOT NULL AND s.team_id IN (
                   SELECT ut.team_id FROM team_members ut WHERE ut.user_id = ?
                 )))
        ${extra}
      ORDER BY s.updated_at DESC
      LIMIT 100`,
    params
  );
  return rows.map(format);
}

async function getById(id) {
  const [rows] = await pool.execute(
    `SELECT s.*, u.first_name, u.last_name
       FROM caption_snippets s
       LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?`,
    [id]
  );
  return rows.length > 0 ? format(rows[0]) : null;
}

async function create({ title, body, teamId, createdBy }) {
  if (!title || !title.trim()) throw Object.assign(new Error('title is required'), { status: 400 });
  if (!body || !body.trim())   throw Object.assign(new Error('body is required'),  { status: 400 });
  const [result] = await pool.execute(
    `INSERT INTO caption_snippets (title, body, team_id, created_by) VALUES (?, ?, ?, ?)`,
    [String(title).slice(0, 150), body, teamId || null, createdBy]
  );
  return getById(result.insertId);
}

async function update(id, { title, body, teamId }) {
  const fields = [];
  const values = [];
  if (title  !== undefined) { fields.push('title = ?');   values.push(String(title).slice(0, 150)); }
  if (body   !== undefined) { fields.push('body = ?');    values.push(body); }
  if (teamId !== undefined) { fields.push('team_id = ?'); values.push(teamId || null); }
  if (fields.length === 0) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE caption_snippets SET ${fields.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function remove(id) {
  await pool.execute(`DELETE FROM caption_snippets WHERE id = ?`, [id]);
}

function format(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    teamId: row.team_id,
    createdBy: row.created_by,
    creatorName: row.first_name ? `${row.first_name} ${row.last_name}` : 'System',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { listForUser, getById, create, update, remove };

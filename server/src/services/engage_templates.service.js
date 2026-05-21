const pool = require('../config/db');

async function listTemplates({ teamId }) {
  const [rows] = await pool.execute(
    `SELECT t.*, u.first_name, u.last_name
     FROM engage_reply_templates t
     JOIN users u ON t.user_id = u.id
     WHERE (t.team_id <=> ?)
     ORDER BY t.name ASC`,
    [teamId || null]
  );
  return rows.map(formatTemplate);
}

async function createTemplate({ teamId, userId, name, body }) {
  if (!name || !name.trim()) throw Object.assign(new Error('Name required'), { status: 400 });
  if (!body || !body.trim()) throw Object.assign(new Error('Body required'), { status: 400 });
  const [result] = await pool.execute(
    `INSERT INTO engage_reply_templates (team_id, user_id, name, body)
     VALUES (?, ?, ?, ?)`,
    [teamId || null, userId, name.trim().slice(0, 120), body.trim()]
  );
  return getTemplate(result.insertId);
}

async function updateTemplate(id, userId, userRole, { name, body }) {
  const [existing] = await pool.execute('SELECT user_id FROM engage_reply_templates WHERE id = ?', [id]);
  if (existing.length === 0) throw Object.assign(new Error('Template not found'), { status: 404 });
  if (existing[0].user_id !== userId && userRole !== 'admin' && userRole !== 'manager') {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }
  const updates = [];
  const params = [];
  if (typeof name === 'string') { updates.push('name = ?'); params.push(name.trim().slice(0, 120)); }
  if (typeof body === 'string') { updates.push('body = ?'); params.push(body.trim()); }
  if (updates.length === 0) return getTemplate(id);
  params.push(id);
  await pool.execute(`UPDATE engage_reply_templates SET ${updates.join(', ')} WHERE id = ?`, params);
  return getTemplate(id);
}

async function deleteTemplate(id, userId, userRole) {
  const [existing] = await pool.execute('SELECT user_id FROM engage_reply_templates WHERE id = ?', [id]);
  if (existing.length === 0) throw Object.assign(new Error('Template not found'), { status: 404 });
  if (existing[0].user_id !== userId && userRole !== 'admin' && userRole !== 'manager') {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }
  await pool.execute('DELETE FROM engage_reply_templates WHERE id = ?', [id]);
}

async function getTemplate(id) {
  const [rows] = await pool.execute(
    `SELECT t.*, u.first_name, u.last_name
     FROM engage_reply_templates t JOIN users u ON t.user_id = u.id WHERE t.id = ?`,
    [id]
  );
  return rows[0] ? formatTemplate(rows[0]) : null;
}

function formatTemplate(r) {
  return {
    id: r.id,
    teamId: r.team_id,
    userId: r.user_id,
    userName: `${r.first_name} ${r.last_name}`,
    name: r.name,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate };

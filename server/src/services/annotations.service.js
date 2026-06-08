const pool = require('../config/db');

// Annotations associated with a dashboard at render time: anything
// scoped to that specific dashboard PLUS anything scoped to the
// dashboard's client (so a client-level marker like "Black Friday push"
// shows up on every dashboard owned by that client).
async function listForDashboard(dashboardId) {
  const [rows] = await pool.execute(
    `SELECT a.* FROM dashboard_annotations a
     LEFT JOIN dashboards d ON a.client_id = d.client_id
     WHERE a.dashboard_id = ?
        OR (a.dashboard_id IS NULL AND d.id = ?)
     ORDER BY a.occurred_at ASC`,
    [dashboardId, dashboardId]
  );
  return rows.map(format);
}

async function listForClient(clientId) {
  const [rows] = await pool.execute(
    `SELECT * FROM dashboard_annotations
     WHERE client_id = ? AND dashboard_id IS NULL
     ORDER BY occurred_at ASC`,
    [clientId]
  );
  return rows.map(format);
}

async function create({ dashboardId, clientId, teamId, occurredAt, label, description, color, createdBy }) {
  if (!label) throw Object.assign(new Error('Label is required'), { status: 400 });
  if (!occurredAt) throw Object.assign(new Error('occurredAt is required'), { status: 400 });
  if (!dashboardId && !clientId) {
    throw Object.assign(new Error('Either dashboardId or clientId is required'), { status: 400 });
  }
  const [result] = await pool.execute(
    `INSERT INTO dashboard_annotations
       (dashboard_id, client_id, team_id, occurred_at, label, description, color, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dashboardId || null,
      clientId || null,
      teamId || null,
      toMysqlDatetime(occurredAt),
      String(label).slice(0, 120),
      description || null,
      (color && /^#[0-9a-f]{3,8}$/i.test(color)) ? color : '#6366f1',
      createdBy,
    ]
  );
  return getById(result.insertId);
}

async function update(id, { label, description, color, occurredAt }) {
  const fields = [];
  const values = [];
  if (label !== undefined)       { fields.push('label = ?');       values.push(String(label).slice(0, 120)); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
  if (color !== undefined && /^#[0-9a-f]{3,8}$/i.test(color)) {
    fields.push('color = ?');
    values.push(color);
  }
  if (occurredAt !== undefined)  { fields.push('occurred_at = ?'); values.push(toMysqlDatetime(occurredAt)); }
  if (fields.length === 0) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE dashboard_annotations SET ${fields.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM dashboard_annotations WHERE id = ?', [id]);
}

async function getById(id) {
  const [rows] = await pool.execute('SELECT * FROM dashboard_annotations WHERE id = ?', [id]);
  return rows.length > 0 ? format(rows[0]) : null;
}

function format(row) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    clientId: row.client_id,
    teamId: row.team_id,
    occurredAt: row.occurred_at,
    label: row.label,
    description: row.description,
    color: row.color,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMysqlDatetime(v) {
  const d = new Date(v);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { listForDashboard, listForClient, create, update, remove, getById };

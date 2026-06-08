const crypto = require('crypto');
const pool = require('../config/db');

// ── Dashboards ────────────────────────────────────────────────────────────────

async function listDashboards({ userId, clientId }) {
  const params = [];
  let where = '1=1';
  if (clientId) { where += ' AND d.client_id = ?'; params.push(clientId); }

  const [rows] = await pool.execute(
    `SELECT d.*, u.first_name, u.last_name,
            c.name AS client_name, c.color AS client_color,
            (SELECT COUNT(*) FROM dashboard_widgets w WHERE w.dashboard_id = d.id) AS widget_count,
            (SELECT COUNT(*) FROM dashboard_share_tokens t
              WHERE t.dashboard_id = d.id AND t.revoked_at IS NULL
                AND (t.expires_at IS NULL OR t.expires_at > NOW())) AS active_share_count
     FROM dashboards d
     JOIN users u ON d.created_by = u.id
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE ${where}
     ORDER BY d.updated_at DESC`,
    params
  );
  return rows.map(formatDashboard);
}

async function getDashboard(id) {
  const [rows] = await pool.execute(
    `SELECT d.*, u.first_name, u.last_name,
            c.name AS client_name, c.color AS client_color
     FROM dashboards d
     JOIN users u ON d.created_by = u.id
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE d.id = ?`,
    [id]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Dashboard not found'), { status: 404 });
  }
  const d = formatDashboard(rows[0]);

  const [widgets] = await pool.execute(
    `SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position ASC, id ASC`,
    [id]
  );
  d.widgets = widgets.map(formatWidget);

  const [shares] = await pool.execute(
    `SELECT id, token, access, expires_at, revoked_at, last_viewed_at, view_count, created_at
     FROM dashboard_share_tokens
     WHERE dashboard_id = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [id]
  );
  d.shareLinks = shares.map(s => ({
    id: s.id,
    token: s.token,
    access: s.access,
    expiresAt: s.expires_at,
    revokedAt: s.revoked_at,
    lastViewedAt: s.last_viewed_at,
    viewCount: s.view_count,
    createdAt: s.created_at,
  }));

  return d;
}

async function createDashboard({ name, templateKey, description, clientId, teamId, createdBy, defaultRange, rangeStart, rangeEnd, widgets, channelIds }) {
  const [result] = await pool.execute(
    `INSERT INTO dashboards
       (name, template_key, description, client_id, channel_ids, team_id, created_by,
        default_range, range_start, range_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      templateKey || 'custom',
      description || null,
      clientId || null,
      jsonOrNull(channelIds),
      teamId || null,
      createdBy,
      defaultRange || '30d',
      rangeStart || null,
      rangeEnd || null,
    ]
  );
  const id = result.insertId;

  // Templates may pre-seed widgets — accept an array on create.
  if (Array.isArray(widgets) && widgets.length > 0) {
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      await pool.execute(
        `INSERT INTO dashboard_widgets
           (dashboard_id, category, widget_type, title,
            channel_ids, metric_keys, config, position, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          w.category || 'channel',
          w.widgetType || w.widget_type,
          w.title || null,
          jsonOrNull(w.channelIds || w.channel_ids),
          jsonOrNull(w.metricKeys || w.metric_keys),
          jsonOrNull(w.config),
          i,
          w.width || 4,
          w.height || 2,
        ]
      );
    }
  }

  return getDashboard(id);
}

async function updateDashboard(id, fields) {
  const allowed = ['name', 'description', 'client_id', 'channel_ids', 'default_range', 'range_start', 'range_end', 'comparison_mode'];
  const sets = [];
  const values = [];
  for (const k of allowed) {
    const camel = snakeToCamel(k);
    if (fields[camel] !== undefined) {
      sets.push(`${k} = ?`);
      values.push(fields[camel] ?? null);
    }
  }
  if (sets.length === 0) return getDashboard(id);
  values.push(id);
  await pool.execute(`UPDATE dashboards SET ${sets.join(', ')} WHERE id = ?`, values);
  return getDashboard(id);
}

async function deleteDashboard(id) {
  await pool.execute('DELETE FROM dashboards WHERE id = ?', [id]);
}

// ── Widgets ───────────────────────────────────────────────────────────────────

async function addWidget(dashboardId, widget) {
  // Append at the end by default.
  const [posRow] = await pool.execute(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM dashboard_widgets WHERE dashboard_id = ?',
    [dashboardId]
  );
  const position = widget.position ?? posRow[0].next_pos;

  const [result] = await pool.execute(
    `INSERT INTO dashboard_widgets
       (dashboard_id, category, widget_type, title,
        channel_ids, metric_keys, config, position, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dashboardId,
      widget.category || 'channel',
      widget.widgetType,
      widget.title || null,
      jsonOrNull(widget.channelIds),
      jsonOrNull(widget.metricKeys),
      jsonOrNull(widget.config),
      position,
      widget.width || 4,
      widget.height || 2,
    ]
  );
  const [rows] = await pool.execute('SELECT * FROM dashboard_widgets WHERE id = ?', [result.insertId]);
  return formatWidget(rows[0]);
}

async function updateWidget(id, fields) {
  const sets = [];
  const values = [];
  if (fields.title !== undefined) { sets.push('title = ?'); values.push(fields.title || null); }
  if (fields.channelIds !== undefined) { sets.push('channel_ids = ?'); values.push(jsonOrNull(fields.channelIds)); }
  if (fields.metricKeys !== undefined) { sets.push('metric_keys = ?'); values.push(jsonOrNull(fields.metricKeys)); }
  if (fields.config !== undefined) { sets.push('config = ?'); values.push(jsonOrNull(fields.config)); }
  if (fields.position !== undefined) { sets.push('position = ?'); values.push(Number(fields.position) || 0); }
  if (fields.width !== undefined) { sets.push('width = ?'); values.push(Math.max(1, Math.min(12, Number(fields.width) || 4))); }
  if (fields.height !== undefined) { sets.push('height = ?'); values.push(Math.max(1, Math.min(12, Number(fields.height) || 2))); }
  if (sets.length === 0) return null;
  values.push(id);
  await pool.execute(`UPDATE dashboard_widgets SET ${sets.join(', ')} WHERE id = ?`, values);
  const [rows] = await pool.execute('SELECT * FROM dashboard_widgets WHERE id = ?', [id]);
  return rows[0] ? formatWidget(rows[0]) : null;
}

async function deleteWidget(id) {
  await pool.execute('DELETE FROM dashboard_widgets WHERE id = ?', [id]);
}

async function reorderWidgets(dashboardId, orderedIds) {
  // Apply positions in the order supplied.
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.execute(
      'UPDATE dashboard_widgets SET position = ? WHERE id = ? AND dashboard_id = ?',
      [i, orderedIds[i], dashboardId]
    );
  }
}

// ── Share links ───────────────────────────────────────────────────────────────

async function createShareToken(dashboardId, createdBy, { expiresAt } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  const [result] = await pool.execute(
    `INSERT INTO dashboard_share_tokens (dashboard_id, token, created_by, expires_at)
     VALUES (?, ?, ?, ?)`,
    [dashboardId, token, createdBy, expiresAt || null]
  );
  const [rows] = await pool.execute(
    'SELECT * FROM dashboard_share_tokens WHERE id = ?',
    [result.insertId]
  );
  return rows[0];
}

async function revokeShareToken(id) {
  await pool.execute(
    'UPDATE dashboard_share_tokens SET revoked_at = NOW() WHERE id = ?',
    [id]
  );
}

// Resolve a token to a dashboard, bumping view counters. Returns null if
// the token doesn't exist, is revoked, or has expired.
async function resolveShareToken(token) {
  const [rows] = await pool.execute(
    `SELECT id, dashboard_id, access, expires_at, revoked_at
     FROM dashboard_share_tokens WHERE token = ?`,
    [token]
  );
  if (rows.length === 0) return null;
  const t = rows[0];
  if (t.revoked_at) return null;
  if (t.expires_at && new Date(t.expires_at) < new Date()) return null;

  await pool.execute(
    'UPDATE dashboard_share_tokens SET last_viewed_at = NOW(), view_count = view_count + 1 WHERE id = ?',
    [t.id]
  );
  return { dashboardId: t.dashboard_id, access: t.access };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function jsonOrNull(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function formatDashboard(row) {
  return {
    id: row.id,
    name: row.name,
    templateKey: row.template_key,
    description: row.description,
    createdBy: row.created_by,
    creatorName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
    teamId: row.team_id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientColor: row.client_color,
    channelIds: parseJsonField(row.channel_ids) || [],
    defaultRange: row.default_range,
    comparisonMode: row.comparison_mode || 'previous_period',
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    widgetCount: row.widget_count != null ? Number(row.widget_count) : undefined,
    activeShareCount: row.active_share_count != null ? Number(row.active_share_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatWidget(row) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    category: row.category,
    widgetType: row.widget_type,
    title: row.title,
    channelIds: parseJsonField(row.channel_ids) || [],
    metricKeys: parseJsonField(row.metric_keys) || [],
    config: parseJsonField(row.config) || {},
    position: row.position,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  addWidget,
  updateWidget,
  deleteWidget,
  reorderWidgets,
  createShareToken,
  revokeShareToken,
  resolveShareToken,
};

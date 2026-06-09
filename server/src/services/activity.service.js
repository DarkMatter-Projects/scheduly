const pool = require('../config/db');

async function getRecentActivity({ limit = 20, entityType, entityId }) {
  let where = '1=1';
  const params = [];

  if (entityType) { where += ' AND a.entity_type = ?'; params.push(entityType); }
  if (entityId)   { where += ' AND a.entity_id   = ?'; params.push(entityId); }

  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const [rows] = await pool.execute(
    `SELECT a.*, u.first_name, u.last_name
     FROM activity_log a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows.map(formatRow);
}

// Paginated audit log query — extra filters (user / action / date) for
// the audit log page UI. Returns { data, pagination } shape.
async function listActivity({ limit = 50, page = 1, entityType, entityId, userId, action, since, until }) {
  let where = '1=1';
  const params = [];

  if (entityType) { where += ' AND a.entity_type = ?'; params.push(entityType); }
  if (entityId)   { where += ' AND a.entity_id   = ?'; params.push(entityId); }
  if (userId)     { where += ' AND a.user_id     = ?'; params.push(userId); }
  if (action)     { where += ' AND a.action      = ?'; params.push(action); }
  if (since)      { where += ' AND a.created_at >= ?'; params.push(since); }
  if (until)      { where += ' AND a.created_at <= ?'; params.push(until); }

  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const safePage  = Math.max(1, parseInt(page,  10) || 1);
  const offset    = (safePage - 1) * safeLimit;

  const [rows] = await pool.execute(
    `SELECT a.*, u.first_name, u.last_name, u.email
     FROM activity_log a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM activity_log a WHERE ${where}`,
    params
  );
  return {
    data: rows.map(formatRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(countRows[0]?.total) || 0,
      totalPages: Math.max(1, Math.ceil((Number(countRows[0]?.total) || 0) / safeLimit)),
    },
  };
}

function formatRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.first_name ? `${r.first_name} ${r.last_name}` : 'System',
    userEmail: r.email,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
    createdAt: r.created_at,
  };
}

// Distinct action types + entity types for the filter dropdowns on the UI.
async function getActivityFacets() {
  const [actions]      = await pool.execute('SELECT DISTINCT action      FROM activity_log ORDER BY action');
  const [entityTypes]  = await pool.execute('SELECT DISTINCT entity_type FROM activity_log ORDER BY entity_type');
  return {
    actions:     actions.map(r => r.action),
    entityTypes: entityTypes.map(r => r.entity_type).filter(Boolean),
  };
}

async function log(userId, action, entityType, entityId, details) {
  await pool.execute(
    'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { getRecentActivity, listActivity, log, getActivityFacets };

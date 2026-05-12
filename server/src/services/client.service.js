const pool = require('../config/db');

async function listClients() {
  const [rows] = await pool.execute(
    `SELECT c.*, u.first_name, u.last_name, t.name AS team_name,
            (SELECT COUNT(*) FROM social_accounts sa WHERE sa.client_id = c.id AND sa.is_active = 1) AS account_count
     FROM clients c
     JOIN users u ON c.created_by = u.id
     LEFT JOIN teams t ON c.team_id = t.id
     ORDER BY c.name ASC`
  );
  return rows.map(formatClient);
}

async function getClient(id) {
  const [rows] = await pool.execute(
    `SELECT c.*, u.first_name, u.last_name, t.name AS team_name
     FROM clients c
     JOIN users u ON c.created_by = u.id
     LEFT JOIN teams t ON c.team_id = t.id
     WHERE c.id = ?`,
    [id]
  );
  if (rows.length === 0) throw Object.assign(new Error('Client not found'), { status: 404 });

  const client = formatClient(rows[0]);

  const [accounts] = await pool.execute(
    `SELECT id, platform, account_name, profile_picture_url, is_active
     FROM social_accounts WHERE client_id = ?
     ORDER BY account_name ASC`,
    [id]
  );

  client.accounts = accounts.map(a => ({
    id: a.id,
    platform: a.platform,
    accountName: a.account_name,
    profilePictureUrl: a.profile_picture_url,
    isActive: !!a.is_active,
  }));

  return client;
}

async function createClient({ name, color, notes, teamId, createdBy }) {
  const [result] = await pool.execute(
    'INSERT INTO clients (name, color, notes, team_id, created_by) VALUES (?, ?, ?, ?, ?)',
    [name, color || null, notes || null, teamId || null, createdBy]
  );
  return getClient(result.insertId);
}

async function updateClient(id, { name, color, notes, teamId }) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color || null); }
  if (notes !== undefined) { fields.push('notes = ?'); values.push(notes || null); }
  if (teamId !== undefined) { fields.push('team_id = ?'); values.push(teamId || null); }

  if (fields.length > 0) {
    values.push(id);
    await pool.execute(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return getClient(id);
}

async function deleteClient(id) {
  await pool.execute('DELETE FROM clients WHERE id = ?', [id]);
}

async function assignAccount(clientId, socialAccountId) {
  // clientId may be null to unassign
  await pool.execute(
    'UPDATE social_accounts SET client_id = ? WHERE id = ?',
    [clientId || null, socialAccountId]
  );
}

function formatClient(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    notes: row.notes,
    teamId: row.team_id,
    teamName: row.team_name,
    createdBy: row.created_by,
    creatorName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
    accountCount: Number(row.account_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { listClients, getClient, createClient, updateClient, deleteClient, assignAccount };

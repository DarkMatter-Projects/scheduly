const pool = require('../config/db');

async function listTeams() {
  const [rows] = await pool.execute(
    `SELECT t.*, u.first_name, u.last_name,
            (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
     FROM teams t
     JOIN users u ON t.created_by = u.id
     ORDER BY t.created_at DESC`
  );
  return rows.map(formatTeam);
}

async function getTeam(id) {
  const [rows] = await pool.execute(
    `SELECT t.*, u.first_name, u.last_name
     FROM teams t JOIN users u ON t.created_by = u.id WHERE t.id = ?`,
    [id]
  );
  if (rows.length === 0) throw Object.assign(new Error('Team not found'), { status: 404 });

  const team = formatTeam(rows[0]);

  // Get members
  const [members] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.avatar_url, tm.joined_at
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = ?
     ORDER BY tm.joined_at ASC`,
    [id]
  );

  team.members = members.map(m => ({
    id: m.id,
    email: m.email,
    firstName: m.first_name,
    lastName: m.last_name,
    role: m.role,
    avatarUrl: m.avatar_url,
    joinedAt: m.joined_at,
  }));

  return team;
}

async function createTeam({ name, description, createdBy, slackWebhookUrl }) {
  const [result] = await pool.execute(
    'INSERT INTO teams (name, description, slack_webhook_url, created_by) VALUES (?, ?, ?, ?)',
    [name, description || null, slackWebhookUrl || null, createdBy]
  );

  // Add creator as a member
  await pool.execute('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', [result.insertId, createdBy]);

  return getTeam(result.insertId);
}

async function updateTeam(id, { name, description, slackWebhookUrl }) {
  const fields = [];
  const values = [];
  if (name !== undefined)             { fields.push('name = ?');              values.push(name); }
  if (description !== undefined)      { fields.push('description = ?');       values.push(description); }
  if (slackWebhookUrl !== undefined)  { fields.push('slack_webhook_url = ?'); values.push(slackWebhookUrl || null); }

  if (fields.length > 0) {
    values.push(id);
    await pool.execute(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return getTeam(id);
}

async function deleteTeam(id) {
  await pool.execute('DELETE FROM teams WHERE id = ?', [id]);
}

async function addMember(teamId, userId) {
  const [existing] = await pool.execute(
    'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId]
  );
  if (existing.length > 0) {
    throw Object.assign(new Error('User is already a member'), { status: 409 });
  }

  await pool.execute('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', [teamId, userId]);
  return getTeam(teamId);
}

async function removeMember(teamId, userId) {
  await pool.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
  return getTeam(teamId);
}

function formatTeam(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slackWebhookUrl: row.slack_webhook_url,
    createdBy: row.created_by,
    creatorName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
    memberCount: row.member_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { listTeams, getTeam, createTeam, updateTeam, deleteTeam, addMember, removeMember };

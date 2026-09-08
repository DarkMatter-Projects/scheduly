import { transaction } from "./database.mjs";
import { Fault } from "./domain.mjs";
export async function teamIdentity(c, user) {
  return (
    await c.query("SELECT * FROM scheduly.team_members WHERE user_id=$1", [
      user,
    ])
  ).rows[0];
}
export async function bindTeamUser(user) {
  return transaction(async (c) => {
    // Email is supplied only by Supabase getUser, after email confirmation.
    const member = (
      await c.query(
        "SELECT * FROM scheduly.team_members WHERE email=$1 FOR UPDATE",
        [user.email.toLowerCase()],
      )
    ).rows[0];
    if (!member?.active || (member.user_id && member.user_id !== user.id))
      throw new Fault(403, "Ask your Admin to grant workspace access.");
    if (!member.user_id)
      await c.query(
        "UPDATE scheduly.team_members SET user_id=$2 WHERE email=$1",
        [member.email, user.id],
      );
    return member;
  });
}
async function admin(c, user) {
  // Serialise role changes so concurrent demotions cannot remove every Admin.
  await c.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('scheduly-team-administration',0))",
  );
  const actor = await teamIdentity(c, user);
  if (!actor?.active || actor.role !== "admin")
    throw new Fault(403, "Only an Admin can manage the team.");
  return actor;
}
export async function listTeam(user) {
  return transaction(async (c) => {
    await admin(c, user);
    return {
      members: (
        await c.query(
          "SELECT m.*,coalesce((SELECT jsonb_agg(a.client_id ORDER BY a.client_id) FROM scheduly.team_client_access a WHERE a.email=m.email),'[]'::jsonb) AS client_ids FROM scheduly.team_members m ORDER BY m.email",
        )
      ).rows,
    };
  });
}
export async function saveTeamMember(user, input) {
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Fault(422, "Enter a valid email address.");
  if (
    !["admin", "editor", "content_creator", "viewer"].includes(input.role) ||
    typeof input.active !== "boolean" ||
    !Array.isArray(input.clientIds) ||
    input.clientIds.some((x) => typeof x !== "string") ||
    new Set(input.clientIds).size !== input.clientIds.length
  )
    throw new Fault(422, "Choose a role, access status and distinct clients.");
  return transaction(async (c) => {
    await admin(c, user);
    const previous = (
      await c.query(
        "SELECT * FROM scheduly.team_members WHERE email=$1 FOR UPDATE",
        [email],
      )
    ).rows[0];
    if ((previous?.version || 0) !== input.version)
      throw new Fault(409, "This team member changed. Reload before saving.");
    if (
      previous?.active &&
      previous.role === "admin" &&
      (!input.active || input.role !== "admin")
    ) {
      const remaining = await c.query(
        "SELECT 1 FROM scheduly.team_members WHERE active AND role='admin' AND email<>$1",
        [email],
      );
      if (!remaining.rowCount)
        throw new Fault(409, "Keep at least one active Admin.");
    }
    const clients = await c.query(
      "SELECT id FROM scheduly.clients WHERE id=ANY($1::text[])",
      [input.clientIds],
    );
    if (clients.rowCount !== input.clientIds.length)
      throw new Fault(422, "One of the selected clients no longer exists.");
    await c.query(
      "INSERT INTO scheduly.team_members(email,role,active) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET role=$2,active=$3,version=scheduly.team_members.version+1,updated_at=now()",
      [email, input.role, input.active],
    );
    await c.query("DELETE FROM scheduly.team_client_access WHERE email=$1", [
      email,
    ]);
    for (const client of input.clientIds)
      await c.query("INSERT INTO scheduly.team_client_access VALUES($1,$2)", [
        email,
        client,
      ]);
    await c.query(
      "INSERT INTO scheduly.team_audit(actor,email,details) VALUES($1,$2,$3)",
      [
        user,
        email,
        JSON.stringify({
          role: input.role,
          active: input.active,
          clientIds: input.clientIds,
        }),
      ],
    );
    return { saved: true };
  });
}

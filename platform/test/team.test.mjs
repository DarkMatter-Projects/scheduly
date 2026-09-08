import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL =
  "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_team_test";
const { pool, initialise } = await import("../src/database.mjs");
const { saveTeamMember, listTeam, bindTeamUser } =
  await import("../src/team.mjs");
const { savePost, act, snapshot } = await import("../src/service.mjs");
before(async () => {
  await initialise();
  await pool.query(
    "TRUNCATE scheduly.clients,scheduly.team_members,scheduly.team_audit CASCADE; INSERT INTO scheduly.clients VALUES('a','A','#000000'),('b','B','#ffffff');INSERT INTO scheduly.accounts(id,client_id,name,network) VALUES('ig','a','A','instagram');INSERT INTO scheduly.team_members(email,user_id,role) VALUES('admin@example.com','admin','admin');",
  );
});
after(() => pool.end());
const member = (email, role, clientIds = ["a"], version = 0) => ({
  email,
  role,
  clientIds,
  active: true,
  version,
});
const draft = () => ({
  clientId: "a",
  title: "Draft",
  caption: "Caption",
  accountIds: ["ig"],
  variants: {},
  media: [],
  timezone: "Africa/Johannesburg",
});
test("only Admin manages team and last Admin is protected", async () => {
  await assert.rejects(listTeam("stranger"), (e) => e.status === 403);
  await assert.rejects(
    saveTeamMember("admin", {
      ...member("admin@example.com", "viewer", [], 1),
    }),
    (e) => e.status === 409,
  );
  await saveTeamMember(
    "admin",
    member("creator@example.com", "content_creator"),
  );
  await bindTeamUser({ id: "creator", email: "creator@example.com" });
  await assert.rejects(
    saveTeamMember("creator", member("bad@example.com", "admin")),
    (e) => e.status === 403,
  );
});
test("Content Creator ownership, Editor approvals, Viewer read-only and revocation", async () => {
  for (const [id, role] of [
    ["editor", "editor"],
    ["viewer", "viewer"],
    ["second", "content_creator"],
  ]) {
    await saveTeamMember("admin", member(`${id}@example.com`, role));
    await bindTeamUser({ id, email: `${id}@example.com` });
  }
  const p = await savePost("creator", draft());
  await assert.rejects(
    savePost("second", { ...draft(), revision: 1 }, p.id),
    (e) => e.status === 403,
  );
  await assert.rejects(
    act("viewer", p.id, "submit", 1),
    (e) => e.status === 403,
  );
  await assert.rejects(
    savePost("creator", { ...draft(), clientId: "b", accountIds: [] }),
    (e) => e.status === 403,
  );
  await act("creator", p.id, "submit", 1);
  await assert.rejects(
    savePost("creator", { ...draft(), revision: 1 }, p.id),
    (e) => e.status === 403,
  );
  await act("editor", p.id, "approve", 1);
  await assert.rejects(savePost("viewer", draft()), (e) => e.status === 403);
  await saveTeamMember("admin", {
    ...member("creator@example.com", "content_creator", ["a"], 1),
    active: false,
  });
  await assert.rejects(savePost("creator", draft()), (e) => e.status === 403);
  await assert.rejects(snapshot("creator"), (e) => e.status === 403);
  await assert.rejects(
    saveTeamMember("admin", member("creator@example.com", "admin", [], 1)),
    (e) => e.status === 409,
  );
});

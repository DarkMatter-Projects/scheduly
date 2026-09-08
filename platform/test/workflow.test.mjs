import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
process.env.DATABASE_URL =
  "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_test";
const { pool, initialise } = await import("../src/database.mjs");
const { savePost, act, snapshot, reconcileRehearsal } =
  await import("../src/service.mjs");
before(async () => {
  await initialise();
  await pool.query(
    "TRUNCATE scheduly.clients CASCADE; INSERT INTO scheduly.clients VALUES('a','Client A','#123456'),('b','Client B','#654321'); INSERT INTO scheduly.memberships VALUES('manager','a','manager'),('editor','a','editor'),('other','b','manager'); INSERT INTO scheduly.accounts(id,client_id,name,network) VALUES('a-ig','a','Client A','instagram'),('a-li','a','Client A','linkedin'),('b-ig','b','Client B','instagram');",
  );
});
after(() => pool.end());
const input = (overrides = {}) => ({
  clientId: "a",
  title: "Reviewed launch",
  caption: "A real revision",
  accountIds: ["a-ig"],
  variants: {},
  media: [],
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  timezone: "Africa/Johannesburg",
  ...overrides,
});
async function approved() {
  const p = await savePost("manager", input());
  await act("manager", p.id, "submit", 1);
  await act("manager", p.id, "approve", 1);
  return p;
}
test("client membership isolates reads and rejects cross-client destinations", async () => {
  await savePost("manager", input());
  assert.equal((await snapshot("other")).posts.length, 0);
  await assert.rejects(savePost("other", input()), (e) => e.status === 403);
  await assert.rejects(
    savePost("manager", input({ accountIds: ["b-ig"] })),
    (e) => e.status === 422,
  );
});
test("editor cannot bypass approval or schedule by writing a schedule/status", async () => {
  const p = await savePost(
    "editor",
    input({ status: "scheduled", approvedRevision: 1 }),
  );
  assert.equal(p.status, "draft");
  await assert.rejects(
    act("editor", p.id, "schedule", 1),
    (e) => e.status === 403,
  );
  await act("editor", p.id, "submit", 1);
  await assert.rejects(
    act("editor", p.id, "approve", 1),
    (e) => e.status === 403,
  );
});
test("scheduling requires current approval and non-empty targets", async () => {
  const p = await savePost("manager", input({ accountIds: [] }));
  await assert.rejects(
    act("manager", p.id, "submit", 1),
    (e) => e.status === 422,
  );
  const draft = await savePost("manager", input());
  await assert.rejects(
    act("manager", draft.id, "schedule", 1),
    (e) => e.status === 409,
  );
});
test("editing queued content cancels old delivery and persists new targets and variant", async () => {
  const p = await approved();
  await act("manager", p.id, "schedule", 1);
  const next = await savePost(
    "editor",
    input({
      revision: 1,
      accountIds: ["a-li"],
      variants: { "a-li": "LinkedIn version" },
    }),
    p.id,
  );
  assert.equal(next.revision, 2);
  assert.equal(next.status, "draft");
  assert.equal(next.approved_revision, null);
  assert.deepEqual(next.account_ids, ["a-li"]);
  assert.equal(next.variants["a-li"], "LinkedIn version");
  assert.equal(
    (
      await pool.query(
        "SELECT state FROM scheduly.deliveries WHERE post_id=$1",
        [p.id],
      )
    ).rows[0].state,
    "cancelled",
  );
  await assert.rejects(
    act("manager", p.id, "approve", 1),
    (e) => e.status === 409,
  );
});
test("concurrent schedule creates exactly one rehearsal job", async () => {
  const p = await approved();
  const results = await Promise.allSettled([
    act("manager", p.id, "schedule", 1),
    act("manager", p.id, "schedule", 1),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query("SELECT 1 FROM scheduly.deliveries WHERE post_id=$1", [
        p.id,
      ])
    ).rowCount,
    1,
  );
});
test("stale save cannot overwrite another editor and transaction preserves content", async () => {
  const p = await savePost("manager", input());
  await savePost(
    "manager",
    input({ revision: 1, title: "Newest version" }),
    p.id,
  );
  await assert.rejects(
    savePost("editor", input({ revision: 1, title: "Stale version" }), p.id),
    (e) => e.status === 409,
  );
  assert.equal(
    (await pool.query("SELECT title FROM scheduly.posts WHERE id=$1", [p.id]))
      .rows[0].title,
    "Newest version",
  );
});
test("media from another client cannot be attached", async () => {
  const id = "aaaa0000-0000-4000-8000-000000000001";
  await pool.query(
    "INSERT INTO scheduly.media VALUES($1,'b','private.png','image/png',1,now())",
    [id],
  );
  await assert.rejects(
    savePost("manager", input({ media: [id] })),
    (e) => e.status === 422,
  );
});
test("ambiguous provider outcomes prevent editing or cancellation", async () => {
  const p = await approved();
  await act("manager", p.id, "schedule", 1);
  await pool.query(
    "UPDATE scheduly.deliveries SET state='unknown_outcome' WHERE post_id=$1",
    [p.id],
  );
  await assert.rejects(
    savePost("manager", input({ revision: 1 }), p.id),
    (e) => e.status === 409,
  );
  await assert.rejects(
    act("manager", p.id, "cancel", 1),
    (e) => e.status === 409,
  );
});
test("due rehearsal work becomes attention, never falsely published", async () => {
  const p = await approved();
  await act("manager", p.id, "schedule", 1);
  await pool.query(
    "UPDATE scheduly.deliveries SET due_at=now()-interval '1 minute' WHERE post_id=$1",
    [p.id],
  );
  await reconcileRehearsal();
  const d = (
    await pool.query("SELECT * FROM scheduly.deliveries WHERE post_id=$1", [
      p.id,
    ])
  ).rows[0];
  assert.equal(d.state, "needs_attention");
  assert.equal(d.published_id, null);
  assert.match(d.last_error, /nothing was published/);
});

test("lost save responses and concurrent retries replay one committed revision", async () => {
  const body = input({ requestId: randomUUID() });
  const [first, retry] = await Promise.all([savePost("manager", body), savePost("manager", body)]);
  assert.equal(first.id, retry.id);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM scheduly.revisions WHERE post_id=$1", [first.id])).rows[0].count, 1);
  const edit = { ...body, title: "Edited once", revision: 1, requestId: randomUUID() };
  await savePost("manager", edit, first.id);
  const repeat = await savePost("manager", edit, first.id);
  assert.equal(repeat.revision, 2);
  await assert.rejects(savePost("manager", { ...edit, title: "Different" },first.id), e => e.status === 409);
});

test("reconciliation skips posts locked by an editor and processes them after release", async () => {
  const post = await approved();
  await act("manager", post.id, "schedule", 1);
  await pool.query("UPDATE scheduly.deliveries SET due_at=now()-interval '1 minute' WHERE post_id=$1", [post.id]);
  const editor = await pool.connect();
  try {
    await editor.query("BEGIN");
    await editor.query("SELECT id FROM scheduly.posts WHERE id=$1 FOR UPDATE", [post.id]);
    await reconcileRehearsal();
    assert.equal((await editor.query("SELECT state FROM scheduly.deliveries WHERE post_id=$1", [post.id])).rows[0].state, "queued");
    await editor.query("COMMIT");
    await reconcileRehearsal();
    assert.equal((await pool.query("SELECT state FROM scheduly.deliveries WHERE post_id=$1", [post.id])).rows[0].state, "needs_attention");
  } finally { await editor.query("ROLLBACK"); editor.release(); }
});

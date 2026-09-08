import { teamIdentity } from "./team.mjs";
import { randomUUID, createHash } from "node:crypto";
import { transaction } from "./database.mjs";
import { Fault, requireRole, validatePost, checkAction } from "./domain.mjs";
const json = JSON.stringify;
export async function membership(c, user, clientId) {
  const member = await teamIdentity(c, user);
  if (member) {
    if (!member.active)
      throw new Fault(403, "Your workspace access is disabled.");
    const access = await c.query(
      "SELECT 1 FROM scheduly.clients WHERE id=$1 AND ($2='admin' OR EXISTS(SELECT 1 FROM scheduly.team_client_access WHERE email=$3 AND client_id=$1))",
      [clientId, member.role, member.email],
    );
    if (!access.rowCount)
      throw new Fault(403, "This client is outside your workspace access.");
    return {
      admin: "manager",
      editor: "reviewer",
      content_creator: "creator",
      viewer: "viewer",
    }[member.role];
  }
  const { rows } = await c.query(
    "SELECT role FROM scheduly.memberships WHERE user_id=$1 AND client_id=$2",
    [user, clientId],
  );
  if (!rows[0])
    throw new Fault(403, "This client is outside your workspace access.");
  return rows[0].role;
}
export async function snapshot(user) {
  return transaction(async (c) => {
    const team = await teamIdentity(c, user);
    if (team && !team.active)
      throw new Fault(403, "Your workspace access is disabled.");
    const clients = team
      ? (
          await c.query(
            "SELECT c.*,$2::text AS role FROM scheduly.clients c WHERE $2='admin' OR EXISTS(SELECT 1 FROM scheduly.team_client_access a WHERE a.email=$1 AND a.client_id=c.id) ORDER BY c.name",
            [team.email, team.role],
          )
        ).rows
      : (
          await c.query(
            "SELECT c.*,m.role FROM scheduly.clients c JOIN scheduly.memberships m ON m.client_id=c.id WHERE m.user_id=$1 ORDER BY c.name",
            [user],
          )
        ).rows;
    const ids = clients.map((c) => c.id),
      rows = async (table) =>
        (
          await c.query(
            `SELECT * FROM scheduly.${table} WHERE client_id=ANY($1::text[])`,
            [ids],
          )
        ).rows;
    const posts = (await rows("posts")).filter(
      (p) =>
        team?.role !== "viewer" ||
        ["approved", "scheduled", "published"].includes(p.status),
    );
    const visiblePosts = new Set(posts.map((p) => p.id));
    const visibleMedia = new Set(posts.flatMap((p) => p.media));
    const deliveries = (
      await c.query(
        "SELECT d.* FROM scheduly.deliveries d JOIN scheduly.posts p ON p.id=d.post_id WHERE p.client_id=ANY($1::text[])",
        [ids],
      )
    ).rows;
    const events = (
      await c.query(
        "SELECT e.* FROM scheduly.events e JOIN scheduly.posts p ON p.id=e.post_id WHERE p.client_id=ANY($1::text[]) ORDER BY e.id DESC LIMIT 100",
        [ids],
      )
    ).rows;
    return {
      clients,
      team: team ? { role: team.role, email: team.email } : null,
      accounts: await rows("accounts"),
      posts,
      media: (await rows("media")).filter(
        (a) => team?.role !== "viewer" || visibleMedia.has(a.id),
      ),
      deliveries: deliveries.filter((d) => visiblePosts.has(d.post_id)),
      events: events.filter((e) => visiblePosts.has(e.post_id)),
      mode: "local-rehearsal",
      user: {
        id: user,
        name: user === "local-editor" ? "Preview editor" : "Preview manager",
      },
      metrics: [],
      refreshedAt: new Date().toISOString(),
    };
  });
}
export async function savePost(user, input, id) {
  return transaction(async (c) => {
    const role = await membership(c, user, input.clientId);
    requireRole(role, ["editor", "manager", "reviewer", "creator"]);
    const requestId = input.requestId;
    const inputHash = createHash("sha256")
      .update(json({ id: id || null, input }))
      .digest("hex");
    if (requestId) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          requestId,
        )
      )
        throw new Fault(422, "Invalid save request identifier.");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${user}:${requestId}`,
      ]);
      const receipt = (
        await c.query(
          "SELECT * FROM scheduly.save_receipts WHERE user_id=$1 AND request_id=$2",
          [user, requestId],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.input_hash !== inputHash)
          throw new Fault(
            409,
            "A save identifier cannot be reused for different content.",
          );
        return receipt.response;
      }
    }

    const accounts = (
      await c.query("SELECT * FROM scheduly.accounts WHERE client_id=$1", [
        input.clientId,
      ])
    ).rows;
    const p = validatePost(input, accounts);
    if (p.media.length) {
      const assets = await c.query(
        "SELECT id FROM scheduly.media WHERE client_id=$1 AND id=ANY($2::uuid[])",
        [input.clientId, p.media],
      );
      if (assets.rowCount !== new Set(p.media).size)
        throw new Fault(422, "Media must belong to this client.");
    }
    let revision = 1;
    if (id) {
      const old = (
        await c.query("SELECT * FROM scheduly.posts WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      if (!old) throw new Fault(404, "Post not found.");
      await membership(c, user, old.client_id);
      if (old.client_id !== input.clientId)
        throw new Fault(422, "Create a new post to change the client.");
      if (
        role === "creator" &&
        (old.created_by !== user || old.status !== "draft")
      )
        throw new Fault(
          403,
          "Content Creators can edit only their own drafts.",
        );
      if (old.revision !== input.revision)
        throw new Fault(
          409,
          "This post changed. Reload before saving so you do not overwrite another edit.",
        );
      if (["published", "cancelled"].includes(old.status))
        throw new Fault(409, "This post is read-only.");
      const active = await c.query(
        "SELECT 1 FROM scheduly.deliveries WHERE post_id=$1 AND state IN ('claimed','processing','published','unknown_outcome')",
        [id],
      );
      if (active.rowCount)
        throw new Fault(
          409,
          "Delivery has started. Resolve its outcome before editing.",
        );
      revision = old.revision + 1;
      await c.query(
        "UPDATE scheduly.deliveries SET state='cancelled' WHERE post_id=$1 AND state IN ('queued','needs_attention')",
        [id],
      );
      await c.query(
        "UPDATE scheduly.posts SET revision=$2,status='draft',approved_revision=NULL,title=$3,caption=$4,variants=$5,account_ids=$6,media=$7,scheduled_at=$8,timezone=$9,updated_at=now() WHERE id=$1",
        [
          id,
          revision,
          p.title,
          p.caption,
          json(p.variants),
          json(p.accountIds),
          json(p.media),
          p.scheduledAt,
          p.timezone,
        ],
      );
    } else {
      id = randomUUID();
      await c.query(
        "INSERT INTO scheduly.posts(id,client_id,title,caption,variants,account_ids,media,scheduled_at,timezone,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          input.clientId,
          p.title,
          p.caption,
          json(p.variants),
          json(p.accountIds),
          json(p.media),
          p.scheduledAt,
          p.timezone,
          user,
        ],
      );
    }
    await c.query(
      "INSERT INTO scheduly.revisions SELECT id,revision,to_jsonb(p),$2,now() FROM scheduly.posts p WHERE id=$1",
      [id, user],
    );
    await c.query(
      "INSERT INTO scheduly.events(post_id,actor,action,revision) VALUES($1,$2,$3,$4)",
      [
        id,
        user,
        revision === 1 ? "created" : "edited; approval reset",
        revision,
      ],
    );
    const saved = (
      await c.query("SELECT * FROM scheduly.posts WHERE id=$1", [id])
    ).rows[0];
    if (requestId)
      await c.query(
        "INSERT INTO scheduly.save_receipts(user_id,request_id,input_hash,response) VALUES($1,$2,$3,$4)",
        [user, requestId, inputHash, json(saved)],
      );
    return saved;
  });
}
export async function act(user, id, action, revision) {
  return transaction(async (c) => {
    const post = (
      await c.query("SELECT * FROM scheduly.posts WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!post) throw new Fault(404, "Post not found.");
    const role = await membership(c, user, post.client_id);
    if (post.revision !== revision)
      throw new Fault(
        409,
        "This revision has changed. Review the latest version.",
      );
    if (
      role === "creator" &&
      (post.created_by !== user ||
        post.status !== "draft" ||
        action !== "submit")
    )
      throw new Fault(
        403,
        "Content Creators can submit only their own drafts.",
      );
    const status = checkAction(post, action, role);
    if (action === "cancel") {
      if (
        (
          await c.query(
            "SELECT 1 FROM scheduly.deliveries WHERE post_id=$1 AND state IN ('claimed','processing','published','unknown_outcome')",
            [id],
          )
        ).rowCount
      )
        throw new Fault(
          409,
          "Delivery has started. Resolve its outcome before cancellation.",
        );
      await c.query(
        "UPDATE scheduly.deliveries SET state='cancelled' WHERE post_id=$1 AND state IN ('queued','needs_attention')",
        [id],
      );
    }
    if (action === "schedule") {
      // Rehearsal jobs are durable but never sent to a provider. Live activation requires a separate authenticated gateway and provider acceptance.
      for (const account of post.account_ids)
        await c.query(
          "INSERT INTO scheduly.deliveries(id,post_id,revision,account_id,due_at) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), id, revision, account, post.scheduled_at],
        );
    }
    await c.query(
      "UPDATE scheduly.posts SET status=$2,approved_revision=$3,updated_at=now() WHERE id=$1",
      [
        id,
        status,
        action === "approve"
          ? revision
          : action === "reject"
            ? null
            : post.approved_revision,
      ],
    );
    await c.query(
      "INSERT INTO scheduly.events(post_id,actor,action,revision) VALUES($1,$2,$3,$4)",
      [id, user, action, revision],
    );
    return { id, status, revision };
  });
}
export async function reconcileRehearsal() {
  return transaction(async (c) => {
    // All mutation paths lock the post before its deliveries to avoid lock inversion.
    const { rows } = await c.query(
      "SELECT p.id FROM scheduly.posts p WHERE EXISTS (SELECT 1 FROM scheduly.deliveries d WHERE d.post_id=p.id AND d.state='queued' AND d.due_at<=now()) ORDER BY p.id FOR UPDATE OF p SKIP LOCKED LIMIT 30",
    );
    let count = 0;
    for (const post of rows) {
      const updated = await c.query(
        "UPDATE scheduly.deliveries SET state='needs_attention',last_error='Rehearsal only. No provider is connected; nothing was published.' WHERE post_id=$1 AND state='queued' AND due_at<=now()",
        [post.id],
      );
      count += updated.rowCount;
      if (updated.rowCount)
        await c.query(
          "UPDATE scheduly.posts SET status='needs_attention' WHERE id=$1",
          [post.id],
        );
    }
    return count;
  });
}

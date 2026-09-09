import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMetaService } from "../src/meta.mjs";
import { createYouTubeService } from "../src/youtube.mjs";

process.env.DATABASE_URL =
  "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_provider_test";
const { pool, initialise, transaction } = await import("../src/database.mjs");
const config = {
  appId: "meta-id",
  appSecret: "meta-secret",
  clientId: "google-id",
  clientSecret: "google-secret",
  tokenKey: "cd".repeat(32),
  redirectUri: "https://example.test/workspace.html?provider=test",
};
const meta = createMetaService({
  transaction,
  config,
  fetcher: async (url) => {
    const target = String(url);
    if (target.includes("/oauth/access_token"))
      return Response.json({ access_token: target.includes("fb_exchange_token") ? "long-user" : "short-user" });
    if (target.includes("/me/accounts"))
      return Response.json({
        data: [
          {
            id: "page-one",
            name: "Test Page",
            access_token: "private-page-token",
            instagram_business_account: { id: "instagram-one", username: "testcreator" },
          },
        ],
      });
    throw new Error(`Unexpected Meta URL ${target}`);
  },
});
const youtube = createYouTubeService({
  transaction,
  config,
  fetcher: async (url) => {
    const target = String(url);
    if (target === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "private-google-access",
        refresh_token: "private-google-refresh",
        expires_in: 3600,
      });
    if (target.includes("youtube/v3/channels"))
      return Response.json({ items: [{ id: "channel-one", snippet: { title: "Test Channel" } }] });
    throw new Error(`Unexpected Google URL ${target}`);
  },
});

before(async () => {
  await initialise();
  await pool.query(
    "DROP TABLE IF EXISTS scheduly.provider_grants,scheduly.provider_connection_sessions,scheduly.provider_oauth_states",
  );
  const migration = await readFile(
    new URL("../../supabase/migrations/20260909090000_meta-youtube-connections.sql", import.meta.url),
    "utf8",
  );
  await pool.query(migration.replace(/REVOKE ALL ON[^;]+;/g, ""));
  await pool.query(
    "TRUNCATE scheduly.clients,scheduly.team_members CASCADE; INSERT INTO scheduly.clients VALUES('a','A','#000'),('b','B','#fff'); INSERT INTO scheduly.team_members(email,user_id,role) VALUES('admin@example.test','admin','admin'),('editor@example.test','editor','editor');",
  );
});
after(() => pool.end());

async function connect(service, provider, accountIds) {
  const { url } = await service.start("admin", { clientId: "a" });
  const state = new URL(url).searchParams.get("state");
  await assert.rejects(service.complete("editor", { state, code: "code" }), (error) => error.status === 403);
  const pending = await service.complete("admin", { state, code: "code" });
  assert.equal(JSON.stringify(pending).includes("private-"), false);
  const result = await service.finalize("admin", { sessionId: pending.sessionId, accountIds });
  assert.equal(result.connected.length, accountIds.length);
  await assert.rejects(
    service.finalize("admin", { sessionId: pending.sessionId, accountIds }),
    (error) => error.status === 409,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM scheduly.provider_grants WHERE provider=$1", [provider])).rows[0].count,
    accountIds.length,
  );
}

test("Meta connection is Admin-bound, requires selection and keeps grants private", async () => {
  await connect(meta, "meta", ["facebook:page-one", "instagram:page-one"]);
});

test("YouTube connection stores only selected channels and rejects client reassignment", async () => {
  await connect(youtube, "youtube", ["youtube:channel-one"]);
  const { url } = await youtube.start("admin", { clientId: "b" });
  const pending = await youtube.complete("admin", { state: new URL(url).searchParams.get("state"), code: "code" });
  await assert.rejects(
    youtube.finalize("admin", { sessionId: pending.sessionId, accountIds: ["youtube:channel-one"] }),
    (error) => error.status === 409,
  );
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTikTokService, tokenCipher } from "../src/tiktok.mjs";
process.env.DATABASE_URL =
  "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_tiktok_test";
const { pool, initialise, transaction } = await import("../src/database.mjs");
const config = {
  clientKey: "fixture",
  clientSecret: "fixture-secret",
  tokenKey: "ab".repeat(32),
  redirectUri: "https://example.test/workspace.html",
};
let calls = [];
const fetcher = async (url, options) => {
  calls.push({ url, options });
  if (url.includes("/oauth/token/"))
    return Response.json({
      access_token: "private-access",
      refresh_token: "private-refresh",
      open_id: "account-one",
      expires_in: 3600,
      scope: "user.info.basic,video.upload",
    });
  if (url.includes("/user/info/"))
    return Response.json({
      data: { user: { open_id: "account-one", display_name: "Test creator" } },
      error: { code: "ok" },
    });
  if (url.includes("/inbox/video/init/"))
    return Response.json({
      data: {
        publish_id: "upload-one",
        upload_url: "https://upload.us.tiktokapis.com/video/?upload_id=1",
      },
      error: { code: "ok" },
    });
  if (url.includes("/status/fetch/"))
    return Response.json({
      data: { status: "SEND_TO_USER_INBOX" },
      error: { code: "ok" },
    });
  if (url.startsWith("https://upload.us.tiktokapis.com/"))
    return new Response(null, { status: 201 });
  throw new Error("Unexpected endpoint");
};
const service = createTikTokService({
  transaction,
  config,
  fetcher,
  storage: {
    from: () => ({ download: async () => ({ data: new Blob(["test"]) }) }),
  },
});
before(async () => {
  await initialise();
  await pool.query(
    "DROP TABLE IF EXISTS scheduly.tiktok_draft_uploads,scheduly.tiktok_grants,scheduly.tiktok_oauth_states",
  );
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260908144717_tiktok-connections.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await pool.query(migration.replace(/REVOKE ALL ON[^;]+;/g, ""));
  await pool.query(
    "TRUNCATE scheduly.clients,scheduly.team_members CASCADE;INSERT INTO scheduly.clients VALUES('a','A','#000'),('b','B','#fff');INSERT INTO scheduly.team_members(email,user_id,role) VALUES('admin@example.test','admin','admin'),('editor@example.test','editor','editor');",
  );
});
after(() => pool.end());
test("encrypted grants reject tampering and account substitution", () => {
  const cipher = tokenCipher(config.tokenKey),
    sealed = cipher.seal({ access_token: "secret" }, "account-a");
  assert.equal(sealed.includes("secret"), false);
  assert.equal(cipher.open(sealed, "account-a").access_token, "secret");
  assert.throws(() => cipher.open(sealed, "account-b"));
  const bytes = Buffer.from(sealed, "base64");
  bytes[30] ^= 1;
  assert.throws(() => cipher.open(bytes.toString("base64"), "account-a"));
});
test("OAuth is Admin-only, bound to user, expiring and single use", async () => {
  await assert.rejects(
    service.start("editor", { clientId: "a" }),
    (e) => e.status === 403,
  );
  let { url } = await service.start("admin", { clientId: "a" });
  const state = new URL(url).searchParams.get("state");
  await assert.rejects(
    service.complete("editor", { state, code: "code" }),
    (e) => e.status === 403,
  );
  const result = await service.complete("admin", { state, code: "code" });
  assert.equal(result.name, "Test creator");
  assert.equal(JSON.stringify(result).includes("private-"), false);
  await assert.rejects(
    service.complete("admin", { state, code: "code" }),
    (e) => e.status === 409,
  );
  ({ url } = await service.start("admin", { clientId: "a" }));
  await pool.query(
    "UPDATE scheduly.tiktok_oauth_states SET expires_at=now()-interval '1 minute'",
  );
  await assert.rejects(
    service.complete("admin", {
      state: new URL(url).searchParams.get("state"),
      code: "code",
    }),
    (e) => e.status === 409,
  );
});
test("cannot silently reassign a connected account to another client", async () => {
  const { url } = await service.start("admin", { clientId: "b" });
  await assert.rejects(
    service.complete("admin", {
      state: new URL(url).searchParams.get("state"),
      code: "code",
    }),
    (e) => e.status === 409,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT client_id FROM scheduly.accounts WHERE external_id='account-one'",
      )
    ).rows[0].client_id,
    "a",
  );
});
test("draft transfer requires consent and same-client media, and retries only check status", async () => {
  const account = (
    await pool.query(
      "SELECT id FROM scheduly.accounts WHERE external_id='account-one'",
    )
  ).rows[0].id;
  const media = "12345678-1234-1234-1234-123456789abc";
  await pool.query(
    "INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,'b','Test','video/mp4',4)",
    [media],
  );
  await assert.rejects(
    service.upload("admin", {
      accountId: account,
      mediaId: media,
      confirmDraft: false,
    }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    service.upload("admin", {
      accountId: account,
      mediaId: media,
      confirmDraft: true,
    }),
    (e) => e.status === 422,
  );
  await pool.query("UPDATE scheduly.media SET client_id='a' WHERE id=$1", [
    media,
  ]);
  const input = { accountId: account, mediaId: media, confirmDraft: true };
  assert.equal((await service.upload("admin", input)).status, "processing");
  assert.equal(
    (await service.upload("admin", input)).status,
    "SEND_TO_USER_INBOX",
  );
  assert.equal(
    calls.filter((c) => c.url.includes("/inbox/video/init/")).length,
    1,
  );
  assert.equal(calls.filter((c) => c.options.method === "PUT").length, 1);
});

test("storage failure before provider init permits a safe retry", async () => {
 const account=(await pool.query("SELECT id FROM scheduly.accounts WHERE external_id='account-one'")).rows[0].id;
 const media="12345678-1234-1234-1234-123456789abd";
 await pool.query("INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,'a','Retry','video/mp4',4)",[media]);
 const failing=createTikTokService({transaction,config,fetcher,storage:{from:()=>({download:async()=>({error:new Error('offline')})})}});
 const input={accountId:account,mediaId:media,confirmDraft:true};
 await assert.rejects(failing.upload('admin',input));
 assert.equal((await pool.query('SELECT 1 FROM scheduly.tiktok_draft_uploads WHERE media_id=$1',[media])).rowCount,0);
 assert.equal((await service.upload('admin',input)).status,'processing');
});
test('ambiguous initialisation does not resend automatically', async()=>{
 const account=(await pool.query("SELECT id FROM scheduly.accounts WHERE external_id='account-one'")).rows[0].id;
 const media='12345678-1234-1234-1234-123456789abe';
 await pool.query("INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,'a','Uncertain','video/mp4',4)",[media]);
 let initCalls=0;
 const uncertain=createTikTokService({transaction,config,fetcher:async(url,options)=>{if(url.includes('/inbox/video/init/')){initCalls++;throw new Error('connection lost');}return fetcher(url,options);},storage:{from:()=>({download:async()=>({data:new Blob(['test'])})})}});
 const input={accountId:account,mediaId:media,confirmDraft:true};
 await assert.rejects(uncertain.upload('admin',input));
 assert.equal((await uncertain.upload('admin',input)).status,'needs_attention');
 assert.equal(initCalls,1);
});

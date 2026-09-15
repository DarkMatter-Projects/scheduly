import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createYouTubeService, } from "../src/youtube.mjs";
import { tokenCipher } from "../src/tiktok.mjs";
process.env.DATABASE_URL = "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_youtube_upload_test";
const { pool, initialise, transaction } = await import("../src/database.mjs");
const config = { clientId: "google-id", clientSecret: "google-secret", tokenKey: "ef".repeat(32), redirectUri: "https://example.test/workspace.html?provider=youtube" };
const mediaId = "12345678-1234-1234-1234-123456789abc";
let calls = [];
const fetcher = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url) === "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,id&notifySubscribers=false")
    return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=one" } });
  if (String(url).includes("upload_id=one")) return Response.json({ id: "private-video-one" }, { status: 201 });
  throw new Error(`Unexpected endpoint ${url}`);
};
const service = createYouTubeService({
  transaction, config, fetcher,
  storage: { from: () => ({ download: async () => ({ data: new Blob(["test"]) }) }) },
});
before(async () => {
  await initialise();
  await pool.query("DROP TABLE IF EXISTS scheduly.youtube_private_uploads,scheduly.provider_grants,scheduly.provider_connection_sessions,scheduly.provider_oauth_states");
  for (const file of ["20260909090000_meta-youtube-connections.sql", "20260915100000_youtube-private-uploads.sql"])
    await pool.query((await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8")).replace(/REVOKE ALL ON[^;]+;/g, ""));
  await pool.query("TRUNCATE scheduly.clients,scheduly.team_members CASCADE; INSERT INTO scheduly.clients VALUES('a','A','#000'),('b','B','#fff'); INSERT INTO scheduly.team_members(email,user_id,role) VALUES('admin@example.test','admin','admin'),('editor@example.test','editor','editor');");
  const cipher = tokenCipher(config.tokenKey);
  await pool.query("INSERT INTO scheduly.accounts(id,client_id,name,network,connection,external_id) VALUES('youtube-one','a','Test channel','youtube','connected','channel-one')");
  await pool.query("INSERT INTO scheduly.provider_grants(provider,account_id,ciphertext,scopes,expires_at,connected_by) VALUES('youtube','youtube-one',$1,$2,now()+interval '1 hour','admin')", [cipher.seal({ access_token: "private-access", refresh_token: "private-refresh" }, "youtube-one"), ["https://www.googleapis.com/auth/youtube.upload"]]);
  await pool.query("INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,'a','Test.mp4','video/mp4',4)", [mediaId]);
});
after(() => pool.end());
test("private upload is Admin-only, private, encrypted and idempotent", async () => {
  await assert.rejects(service.upload("editor", { accountId: "youtube-one", mediaId, title: "Review proof", confirmPrivateUpload: true }), (error) => error.status === 403);
  const result = await service.upload("admin", { accountId: "youtube-one", mediaId, title: "Review proof", confirmPrivateUpload: true });
  assert.equal(result.status, "private_uploaded");
  const init = calls.find((call) => call.options.method === "POST");
  assert.equal(JSON.parse(init.options.body).status.privacyStatus, "private");
  assert.equal(new URL(init.url).searchParams.get("notifySubscribers"), "false");
  assert.equal((await pool.query("SELECT status,video_id,resume_ciphertext FROM scheduly.youtube_private_uploads")).rows[0].status, "private_uploaded");
  assert.equal((await pool.query("SELECT resume_ciphertext FROM scheduly.youtube_private_uploads")).rows[0].resume_ciphertext, null);
  await service.upload("admin", { accountId: "youtube-one", mediaId, title: "Different title", confirmPrivateUpload: true });
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

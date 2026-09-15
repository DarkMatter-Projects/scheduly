import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Fault } from "./domain.mjs";
import { tokenCipher } from "./tiktok.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const scopes = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
const uploadEndpoint = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,id&notifySubscribers=false";

export function createYouTubeService({ transaction, storage, config, fetcher = fetch }) {
  const ready = Boolean(config.clientId && config.clientSecret && storage && /^[0-9a-f]{64}$/i.test(config.tokenKey || ""));
  const cipher = ready ? tokenCipher(config.tokenKey) : null;
  async function admin(c, user) {
    const member = (await c.query("SELECT role,active FROM scheduly.team_members WHERE user_id=$1 FOR SHARE", [user])).rows[0];
    if (!member?.active || member.role !== "admin") throw new Fault(403, "Only an Admin can connect or test YouTube channels.");
  }
  function configured() { if (!ready) throw new Fault(503, "YouTube connection credentials are not configured yet."); }
  async function json(response, message) {
    try { return await response.json(); } catch { throw new Fault(502, message); }
  }
  async function token(body) {
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...body }),
    });
    const result = await json(response, "Google authorisation failed. Please connect again.");
    if (!response.ok || !result.access_token || !Number.isFinite(result.expires_in)) throw new Fault(502, "Google authorisation failed. Please connect again.");
    return result;
  }
  async function channels(accessToken) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.search = new URLSearchParams({ part: "snippet,contentDetails,statistics", mine: "true", maxResults: "50" }).toString();
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await json(response, "YouTube could not list the authorised channels.");
    if (!response.ok || !Array.isArray(result.items)) throw new Fault(502, "YouTube could not list the authorised channels.");
    return result.items.filter((channel) => typeof channel.id === "string" && channel.id && typeof channel.snippet?.title === "string").map((channel) => ({ id: channel.id, name: channel.snippet.title.slice(0, 160) }));
  }
  function validUploadLocation(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.port || url.username || url.password || !url.pathname.startsWith("/upload/youtube/")) throw new Fault(502, "YouTube returned an unexpected upload destination.");
    return url.toString();
  }
  async function freshGrant(c, account) {
    let grant = cipher.open(account.ciphertext, account.id);
    if (new Date(account.expires_at).getTime() >= Date.now() + 60000) return grant;
    const renewed = await token({ grant_type: "refresh_token", refresh_token: grant.refresh_token });
    grant = { ...grant, ...renewed, refresh_token: renewed.refresh_token || grant.refresh_token };
    await c.query("UPDATE scheduly.provider_grants SET ciphertext=$2,expires_at=now()+($3*interval '1 second'),updated_at=now() WHERE account_id=$1", [account.id, cipher.seal(grant, account.id), grant.expires_in]);
    return grant;
  }
  async function prepareUpload(user, input) {
    configured();
    if (input.confirmPrivateUpload !== true || typeof input.accountId !== "string" || typeof input.mediaId !== "string") throw new Fault(422, "Confirm the channel and private upload.");
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 100) throw new Fault(422, "Use a private upload title of up to 100 characters.");
    return transaction(async (c) => {
      await admin(c, user);
      const account = (await c.query("SELECT a.*,g.ciphertext,g.expires_at FROM scheduly.accounts a JOIN scheduly.provider_grants g ON g.account_id=a.id AND g.provider='youtube' WHERE a.id=$1 AND a.network='youtube' AND a.connection='connected' FOR UPDATE OF g", [input.accountId])).rows[0];
      if (!account) throw new Fault(422, "Connect this YouTube channel first.");
      const asset = (await c.query("SELECT * FROM scheduly.media WHERE id=$1 AND client_id=$2 AND mime='video/mp4'", [input.mediaId, account.client_id])).rows[0];
      if (!asset) throw new Fault(422, "Select an MP4 from this client’s media library.");
      if (Number(asset.size) > 20000000) throw new Fault(422, "Use a video under 20 MB.");
      const grant = await freshGrant(c, account);
      const previous = (await c.query("SELECT * FROM scheduly.youtube_private_uploads WHERE account_id=$1 AND media_id=$2 FOR UPDATE", [account.id, asset.id])).rows[0];
      if (previous) return { previous, grant, account, asset };
      const id = randomUUID();
      await c.query("INSERT INTO scheduly.youtube_private_uploads(id,account_id,media_id,created_by,title) VALUES($1,$2,$3,$4,$5)", [id, account.id, asset.id, user, title]);
      return { upload: { id, title }, grant, account, asset };
    });
  }
  async function finishUpload(uploadId, response, accountId) {
    if (!response.ok) throw new Fault(502, "YouTube could not complete the private upload.");
    const result = await json(response, "YouTube returned an invalid upload result.");
    if (typeof result.id !== "string" || !result.id || result.id.length > 128) throw new Fault(502, "YouTube did not return a private video ID.");
    await transaction((c) => c.query("UPDATE scheduly.youtube_private_uploads SET status='private_uploaded',video_id=$2,resume_ciphertext=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND account_id=$3", [uploadId, result.id, accountId]));
    return { status: "private_uploaded", videoId: result.id, message: "Private YouTube video uploaded. It is visible only to the channel owner." };
  }
  async function privateUpload(user, input) {
    const prepared = await prepareUpload(user, input);
    if (prepared.previous?.status === "private_uploaded") return { status: "private_uploaded", videoId: prepared.previous.video_id, message: "This private YouTube video is already uploaded." };
    const attempt = prepared.upload || prepared.previous;
    const asset = prepared.asset;
    const { data, error } = await storage.from("scheduly-media").download(`${encodeURIComponent(asset.client_id)}/${asset.id}`);
    if (error || !data || data.size !== Number(asset.size)) {
      if (prepared.upload) await transaction((c) => c.query("DELETE FROM scheduly.youtube_private_uploads WHERE id=$1 AND status='preparing'", [attempt.id]));
      throw new Fault(502, "The original video could not be loaded. Please retry.");
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    try {
      let response;
      if (attempt.resume_ciphertext) {
        const location = validUploadLocation(cipher.open(attempt.resume_ciphertext, attempt.id).url);
        const status = await fetcher(location, { method: "PUT", redirect: "error", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${prepared.grant.access_token}`, "Content-Length": "0", "Content-Range": `bytes */${bytes.length}` } });
        if (status.ok) return await finishUpload(attempt.id, status, input.accountId);
        if (status.status !== 308) throw new Fault(502, "YouTube could not confirm the interrupted upload. It needs attention.");
        const match = status.headers.get("range")?.match(/^bytes=0-(\d+)$/), offset = match ? Number(match[1]) + 1 : 0;
        if (!Number.isSafeInteger(offset) || offset > bytes.length) throw new Fault(502, "YouTube returned an invalid upload position.");
        response = await fetcher(location, { method: "PUT", redirect: "error", signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${prepared.grant.access_token}`, "Content-Length": String(bytes.length - offset), "Content-Type": "video/mp4", "Content-Range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}` }, body: bytes.slice(offset) });
      } else {
        const init = await fetcher(uploadEndpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${prepared.grant.access_token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(bytes.length), "X-Upload-Content-Type": "video/mp4" }, body: JSON.stringify({ snippet: { title: attempt.title, description: "Private Scheduly integration verification upload." }, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } }) });
        if (!init.ok) throw new Fault(502, "YouTube could not start the private upload.");
        const location = validUploadLocation(init.headers.get("location") || "");
        await transaction((c) => c.query("UPDATE scheduly.youtube_private_uploads SET status='uploading',resume_ciphertext=$2,updated_at=now() WHERE id=$1", [attempt.id, cipher.seal({ url: location }, attempt.id)]));
        response = await fetcher(location, { method: "PUT", redirect: "error", signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${prepared.grant.access_token}`, "Content-Length": String(bytes.length), "Content-Type": "video/mp4", "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes });
      }
      return await finishUpload(attempt.id, response, input.accountId);
    } catch (error) {
      await transaction((c) => c.query("UPDATE scheduly.youtube_private_uploads SET status='needs_attention',last_error=$2,updated_at=now() WHERE id=$1 AND status<>'private_uploaded'", [attempt.id, error instanceof Fault ? error.message : "The upload outcome could not be confirmed."]));
      throw error instanceof Fault ? error : new Fault(502, "YouTube upload could not be confirmed. It needs attention.");
    }
  }
  return {
    async status(user) { return transaction(async (c) => { await admin(c, user); return { configured: ready, mode: "private-upload-test" }; }); },
    async start(user, input) {
      configured(); return transaction(async (c) => {
        await admin(c, user);
        if (typeof input.clientId !== "string" || !(await c.query("SELECT 1 FROM scheduly.clients WHERE id=$1", [input.clientId])).rowCount) throw new Fault(422, "Choose a client before connecting.");
        const state = randomBytes(32).toString("hex");
        await c.query("DELETE FROM scheduly.provider_oauth_states WHERE provider='youtube' AND (user_id=$1 OR expires_at<now())", [user]);
        await c.query("INSERT INTO scheduly.provider_oauth_states(provider,state_hash,user_id,client_id) VALUES('youtube',$1,$2,$3)", [hash(state), user, input.clientId]);
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", state }).toString();
        return { url: url.toString() };
      });
    },
    async complete(user, input) {
      configured(); if (typeof input.state !== "string" || !/^[0-9a-f]{64}$/.test(input.state) || typeof input.code !== "string" || !input.code || input.code.length > 4096) throw new Fault(422, "Invalid YouTube callback. Start the connection again.");
      const state = await transaction(async (c) => { await admin(c, user); const found = await c.query("DELETE FROM scheduly.provider_oauth_states WHERE provider='youtube' AND state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING client_id", [hash(input.state), user]); if (!found.rowCount) throw new Fault(409, "This connection expired or was already used. Start again."); return found.rows[0]; });
      const grant = await token({ grant_type: "authorization_code", code: input.code, redirect_uri: config.redirectUri });
      if (!grant.refresh_token) throw new Fault(422, "Google did not return offline access. Connect again and approve the request.");
      const available = await channels(grant.access_token); if (!available.length) throw new Fault(422, "No YouTube channels were available for this Google account.");
      const id = randomUUID(); await transaction(async (c) => { await admin(c, user); await c.query("INSERT INTO scheduly.provider_connection_sessions(id,provider,user_id,client_id,ciphertext) VALUES($1,'youtube',$2,$3,$4)", [id, user, state.client_id, cipher.seal({ channels: available, grant }, id)]); });
      return { sessionId: id, provider: "youtube", clientId: state.client_id, accounts: available.map((channel) => ({ id: `youtube:${channel.id}`, name: channel.name, network: "youtube" })) };
    },
    async finalize(user, input) {
      configured(); if (typeof input.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.sessionId) || !Array.isArray(input.accountIds) || !input.accountIds.every((id) => typeof id === "string")) throw new Fault(422, "Choose one or more channels to connect.");
      return transaction(async (c) => {
        await admin(c, user); const found = await c.query("DELETE FROM scheduly.provider_connection_sessions WHERE id=$1 AND provider='youtube' AND user_id=$2 AND expires_at>now() RETURNING *", [input.sessionId, user]); if (!found.rowCount) throw new Fault(409, "This channel selection expired. Connect again."); const session = found.rows[0], saved = cipher.open(session.ciphertext, session.id), selected = saved.channels.filter((channel) => input.accountIds.includes(`youtube:${channel.id}`)); if (!selected.length) throw new Fault(422, "Choose a returned channel."); const connected = [];
        for (const channel of selected) { await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`youtube:${channel.id}`]); const existing = (await c.query("SELECT id,client_id FROM scheduly.accounts WHERE network='youtube' AND external_id=$1", [channel.id])).rows[0]; if (existing && existing.client_id !== session.client_id) throw new Fault(409, `${channel.name} already belongs to another client.`); const id = existing?.id || randomUUID(); await c.query("INSERT INTO scheduly.accounts(id,client_id,name,network,connection,external_id) VALUES($1,$2,$3,'youtube','connected',$4) ON CONFLICT(id) DO UPDATE SET name=$3,connection='connected'", [id, session.client_id, channel.name, channel.id]); await c.query("INSERT INTO scheduly.provider_grants(provider,account_id,ciphertext,scopes,expires_at,connected_by) VALUES('youtube',$1,$2,$3,now()+($4*interval '1 second'),$5) ON CONFLICT(account_id) DO UPDATE SET ciphertext=$2,scopes=$3,expires_at=excluded.expires_at,connected_by=$5,updated_at=now()", [id, cipher.seal(saved.grant, id), scopes, saved.grant.expires_in, user]); connected.push({ id, name: channel.name, network: "youtube" }); }
        return { connected };
      });
    },
    upload: privateUpload,
  };
}

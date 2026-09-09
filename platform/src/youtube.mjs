import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Fault } from "./domain.mjs";
import { tokenCipher } from "./tiktok.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const scopes = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function createYouTubeService({ transaction, config, fetcher = fetch }) {
  const ready = Boolean(
    config.clientId &&
      config.clientSecret &&
      /^[0-9a-f]{64}$/i.test(config.tokenKey || ""),
  );
  const cipher = ready ? tokenCipher(config.tokenKey) : null;
  async function admin(c, user) {
    const member = (
      await c.query(
        "SELECT role,active FROM scheduly.team_members WHERE user_id=$1 FOR SHARE",
        [user],
      )
    ).rows[0];
    if (!member?.active || member.role !== "admin")
      throw new Fault(403, "Only an Admin can connect YouTube channels.");
  }
  function configured() {
    if (!ready)
      throw new Fault(503, "YouTube connection credentials are not configured yet.");
  }
  async function token(body) {
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...body,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token || !Number.isFinite(result.expires_in))
      throw new Fault(502, "Google authorisation failed. Please connect again.");
    return result;
  }
  async function channels(accessToken) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.search = new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      mine: "true",
      maxResults: "50",
    }).toString();
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.items))
      throw new Fault(502, "YouTube could not list the authorised channels.");
    return result.items
      .filter((channel) => typeof channel.id === "string" && channel.id && typeof channel.snippet?.title === "string")
      .map((channel) => ({ id: channel.id, name: channel.snippet.title.slice(0, 160) }));
  }
  return {
    async status(user) {
      return transaction(async (c) => {
        await admin(c, user);
        return { configured: ready, mode: "private-upload-test" };
      });
    },
    async start(user, input) {
      configured();
      return transaction(async (c) => {
        await admin(c, user);
        if (
          typeof input.clientId !== "string" ||
          !(
            await c.query("SELECT 1 FROM scheduly.clients WHERE id=$1", [input.clientId])
          ).rowCount
        )
          throw new Fault(422, "Choose a client before connecting.");
        const state = randomBytes(32).toString("hex");
        await c.query(
          "DELETE FROM scheduly.provider_oauth_states WHERE provider='youtube' AND (user_id=$1 OR expires_at<now())",
          [user],
        );
        await c.query(
          "INSERT INTO scheduly.provider_oauth_states(provider,state_hash,user_id,client_id) VALUES('youtube',$1,$2,$3)",
          [hash(state), user, input.clientId],
        );
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          response_type: "code",
          scope: scopes.join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
        }).toString();
        return { url: url.toString() };
      });
    },
    async complete(user, input) {
      configured();
      if (
        typeof input.state !== "string" ||
        !/^[0-9a-f]{64}$/.test(input.state) ||
        typeof input.code !== "string" ||
        !input.code ||
        input.code.length > 4096
      )
        throw new Fault(422, "Invalid YouTube callback. Start the connection again.");
      const state = await transaction(async (c) => {
        await admin(c, user);
        const found = await c.query(
          "DELETE FROM scheduly.provider_oauth_states WHERE provider='youtube' AND state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING client_id",
          [hash(input.state), user],
        );
        if (!found.rowCount)
          throw new Fault(409, "This connection expired or was already used. Start again.");
        return found.rows[0];
      });
      const grant = await token({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: config.redirectUri,
      });
      if (!grant.refresh_token)
        throw new Fault(422, "Google did not return offline access. Connect again and approve the request.");
      const available = await channels(grant.access_token);
      if (!available.length)
        throw new Fault(422, "No YouTube channels were available for this Google account.");
      const id = randomUUID();
      await transaction(async (c) => {
        await admin(c, user);
        await c.query(
          "INSERT INTO scheduly.provider_connection_sessions(id,provider,user_id,client_id,ciphertext) VALUES($1,'youtube',$2,$3,$4)",
          [id, user, state.client_id, cipher.seal({ channels: available, grant }, id)],
        );
      });
      return {
        sessionId: id,
        provider: "youtube",
        clientId: state.client_id,
        accounts: available.map((channel) => ({
          id: `youtube:${channel.id}`,
          name: channel.name,
          network: "youtube",
        })),
      };
    },
    async finalize(user, input) {
      configured();
      if (
        typeof input.sessionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(input.sessionId) ||
        !Array.isArray(input.accountIds) ||
        !input.accountIds.every((id) => typeof id === "string")
      )
        throw new Fault(422, "Choose one or more channels to connect.");
      return transaction(async (c) => {
        await admin(c, user);
        const found = await c.query(
          "DELETE FROM scheduly.provider_connection_sessions WHERE id=$1 AND provider='youtube' AND user_id=$2 AND expires_at>now() RETURNING *",
          [input.sessionId, user],
        );
        if (!found.rowCount)
          throw new Fault(409, "This channel selection expired. Connect again.");
        const session = found.rows[0];
        const saved = cipher.open(session.ciphertext, session.id);
        const selected = saved.channels.filter((channel) => input.accountIds.includes(`youtube:${channel.id}`));
        if (!selected.length) throw new Fault(422, "Choose a returned channel.");
        const connected = [];
        for (const channel of selected) {
          await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `youtube:${channel.id}`,
          ]);
          const existing = (
            await c.query(
              "SELECT id,client_id FROM scheduly.accounts WHERE network='youtube' AND external_id=$1",
              [channel.id],
            )
          ).rows[0];
          if (existing && existing.client_id !== session.client_id)
            throw new Fault(409, `${channel.name} already belongs to another client.`);
          const id = existing?.id || randomUUID();
          await c.query(
            "INSERT INTO scheduly.accounts(id,client_id,name,network,connection,external_id) VALUES($1,$2,$3,'youtube','connected',$4) ON CONFLICT(id) DO UPDATE SET name=$3,connection='connected'",
            [id, session.client_id, channel.name, channel.id],
          );
          await c.query(
            "INSERT INTO scheduly.provider_grants(provider,account_id,ciphertext,scopes,expires_at,connected_by) VALUES('youtube',$1,$2,$3,now()+($4*interval '1 second'),$5) ON CONFLICT(account_id) DO UPDATE SET ciphertext=$2,scopes=$3,expires_at=excluded.expires_at,connected_by=$5,updated_at=now()",
            [id, cipher.seal(saved.grant, id), scopes, saved.grant.expires_in, user],
          );
          connected.push({ id, name: channel.name, network: "youtube" });
        }
        return { connected };
      });
    },
  };
}

import { Buffer } from "node:buffer";
import {
  createHash,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { Fault } from "./domain.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const requiredScopes = ["user.info.basic", "video.upload"];
export function tokenCipher(secret) {
  if (!/^[0-9a-f]{64}$/i.test(secret || ""))
    throw new Error("Provider token encryption is not configured.");
  const key = Buffer.from(secret, "hex");
  return {
    seal(value, context) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context));
      const bytes = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
    },
    open(value, context) {
      const bytes = Buffer.from(value, "base64"),
        decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
    },
  };
}
export function createTikTokService({
  transaction,
  config,
  storage,
  fetcher = fetch,
}) {
  const ready = Boolean(
    config.clientKey &&
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
      throw new Fault(403, "Only an Admin can connect or test accounts.");
  }
  function configured() {
    if (!ready)
      throw new Fault(
        503,
        "TikTok connection credentials are not configured yet.",
      );
  }
  async function token(body) {
    const response = await fetcher(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: config.clientKey,
          client_secret: config.clientSecret,
          ...body,
        }),
      },
    );
    const result = await response.json();
    if (
      !response.ok ||
      result.error ||
      !result.access_token ||
      !result.refresh_token ||
      !result.open_id ||
      !Number.isFinite(result.expires_in)
    )
      throw new Fault(
        502,
        "TikTok authorisation failed. Please connect again.",
      );
    return result;
  }
  async function api(path, accessToken, body) {
    const response = await fetcher(`https://open.tiktokapis.com${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok || result.error?.code !== "ok") {
      const error = new Fault(502, "TikTok could not complete the request. Reconnect if access has expired.");
      // A documented rejection without a publish ID confirms no upload was initialised.
      error.rejectedInit = path === "/v2/post/publish/inbox/video/init/" && Boolean(result.error?.code && result.error.code !== "ok" && !result.data?.publish_id);
      throw error;
    }
    return result.data;
  }
  return {
    async status(user) {
      return transaction(async (c) => {
        await admin(c, user);
        return {
          configured: ready,
          mode: "draft-upload",
          environment: config.environment || "sandbox",
        };
      });
    },
    async upload(user, input) {
      configured();
      if (
        input.confirmDraft !== true ||
        typeof input.accountId !== "string" ||
        typeof input.mediaId !== "string"
      )
        throw new Fault(422, "Confirm the destination and draft upload.");
      const prepared = await transaction(async (c) => {
        await admin(c, user);
        const account = (
          await c.query(
            "SELECT a.*,g.ciphertext,g.expires_at FROM scheduly.accounts a JOIN scheduly.tiktok_grants g ON g.account_id=a.id WHERE a.id=$1 AND a.connection='connected' FOR UPDATE OF g",
            [input.accountId],
          )
        ).rows[0];
        if (!account)
          throw new Fault(422, "Connect this TikTok account first.");
        const asset = (
          await c.query(
            "SELECT * FROM scheduly.media WHERE id=$1 AND client_id=$2 AND mime='video/mp4'",
            [input.mediaId, account.client_id],
          )
        ).rows[0];
        if (!asset)
          throw new Fault(
            422,
            "Select an MP4 from this client’s media library.",
          );
        let grant = cipher.open(account.ciphertext, account.id);
        if (new Date(account.expires_at).getTime() < Date.now() + 60000) {
          grant = await token({
            grant_type: "refresh_token",
            refresh_token: grant.refresh_token,
          });
          if (
            grant.open_id !== account.external_id ||
            !String(grant.scope).split(",").includes("video.upload")
          )
            throw new Fault(
              422,
              "Reconnect this account to restore draft upload access.",
            );
          await c.query(
            "UPDATE scheduly.tiktok_grants SET ciphertext=$2,expires_at=now()+($3*interval '1 second'),updated_at=now() WHERE account_id=$1",
            [account.id, cipher.seal(grant, account.id), grant.expires_in],
          );
        }
        const previous = (
          await c.query(
            "SELECT * FROM scheduly.tiktok_draft_uploads WHERE account_id=$1 AND media_id=$2",
            [account.id, asset.id],
          )
        ).rows[0];
        if (previous) return { previous, token: grant.access_token };
        const attempt = randomUUID();
        await c.query(
          "INSERT INTO scheduly.tiktok_draft_uploads(id,account_id,media_id,created_by) VALUES($1,$2,$3,$4)",
          [attempt, account.id, asset.id, user],
        );
        return { attempt, asset, token: grant.access_token };
      });
      if (prepared.previous) {
        if (!prepared.previous.publish_id)
          return {
            status: prepared.previous.status,
            message:
              "An upload attempt already exists. Check TikTok before trying this media again.",
          };
        const result = await api(
          "/v2/post/publish/status/fetch/",
          prepared.token,
          { publish_id: prepared.previous.publish_id },
        );
        if (typeof result.status !== "string" || result.status.length>80) throw new Fault(502,"TikTok returned an invalid status.");
        await transaction(c=>c.query("UPDATE scheduly.tiktok_draft_uploads SET status=$2 WHERE id=$1",[prepared.previous.id,result.status]));
        return {
          status: result.status,
          message: result.status === "SEND_TO_USER_INBOX"
            ? "Open your TikTok inbox to review and finish posting. This is a draft upload."
            : result.status === "FAILED"
              ? "TikTok could not process this video. The upload needs attention."
              : "TikTok is processing or updating this upload. Check again for its final status.",
        };
      }
      let initStarted = false;
      try {
        const asset = prepared.asset;
        const { data, error } = await storage
          .from("scheduly-media")
          .download(`${encodeURIComponent(asset.client_id)}/${asset.id}`);
        if (
          error ||
          !data ||
          data.size !== Number(asset.size) ||
          data.size > 20000000
        )
          throw new Fault(502, "The original video could not be loaded.");
        initStarted = true;
        const init = await api(
          "/v2/post/publish/inbox/video/init/",
          prepared.token,
          {
            source_info: {
              source: "FILE_UPLOAD",
              video_size: data.size,
              chunk_size: data.size,
              total_chunk_count: 1,
            },
          },
        );
        const target = new URL(init.upload_url);
        if (
          target.protocol !== "https:" ||
          !target.hostname.endsWith(".tiktokapis.com") ||
          target.port ||
          target.username ||
          target.password ||
          !init.publish_id
        )
          throw new Fault(
            502,
            "TikTok returned an unexpected upload destination.",
          );
        await transaction((c) =>
          c.query(
            "UPDATE scheduly.tiktok_draft_uploads SET publish_id=$2,status='transferring' WHERE id=$1",
            [prepared.attempt, init.publish_id],
          ),
        );
        const response = await fetcher(target.toString(), {
          method: "PUT",
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes 0-${data.size - 1}/${data.size}`,
          },
          body: data,
        });
        if (!response.ok)
          throw new Fault(
            502,
            "TikTok did not confirm the transfer. Check its status before trying again.",
          );
        await transaction((c) =>
          c.query(
            "UPDATE scheduly.tiktok_draft_uploads SET status='processing' WHERE id=$1",
            [prepared.attempt],
          ),
        );
        return {
          status: "processing",
          message:
            "Video transferred. Check status, then open your TikTok inbox to review and finish posting.",
        };
      } catch (error) {
        await transaction((c) =>
          c.query(
            !initStarted || error.rejectedInit
              ? "DELETE FROM scheduly.tiktok_draft_uploads WHERE id=$1 AND publish_id IS NULL"
              : "UPDATE scheduly.tiktok_draft_uploads SET status='needs_attention' WHERE id=$1",
            [prepared.attempt],
          ),
        );
        throw error;
      }
    },
    async start(user, input) {
      configured();
      return transaction(async (c) => {
        await admin(c, user);
        if (
          typeof input.clientId !== "string" ||
          !(
            await c.query("SELECT 1 FROM scheduly.clients WHERE id=$1", [
              input.clientId,
            ])
          ).rowCount
        )
          throw new Fault(422, "Choose a client before connecting.");
        const state = randomBytes(32).toString("hex");
        await c.query(
          "DELETE FROM scheduly.tiktok_oauth_states WHERE user_id=$1 OR expires_at<now()",
          [user],
        );
        await c.query(
          "INSERT INTO scheduly.tiktok_oauth_states(state_hash,user_id,client_id) VALUES($1,$2,$3)",
          [hash(state), user, input.clientId],
        );
        const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
        url.search = new URLSearchParams({
          client_key: config.clientKey,
          scope: requiredScopes.join(","),
          response_type: "code",
          disable_auto_auth: "1",
          redirect_uri: config.redirectUri,
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
        throw new Fault(
          422,
          "Invalid TikTok callback. Start the connection again.",
        );
      // Consume before the external exchange, including failures. A fresh attempt is required after failure.
      const state = await transaction(async (c) => {
        await admin(c, user);
        const found = await c.query(
          "DELETE FROM scheduly.tiktok_oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING client_id",
          [hash(input.state), user],
        );
        if (!found.rowCount)
          throw new Fault(
            409,
            "This connection expired or was already used. Start again.",
          );
        return found.rows[0];
      });
      const grant = await token({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: config.redirectUri,
      });
      const scopes = String(grant.scope || "").split(",");
      if (!requiredScopes.every((s) => scopes.includes(s)))
        throw new Fault(
          422,
          "Allow profile access and draft uploads to connect TikTok.",
        );
      const profile = await api(
        "/v2/user/info/?fields=open_id,display_name",
        grant.access_token,
      );
      if (
        !profile?.user?.display_name ||
        profile.user.open_id !== grant.open_id
      )
        throw new Fault(502, "TikTok account identity could not be verified.");
      return transaction(async (c) => {
        await admin(c, user);
        // Do not silently move an account from one client to another.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `tiktok:${grant.open_id}`,
        ]);
        const existing = (
          await c.query(
            "SELECT id,client_id FROM scheduly.accounts WHERE network='tiktok' AND external_id=$1",
            [grant.open_id],
          )
        ).rows[0];
        if (existing && existing.client_id !== state.client_id)
          throw new Fault(
            409,
            "This TikTok account already belongs to another client.",
          );
        const id = existing?.id || randomUUID();
        await c.query(
          "INSERT INTO scheduly.accounts(id,client_id,name,network,connection,external_id) VALUES($1,$2,$3,'tiktok','connected',$4) ON CONFLICT(id) DO UPDATE SET name=$3,connection='connected'",
          [id, state.client_id, profile.user.display_name, grant.open_id],
        );
        await c.query(
          "INSERT INTO scheduly.tiktok_grants(account_id,ciphertext,scopes,expires_at,connected_by) VALUES($1,$2,$3,now()+($4*interval '1 second'),$5) ON CONFLICT(account_id) DO UPDATE SET ciphertext=$2,scopes=$3,expires_at=excluded.expires_at,connected_by=$5,updated_at=now()",
          [id, cipher.seal(grant, id), scopes, grant.expires_in, user],
        );
        return {
          accountId: id,
          name: profile.user.display_name,
          clientId: state.client_id,
          scopes,
          mode: "draft-upload",
        };
      });
    },
  };
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Fault } from "./domain.mjs";
import { tokenCipher } from "./tiktok.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const scopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "read_insights",
];

export function createMetaService({ transaction, config, fetcher = fetch }) {
  const ready = Boolean(
    config.appId &&
      config.appSecret &&
      /^[0-9a-f]{64}$/i.test(config.tokenKey || ""),
  );
  const cipher = ready ? tokenCipher(config.tokenKey) : null;
  const graph = `https://graph.facebook.com/${config.graphVersion || "v24.0"}`;

  async function admin(c, user) {
    const member = (
      await c.query(
        "SELECT role,active FROM scheduly.team_members WHERE user_id=$1 FOR SHARE",
        [user],
      )
    ).rows[0];
    if (!member?.active || member.role !== "admin")
      throw new Fault(403, "Only an Admin can connect Meta accounts.");
  }
  function configured() {
    if (!ready)
      throw new Fault(503, "Meta connection credentials are not configured yet.");
  }
  async function get(path, accessToken) {
    const url = new URL(`${graph}${path}`);
    url.searchParams.set("access_token", accessToken);
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.error)
      throw new Fault(502, "Meta could not complete the request. Connect again.");
    return result;
  }
  async function exchange(params) {
    const url = new URL(`${graph}/oauth/access_token`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token)
      throw new Fault(502, "Meta authorisation failed. Please connect again.");
    return result;
  }
  function selectPage(page) {
    if (
      !page ||
      typeof page.id !== "string" ||
      !page.id ||
      typeof page.name !== "string" ||
      !page.name ||
      typeof page.access_token !== "string" ||
      !page.access_token
    )
      return null;
    const instagram = page.instagram_business_account;
    return {
      id: page.id,
      name: page.name.slice(0, 160),
      token: page.access_token,
      instagram:
        instagram && typeof instagram.id === "string"
          ? {
              id: instagram.id,
              name:
                typeof instagram.username === "string" && instagram.username
                  ? `@${instagram.username.slice(0, 150)}`
                  : "Linked Instagram account",
            }
          : null,
    };
  }
  return {
    async status(user) {
      return transaction(async (c) => {
        await admin(c, user);
        return { configured: ready, mode: "page-selection" };
      });
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
          "DELETE FROM scheduly.provider_oauth_states WHERE provider='meta' AND (user_id=$1 OR expires_at<now())",
          [user],
        );
        await c.query(
          "INSERT INTO scheduly.provider_oauth_states(provider,state_hash,user_id,client_id) VALUES('meta',$1,$2,$3)",
          [hash(state), user, input.clientId],
        );
        const url = new URL(
          `https://www.facebook.com/${config.graphVersion || "v24.0"}/dialog/oauth`,
        );
        url.search = new URLSearchParams({
          client_id: config.appId,
          redirect_uri: config.redirectUri,
          response_type: "code",
          state,
          scope: scopes.join(","),
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
        throw new Fault(422, "Invalid Meta callback. Start the connection again.");
      const state = await transaction(async (c) => {
        await admin(c, user);
        const found = await c.query(
          "DELETE FROM scheduly.provider_oauth_states WHERE provider='meta' AND state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING client_id",
          [hash(input.state), user],
        );
        if (!found.rowCount)
          throw new Fault(409, "This connection expired or was already used. Start again.");
        return found.rows[0];
      });
      const shortGrant = await exchange({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code: input.code,
      });
      const longGrant = await exchange({
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortGrant.access_token,
      });
      const response = await get(
        "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100",
        longGrant.access_token,
      );
      const pages = (response.data || []).map(selectPage).filter(Boolean);
      if (!pages.length)
        throw new Fault(422, "No Facebook Pages were available for this Meta account.");
      const id = randomUUID();
      await transaction(async (c) => {
        await admin(c, user);
        await c.query(
          "INSERT INTO scheduly.provider_connection_sessions(id,provider,user_id,client_id,ciphertext) VALUES($1,'meta',$2,$3,$4)",
          [id, user, state.client_id, cipher.seal({ pages }, id)],
        );
      });
      return {
        sessionId: id,
        provider: "meta",
        clientId: state.client_id,
        accounts: pages.flatMap((page) => [
          { id: `facebook:${page.id}`, name: page.name, network: "facebook" },
          ...(page.instagram
            ? [
                {
                  id: `instagram:${page.id}`,
                  name: page.instagram.name,
                  network: "instagram",
                },
              ]
            : []),
        ]),
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
        throw new Fault(422, "Choose one or more accounts to connect.");
      return transaction(async (c) => {
        await admin(c, user);
        const found = await c.query(
          "DELETE FROM scheduly.provider_connection_sessions WHERE id=$1 AND provider='meta' AND user_id=$2 AND expires_at>now() RETURNING *",
          [input.sessionId, user],
        );
        if (!found.rowCount)
          throw new Fault(409, "This account selection expired. Connect again.");
        const session = found.rows[0];
        const pages = cipher.open(session.ciphertext, session.id).pages;
        const chosen = new Set(input.accountIds);
        const selected = pages.filter(
          (page) =>
            chosen.has(`facebook:${page.id}`) ||
            (page.instagram && chosen.has(`instagram:${page.id}`)),
        );
        if (!selected.length)
          throw new Fault(422, "Choose at least one returned account.");
        const connected = [];
        for (const page of selected) {
          for (const account of [
            chosen.has(`facebook:${page.id}`)
              ? { externalId: page.id, name: page.name, network: "facebook" }
              : null,
            page.instagram && chosen.has(`instagram:${page.id}`)
              ? {
                  externalId: page.instagram.id,
                  name: page.instagram.name,
                  network: "instagram",
                }
              : null,
          ].filter(Boolean)) {
            await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
              `meta:${account.network}:${account.externalId}`,
            ]);
            const existing = (
              await c.query(
                "SELECT id,client_id FROM scheduly.accounts WHERE network=$1 AND external_id=$2",
                [account.network, account.externalId],
              )
            ).rows[0];
            if (existing && existing.client_id !== session.client_id)
              throw new Fault(409, `${account.name} already belongs to another client.`);
            const id = existing?.id || randomUUID();
            await c.query(
              "INSERT INTO scheduly.accounts(id,client_id,name,network,connection,external_id) VALUES($1,$2,$3,$4,'connected',$5) ON CONFLICT(id) DO UPDATE SET name=$3,connection='connected'",
              [id, session.client_id, account.name, account.network, account.externalId],
            );
            await c.query(
              "INSERT INTO scheduly.provider_grants(provider,account_id,ciphertext,scopes,connected_by) VALUES('meta',$1,$2,$3,$4) ON CONFLICT(account_id) DO UPDATE SET ciphertext=$2,scopes=$3,connected_by=$4,updated_at=now()",
              [id, cipher.seal({ access_token: page.token, page_id: page.id }, id), scopes, user],
            );
            connected.push({ id, name: account.name, network: account.network });
          }
        }
        return { connected };
      });
    },
  };
}

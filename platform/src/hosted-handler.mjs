// Hosted requests never derive identity or roles from client-supplied fields.
export function createHostedHandler({
  authenticate,
  snapshot,
  savePost,
  act,
  media,
  team,
  tiktok,
  allowedOrigins,
}) {
  return async (req) => {
    const origin = req.headers.get("origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigins.includes(origin))
      return reply(403, { error: "Unexpected request origin." });
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (req.method === "OPTIONS") {
      headers["Access-Control-Allow-Headers"] =
        "authorization, apikey, content-type, x-client-info";
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      return new Response(null, { status: 204, headers });
    }
    try {
      const auth = req.headers.get("authorization") || "";
      if (!/^Bearer \S+$/.test(auth))
        return reply(401, { error: "Sign in to continue." });
      const user = await authenticate(auth.slice(7));
      if (!user?.id || user.is_anonymous || !user.email_confirmed_at)
        return reply(401, { error: "A verified team account is required." });
      if (team) await team.bind(user);
      const path = new URL(req.url).pathname
        .replace(/^\/functions\/v1\/workspace/, "")
        .replace(/^\/workspace/, "");
      if (path === "/snapshot" && req.method === "GET") {
        const data = await snapshot(user.id);
        if (media) data.media = await media.previews(data.media);
        return reply(200, {
          ...data,
          mode: "hosted-preview",
          user: { id: user.id, name: user.email },
          publishing: false,
        });
      }
      if (path === "/tiktok/status" && req.method === "GET" && tiktok)
        return reply(200, await tiktok.status(user.id));
      if (path === "/team" && req.method === "GET" && team)
        return reply(200, await team.list(user.id));
      if (req.method !== "POST") return reply(404, { error: "Not found." });
      const stream = req.body?.getReader();
      let size = 0;
      const chunks = [];
      if (stream) {
        try {
          while (true) {
            const { value, done } = await stream.read();
            if (done) break;
            size += value.byteLength;
            if (size > (path === "/media" ? 29000000 : 1000000)) {
              await stream.cancel();
              return reply(413, { error: "Request is too large." });
            }
            chunks.push(value);
          }
        } finally {
          stream.releaseLock();
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return reply(400, { error: "Invalid JSON." });
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply(400, { error: "Invalid request." });
      if (tiktok && path === "/tiktok/start")
        return reply(200, await tiktok.start(user.id, body));
      if (tiktok && path === "/tiktok/complete")
        return reply(200, await tiktok.complete(user.id, body));
      if (tiktok && path === "/tiktok/upload")
        return reply(200, await tiktok.upload(user.id, body));
      if (path === "/team/invite" && team?.invite)
        return reply(200, await team.invite(user.id, body));
      if (path === "/team" && team)
        return reply(200, await team.save(user.id, body));
      if (path === "/media" && media)
        return reply(201, await media.upload(user.id, body));
      if (path === "/posts") return reply(201, await savePost(user.id, body));
      const post = path.match(/^\/posts\/([0-9a-f-]{36})(?:\/(action))?$/);
      if (post) {
        // Hosted scheduling waits for a verified live worker. Never enqueue unusable deliveries.
        if (post[2] && body.action === "schedule")
          return reply(409, {
            error:
              "Publishing connections must be verified before scheduling. Your approved content is retained.",
          });
        return reply(
          200,
          post[2]
            ? await act(user.id, post[1], body.action, body.revision)
            : await savePost(user.id, body, post[1]),
        );
      }
      return reply(404, { error: "Not found." });
    } catch (error) {
      return reply(error.status || 500, {
        error: error.status
          ? error.message
          : "The request could not be completed. Please retry.",
      });
    }
  };
}

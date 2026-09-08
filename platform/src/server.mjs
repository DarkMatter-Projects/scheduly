import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { pool, initialise, seed, transaction } from "./database.mjs";
import {
  snapshot,
  savePost,
  act,
  membership,
  reconcileRehearsal,
} from "./service.mjs";
import { Fault } from "./domain.mjs";
if (
  process.env.LOCAL_REHEARSAL !== "1" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "Local rehearsal only. Production startup is disabled until hosted auth and provider acceptance are configured.",
  );
if (
  process.env.DATABASE_URL &&
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error("Rehearsal must use a local database.");
const port = Number(process.env.PORT || 4319),
  mediaDir = new URL("../.data/media/", import.meta.url);
await mkdir(mediaDir, { recursive: true });
await initialise();
await seed();
const send = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 29_000_000)
      throw new Fault(
        413,
        "File is too large. Use a file under 20 MB for this rehearsal.",
      );
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Fault(400, "Invalid JSON.");
  }
}
const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (
      !["127.0.0.1", "localhost"].some(
        (h) => host === `${h}:${port}` || host === `${h}:5175`,
      )
    )
      throw new Fault(403, "Local requests only.");
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://127.0.0.1:5175",
        "http://localhost:5175",
        `http://127.0.0.1:${port}`,
      ].includes(origin)
    )
      throw new Fault(403, "Unexpected request origin.");
    if (req.method !== "GET" && req.headers["x-scheduly-local"] !== "rehearsal")
      throw new Fault(403, "Missing local request guard.");
    const user = "local-manager",
      url = new URL(req.url, `http://127.0.0.1:${port}`),
      path = url.pathname;
    if (path === "/workspace-api/health") {
      await pool.query("SELECT 1");
      return send(res, 200, {
        status: "ready",
        mode: "local-rehearsal",
        publishing: false,
      });
    }
    if (path === "/workspace-api/snapshot" && req.method === "GET")
      return send(res, 200, await snapshot(user));
    if (path === "/workspace-api/posts" && req.method === "POST")
      return send(res, 201, await savePost(user, await body(req)));
    const post = path.match(
      /^\/workspace-api\/posts\/([0-9a-f-]{36})(?:\/(action))?$/,
    );
    if (post && req.method === "POST") {
      const b = await body(req);
      return send(
        res,
        200,
        post[2]
          ? await act(user, post[1], b.action, b.revision)
          : await savePost(user, b, post[1]),
      );
    }
    if (path === "/workspace-api/media" && req.method === "POST") {
      const b = await body(req);
      if (
        !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(b.mime)
      )
        throw new Fault(422, "Use JPEG, PNG, WebP or MP4.");
      if (
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 200 ||
        typeof b.data !== "string"
      )
        throw new Fault(422, "Invalid file.");
      const bytes = Buffer.from(b.data, "base64");
      if (!bytes.length || bytes.length > 20_000_000)
        throw new Fault(422, "Use a file under 20 MB.");
      const signature =
        b.mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : b.mime === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : b.mime === "image/webp"
              ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP"
              : bytes.toString("ascii", 4, 8) === "ftyp";
      if (!signature)
        throw new Fault(422, "The file contents do not match its type.");
      const id = randomUUID();
      let written = false;
      try {
        await transaction(async (c) => {
          await membership(c, user, b.clientId);
          await writeFile(new URL(id, mediaDir), bytes, { flag: "wx" });
          written = true;
          await c.query(
            "INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,$2,$3,$4,$5)",
            [id, b.clientId, b.name, b.mime, bytes.length],
          );
        });
      } catch (e) {
        if (written) await unlink(new URL(id, mediaDir)).catch(() => {});
        throw e;
      }
      return send(res, 201, { id });
    }
    const media = path.match(/^\/workspace-api\/media\/([0-9a-f-]{36})$/);
    if (media && req.method === "GET") {
      const row = await transaction(async (c) => {
        const r = (
          await c.query("SELECT * FROM scheduly.media WHERE id=$1", [media[1]])
        ).rows[0];
        if (!r) throw new Fault(404, "Media not found.");
        await membership(c, user, r.client_id);
        return r;
      });
      const bytes = await readFile(new URL(row.id, mediaDir));
      res.writeHead(200, {
        "Content-Type": row.mime,
        "Content-Length": bytes.length,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      });
      return res.end(bytes);
    }
    throw new Fault(404, "Not found.");
  } catch (e) {
    if (!e.status) console.error(e.message);
    send(res, e.status || 500, {
      error: e.status
        ? e.message
        : "The request could not be completed. Please retry.",
    });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Scheduly local rehearsal API: http://127.0.0.1:${port}`),
);
const timer = setInterval(
  () =>
    reconcileRehearsal().catch((e) =>
      console.error("Queue reconciliation failed:", e.message),
    ),
  15000,
);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });

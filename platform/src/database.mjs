import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://scheduly:local-rehearsal-only@127.0.0.1:55439/scheduly_local",
  max: 8,
});
export async function transaction(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function initialise() {
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
}
export async function seed() {
  await transaction(async (c) => {
    if ((await c.query("SELECT 1 FROM scheduly.clients LIMIT 1")).rowCount)
      return;
    const clients = [
      ["northline", "Northline", "#4b6660"],
      ["studio-june", "Studio June", "#ae7351"],
      ["fieldwork", "Fieldwork", "#637e50"],
    ];
    for (const [id, name, colour] of clients) {
      await c.query("INSERT INTO scheduly.clients VALUES($1,$2,$3)", [
        id,
        name,
        colour,
      ]);
      await c.query(
        "INSERT INTO scheduly.memberships VALUES ('local-manager',$1,'manager'),('local-editor',$1,'editor')",
        [id],
      );
      for (const network of [
        "instagram",
        "facebook",
        "linkedin",
        "youtube",
        "tiktok",
      ])
        await c.query(
          "INSERT INTO scheduly.accounts(id,client_id,name,network) VALUES($1,$2,$3,$4)",
          [`${id}-${network}`, id, name, network],
        );
    }
    const titles = [
      "A calmer way forward",
      "Details make space",
      "Find your wilder side",
      "Design for a brighter tomorrow",
      "Spaces that belong",
      "Good ideas take time",
      "People + planet",
      "A more thoughtful tomorrow",
      "Built for what comes next",
      "Still out there",
      "Creative routines for real life",
      "Meet the makers",
    ];
    const now = new Date();
    for (let i = 0; i < titles.length; i++) {
      const client = clients[i % 3][0],
        network = ["instagram", "linkedin", "tiktok", "facebook"][i % 4],
        status = ["draft", "in_review", "approved"][i % 3],
        id = randomUUID();
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          Math.min(now.getUTCDate() + i, 28),
          7 + (i % 6),
          30,
        ),
      );
      await c.query(
        "INSERT INTO scheduly.posts(id,client_id,status,title,caption,account_ids,scheduled_at,approved_revision,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          client,
          status,
          titles[i],
          `${titles[i]}. A new perspective, made for the everyday.`,
          JSON.stringify([`${client}-${network}`]),
          date,
          status === "approved" ? 1 : null,
          "local-manager",
        ],
      );
      await c.query(
        "INSERT INTO scheduly.revisions SELECT id,revision,to_jsonb(p),created_by,now() FROM scheduly.posts p WHERE id=$1",
        [id],
      );
    }
  });
}

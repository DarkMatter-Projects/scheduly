import test from "node:test";
import assert from "node:assert/strict";
import { createMediaService, validateMedia } from "../src/media.mjs";
const input = {
  clientId: "owned",
  name: "../campaign.png",
  mime: "image/png",
  data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString("base64"),
};
function setup({ denied = false, failInsert = false } = {}) {
  const calls = [];
  const media = createMediaService({
    membership: async () => {
      if (denied) throw Object.assign(new Error("Denied"), { status: 403 });
      return "editor";
    },
    transaction: async (fn) =>
      fn({
        query: async () => {
          if (failInsert) throw new Error("Database offline");
        },
      }),
    storage: {
      from: () => ({
        upload: async (path) => {
          calls.push(["upload", path]);
          return {};
        },
        remove: async (paths) => {
          calls.push(["remove", paths]);
          return {};
        },
        createSignedUrl: async (path, seconds) => ({
          data: {
            signedUrl: `https://storage.test/${path}?expires=${seconds}`,
          },
        }),
        createSignedUrls: async (paths, seconds) => ({
          data: paths.map((path) => ({
            path,
            signedUrl: `https://storage.test/${path}?expires=${seconds}`,
          })),
        }),
      }),
    },
  });
  return { media, calls };
}
test("hosted media rejects file type spoofing and another client before storage access", async () => {
  assert.throws(
    () => validateMedia({ ...input, mime: "image/jpeg" }),
    /contents do not match/,
  );
  const { media, calls } = setup({ denied: true });
  await assert.rejects(media.upload("user", input), /Denied/);
  assert.equal(calls.length, 0);
});
test("hosted originals use server paths and short-lived preview URLs", async () => {
  const { media, calls } = setup();
  const result = await media.upload("user", input);
  assert.match(calls[0][1], /^owned\/[0-9a-f-]{36}$/);
  assert.ok(!calls[0][1].includes("campaign"));
  assert.match(result.url, /expires=300$/);
  const previews = await media.previews([{ id: "asset", client_id: "owned" }]);
  assert.equal(previews[0].url, "https://storage.test/owned/asset?expires=300");
});
test("failed metadata writes remove the uncommitted private original", async () => {
  const { media, calls } = setup({ failInsert: true });
  await assert.rejects(media.upload("user", input), /Database offline/);
  assert.equal(calls[1][0], "remove");
  assert.equal(calls[1][1][0], calls[0][1]);
});

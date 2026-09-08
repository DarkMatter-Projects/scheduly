import test from "node:test";
import assert from "node:assert/strict";
import { rememberMedia } from "../../client/src/workspace/media-cache.mjs";
test("routine polling keeps valid media URLs stable and expires removed access", () => {
  const cache = new Map();
  rememberMedia(cache, [{ id: "a", url: "first", expiresAt: 300000 }], 0);
  rememberMedia(cache, [{ id: "a", url: "second", expiresAt: 330000 }], 30000);
  assert.equal(cache.get("a").url, "first");
  rememberMedia(
    cache,
    [{ id: "a", url: "renewed", expiresAt: 570000 }],
    270000,
  );
  assert.equal(cache.get("a").url, "renewed");
  rememberMedia(cache, [], 280000);
  assert.equal(cache.size, 0);
});

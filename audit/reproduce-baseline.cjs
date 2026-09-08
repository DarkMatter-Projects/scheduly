// Diagnostic evidence for source commit 03d4bc5, not acceptance tests.
// Assertions confirm existing defects. No database or external API is contacted.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.join(__dirname, '../server/src');
const logger = { info() {}, warn() {}, error() {}, debug() {} };
function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, Date, URLSearchParams, console,
    require(name) {
      if (Object.hasOwn(deps, name)) return deps[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return module.exports;
}
function postFixture(status = 'draft') {
  const writes = [];
  const pool = { async execute(sql, params) {
    if (sql.includes('SELECT p.*')) return [[{ id: 7, created_by: 3, status, content: 'Approved copy' }]];
    if (sql.trim().startsWith('SELECT')) return [[]];
    writes.push({ sql, params }); return [{ affectedRows: 1 }];
  } };
  const service = load('services/post.service.js', {
    '../config/db': pool, './storage.service': { publicUrlFor: x => x },
    './sentiment.service': { analyze: () => ({ comparative: 0, label: 'neutral' }) },
  });
  return { service, writes };
}
test('baseline: editor can schedule through updatePost', async () => {
  const { service, writes } = postFixture();
  await service.updatePost(7, { scheduledAt: '2026-10-01T10:00:00Z' }, 3, 'editor');
  assert.ok(writes.some(w => w.sql.includes('status = ?') && w.params.includes('scheduled')));
});
test('baseline: editing approved content does not invalidate approval', async () => {
  const { service, writes } = postFixture('approved');
  await service.updatePost(7, { content: 'Different copy' }, 3, 'editor');
  assert.ok(writes.some(w => w.sql.includes('content = ?')));
  assert.ok(writes.every(w => !w.sql.includes('status =')));
});
test('baseline: edit silently ignores changed social targets', async () => {
  const { service, writes } = postFixture();
  await service.updatePost(7, { targetAccountIds: [99] }, 3, 'editor');
  assert.equal(writes.length, 0);
});
test('baseline: no pending targets is labelled published without a platform call', async () => {
  const writes = []; let calls = 0;
  const conn = { release() {}, async execute(sql, params) {
    if (sql.includes('SELECT id FROM posts')) return [[{ id: 7 }]];
    if (sql.includes('SELECT COUNT')) return [[{ cnt: 0 }]];
    writes.push({ sql, params }); return [{ affectedRows: 1 }];
  } };
  const job = load('jobs/publishJob.js', {
    '../config/db': { getConnection: async () => conn },
    '../services/publisher.service': { publishPost: async () => { calls++; } },
    '../utils/logger': logger,
  });
  await job.runPublishJob();
  assert.equal(calls, 0);
  assert.ok(writes.some(w => w.sql.includes("status = 'published'")));
});
test('baseline: daily refresh sends a YouTube token to Facebook refresh', async () => {
  let calls = 0;
  const job = load('jobs/tokenRefreshJob.js', {
    '../config/db': { execute: async sql => sql.includes('SELECT')
      ? [[{ id: 8, platform: 'youtube', access_token: 'encrypted-fixture' }]] : [{ affectedRows: 1 }] },
    '../services/facebook.service': { refreshLongLivedToken: async () => { calls++; return { accessToken: 'fixture', expiresIn: 3600 }; } },
    '../services/token.service': { encrypt: x => x }, '../utils/logger': logger,
  });
  await job.runTokenRefreshJob(); assert.equal(calls, 1);
});
test('baseline: unused approval link can reset an already published post', async () => {
  const writes = []; let approved = false;
  const service = load('services/post_approval_tokens.service.js', {
    crypto: require('node:crypto'),
    '../config/db': { async execute(sql, params) {
      if (sql.includes('SELECT')) return [[{ id: 1, post_id: 7, post_status: 'published', created_by: 3 }]];
      writes.push({ sql, params }); return [{ affectedRows: 1 }];
    } },
    './notifications.service': { notify: async () => {} },
    './post.service': { approvePost: async () => { approved = true; } },
  });
  await service.recordDecision({ token: 'fixture', decision: 'approved', reviewerName: 'Test reviewer' });
  assert.ok(writes.some(w => w.sql.includes("status = 'pending_approval'")));
  assert.equal(approved, true);
});
test('baseline: TikTok refresh fallback stores a decrypted refresh token', async () => {
  let persisted;
  const service = load('services/tiktok_posting.service.js', {
    axios: { post: async () => ({ data: { access_token: 'new-access', expires_in: 3600 } }) },
    '../config/db': { async execute(sql, params) {
      if (sql.includes('SELECT')) return [[{ id: 7, access_token: 'enc:old', refresh_token: 'enc:refresh-fixture', token_expires_at: '2020-01-01' }]];
      persisted = params; return [{ affectedRows: 1 }];
    } },
    '../config/tiktok_login': { TIKTOK_TOKEN_URL: 'https://fixture.invalid', clientKey: 'fixture', clientSecret: 'fixture' },
    './token.service': { encrypt: x => `enc:${x}`, decrypt: x => x.slice(4) },
    './storage.service': {}, '../config/env': {}, '../utils/logger': logger,
  });
  await service.ensureFreshAccessToken(7);
  assert.equal(persisted[1], 'refresh-fixture');
});

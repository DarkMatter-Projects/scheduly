import test from 'node:test';
import assert from 'node:assert/strict';
import { persistComposer } from '../../client/src/workspace/save-composer.mjs';

test('a failed approval request resumes after the successful save without duplicating it', async () => {
  let checkpoint;
  const calls = [];
  let fail = true;
  const options = { payload: { title: 'Story' }, fingerprint: 'story', submit: true,
    onCheckpoint: value => { checkpoint = value; },
    request: async (path, body) => {
      calls.push({ path, body });
      if (path.endsWith('/action') && fail) throw new Error('Offline');
      return { id: 'saved-post', revision: 2 };
    },
  };
  await assert.rejects(persistComposer(options), /Offline/);
  assert.equal(checkpoint.saved.id, 'saved-post');
  fail = false;
  await persistComposer({ ...options, checkpoint });
  assert.deepEqual(calls.map(c => c.path), ['posts', 'posts/saved-post/action', 'posts/saved-post/action']);
  // A later snapshot failure must retry only the refresh, without further writes.
  await persistComposer({ ...options, checkpoint });
  assert.equal(calls.length, 3);
  await persistComposer({ ...options, checkpoint, fingerprint: 'edited', payload: { title: 'Edited' }, submit: false });
  assert.equal(calls[3].path, 'posts/saved-post');
  assert.equal(calls[3].body.revision, 2);
});

test('a lost save response retries with the same server idempotency key', async () => {
  let checkpoint;
  const keys = [];
  const options = { payload: { title: 'Story' }, fingerprint: 'story', submit: false,
    onCheckpoint: value => { checkpoint = value; },
    request: async (_path, body) => { keys.push(body.requestId); if (keys.length === 1) throw new Error('Response lost'); return { id: 'original', revision: 1 }; },
  };
  await assert.rejects(persistComposer(options), /Response lost/);
  await persistComposer({ ...options, checkpoint });
  assert.equal(keys[0], keys[1]);
  assert.ok(keys[0]);
});

// The browser edition's storage made persistent (#4960, web/js/storage-persist.js): navigator.storage.persist() asked
// when the projects are in the browser's storage and the storage is not persistent yet; a refusal said in one console
// line; nothing asked of a browser without the API, nor for a workspace folder on the disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistStorage, persistBrowserStorage, REFUSED } from '../web/js/storage-persist.js';

// a StorageManager: persisted() answers `already`, persist() answers `grant` (a function: throws), the calls counted
const fake = ({ already = false, grant = true } = {}) => {
  const calls = [];
  return {
    calls,
    persisted: async () => { calls.push('persisted'); return already; },
    persist: async () => { calls.push('persist'); if (typeof grant === 'function') return grant(); return grant; },
  };
};
const BROWSER = { kind: 'browser' }, FOLDER = { kind: 'folder', folder: 'Silinx-projects' };

test('persistStorage: persistent already (not asked again), granted, refused', async () => {
  let s = fake({ already: true });
  assert.equal(await persistStorage(s), 'persisted');
  assert.deepEqual(s.calls, ['persisted']);
  s = fake({ grant: true });
  assert.equal(await persistStorage(s), 'granted');
  assert.deepEqual(s.calls, ['persisted', 'persist']);
  s = fake({ grant: false });
  assert.equal(await persistStorage(s), 'refused');
  assert.deepEqual(s.calls, ['persisted', 'persist']);
});

test('persistStorage: a browser without the API is asked nothing; a failing one is a refusal', async () => {
  assert.equal(await persistStorage(undefined), 'unsupported');
  assert.equal(await persistStorage({}), 'unsupported');
  assert.equal(await persistStorage({ persisted: async () => false }), 'unsupported');   // (persist missing)
  assert.equal(await persistStorage({ persist: async () => true }), 'unsupported');      // (persisted missing)
  assert.equal(await persistStorage(fake({ grant: () => { throw new Error('SecurityError'); } })), 'refused');
  assert.equal(await persistStorage({ persisted: async () => { throw new Error('x'); }, persist: async () => true }), 'refused');
});

test('persistBrowserStorage: one console line when refused, none otherwise; nothing asked for a workspace folder', async () => {
  const run = async (st, s) => { const lines = []; const r = await persistBrowserStorage(st, (l, level) => lines.push([l, level]), s); return { r, lines }; };
  assert.deepEqual(await run(BROWSER, fake({ grant: false })), { r: 'refused', lines: [[REFUSED, 'info']] });
  assert.deepEqual(await run(BROWSER, fake({ grant: true })), { r: 'granted', lines: [] });
  assert.deepEqual(await run(BROWSER, fake({ already: true })), { r: 'persisted', lines: [] });
  assert.deepEqual(await run(BROWSER, {}), { r: 'unsupported', lines: [] });
  const s = fake({ grant: false });
  assert.deepEqual(await run(FOLDER, s), { r: null, lines: [] });
  assert.deepEqual(s.calls, []);
  assert.deepEqual(await run(null, fake()), { r: null, lines: [] });
  // (the line: one line, no warning nor error prefix, the way to keep a copy)
  assert.equal(REFUSED, 'The browser did not make its storage persistent: it may delete the projects kept in it when the disk runs short (File > Export Project (.zip)… keeps a copy).');
});

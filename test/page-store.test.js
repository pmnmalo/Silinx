// The drawings' queue of the page (web/js/page-store.js serialDrawings, #4750): what rewrites drawings or their HDL files
// runs one at a time, in the order asked, a failure not stopping the next; replaced a flag (S.syncing) that skipped a
// drawing's sync while another operation ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialDrawings, pageStore } from '../web/js/page-store.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('#4750 serialDrawings: one at a time, in order, each one\'s result', async () => {
  const log = [];
  let running = 0, most = 0;
  const job = (name, ms) => async () => { running++; most = Math.max(most, running); log.push(`${name}+`); await tick(ms); log.push(`${name}-`); running--; return name; };
  const r = await Promise.all([serialDrawings(job('rename', 30)), serialDrawings(job('sync', 1)), serialDrawings(job('convert', 10))]);
  assert.deepEqual(r, ['rename', 'sync', 'convert']);
  assert.deepEqual(log, ['rename+', 'rename-', 'sync+', 'sync-', 'convert+', 'convert-']);
  assert.equal(most, 1);
});

test('#4750 serialDrawings: a failure is its caller\'s, the next one still runs', async () => {
  const failed = serialDrawings(async () => { await tick(5); throw new Error('no such file'); });
  const next = serialDrawings(() => 'ran');
  await assert.rejects(failed, /no such file/);
  assert.equal(await next, 'ran');
  // (a synchronous throw too)
  await assert.rejects(serialDrawings(() => { throw new Error('bad'); }), /bad/);
  assert.equal(await serialDrawings(() => 42), 42);
});

test('#4750 pageStore: the operations core/drawing-sync.js and core/rename-module.js use', () => {
  const P = pageStore();
  for (const k of ['readProject', 'fileTree', 'readSources', 'readFile', 'writeFile', 'deleteFile', 'renameFile', 'updateProject']) assert.equal(typeof P[k], 'function', k);
});

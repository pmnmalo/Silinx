// A project's folder given to Import Project…'s folder input in the UI tests (test/ui/zip-helpers.js setFolder,
// #4233): in Firefox and WebKit, Playwright waits for the input's 'input' event, which WebKit's folder listing now and
// then never sends; each try is bounded, and after one that timed out the input is emptied and the folder given again
// (three tries); Chrome's page (the DevTools protocol) gives it as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLDER, SET_FOLDER_TIMEOUT, setFolder } from './ui/zip-helpers.js';

/** A Playwright-like page whose folder input answers setInputFiles with `answers` in turn (an Error: thrown). */
function fakePage(answers) {
  const calls = [];
  const input = {
    value: 'C:\\fakepath\\x',
    async setInputFiles(files, opts) { calls.push(['set', files, opts]); const a = answers.shift(); if (a instanceof Error) throw a; },
    async evaluate(fn) { calls.push(['evaluate', input.value]); return fn(input); },
  };
  return { page: { locator: (sel) => ({ first: () => { calls.push(['locator', sel]); return input; } }) }, calls, input };
}
const timeout = () => new Error(`locator.setInputFiles: Timeout ${SET_FOLDER_TIMEOUT}ms exceeded.\nCall log:\n  - waiting for locator('${FOLDER}').first()`);
const sets = (calls) => calls.filter((c) => c[0] === 'set');

test('#4233 a folder whose first try times out is given again, the input emptied in between', async () => {
  const p = fakePage([timeout(), undefined]);
  await setFolder(p, '/tmp/project');
  assert.equal(SET_FOLDER_TIMEOUT, 15000);
  assert.deepEqual(p.calls, [['locator', FOLDER], ['set', ['/tmp/project'], { timeout: 15000 }], ['evaluate', 'C:\\fakepath\\x'], ['set', ['/tmp/project'], { timeout: 15000 }]]);
  assert.equal(p.input.value, '', 'the input emptied before the second try');
  assert.equal(p.lastAction, `setFolder ${FOLDER}`);
});

test('#4233 a folder given at the first try: one call, bounded', async () => {
  const p = fakePage([undefined]);
  await setFolder(p, '/tmp/project', 'input.other');
  assert.deepEqual(p.calls, [['locator', 'input.other'], ['set', ['/tmp/project'], { timeout: 15000 }]]);
});

test('#4233 three tries timed out fail with the last timeout; another error fails at once', async () => {
  let p = fakePage([timeout(), timeout(), timeout(), undefined]);
  await assert.rejects(setFolder(p, '/tmp/project'), /Timeout 15000ms exceeded/);
  assert.equal(sets(p.calls).length, 3);
  p = fakePage([new Error('locator.setInputFiles: Error: [webkitdirectory] input requires passing a path to a directory'), undefined]);
  await assert.rejects(setFolder(p, '/tmp/project'), /requires passing a path to a directory/);
  assert.equal(sets(p.calls).length, 1);
});

test("#4233 Chrome's page (no Playwright page): the folder as any input's files, by setFiles", async () => {
  const calls = [];
  await setFolder({ setFiles: async (...a) => { calls.push(a); } }, '/tmp/project');
  assert.deepEqual(calls, [[FOLDER, ['/tmp/project']]]);
});

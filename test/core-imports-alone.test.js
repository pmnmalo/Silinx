// Every module of core/ imports alone (#4723): each in a fresh worker (its own module graph), so a module that works
// only because another one was loaded first fails here. An import cycle is allowed only if no module of it reads
// another's names at load time (CLAUDE.md ▸ Splitting): core/c-interp-lib.js alone threw "Cannot access 'exprMethods'
// before initialization" (c-interp-lib → c-interp-expr → c-interp-task → c-check → c-const-init → c-interp, whose
// Object.assign of the methods ran at load before c-interp-expr had run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AT_ONCE = 4;          // workers at a time (no stress run on the developer's machine)
const TIMEOUT_MS = 120000;  // a module's import

function coreModules() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
  };
  walk('core');
  return out.sort();
}

const CODE = `const { parentPort, workerData } = require('node:worker_threads');
import(workerData).then(() => parentPort.postMessage(null), (e) => parentPort.postMessage(String(e && e.message || e)));`;

/** The error importing the module alone threw, or null. */
function importAlone(rel) {
  return new Promise((resolve) => {
    const w = new Worker(CODE, { eval: true, workerData: pathToFileURL(path.join(ROOT, rel)).href, stdout: true, stderr: true });
    let settled = false;
    const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); w.terminate().then(() => resolve(r), () => resolve(r)); };
    const timer = setTimeout(() => done('timed out'), TIMEOUT_MS);
    w.once('message', done);
    w.once('error', (e) => done(String(e && e.message || e)));
    w.once('exit', (c) => done(`the worker exited (${c}) before the module was loaded`));
  });
}

test('the C interpreter\'s modules import alone, whichever comes first (#4723)', async () => {
  for (const rel of ['core/c-interp-lib.js', 'core/c-interp-expr.js', 'core/c-interp-task.js', 'core/c-const-init.js',
    'core/c-check.js', 'core/c-interp.js']) assert.equal(await importAlone(rel), null, rel);
});

test('every module of core/ imports alone, in a fresh worker (#4723)', { timeout: 1800000 }, async () => {
  const mods = coreModules();
  assert.ok(mods.includes('core/c-interp-lib.js') && mods.length > 400, `core's modules found: ${mods.length}`);
  const failed = [];
  let next = 0;
  const run = async () => {
    while (next < mods.length) {
      const rel = mods[next++];
      const err = await importAlone(rel);
      if (err !== null) failed.push(`${rel}: ${err}`);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, run));
  assert.deepEqual(failed.sort(), []);
});

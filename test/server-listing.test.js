// The projects' listing, the watcher and the per-request reads without holding the server (#4775): server/concurrent.js
// (a few calls at a time), server/projects.js (lastChange's stats together, a clone's trust mark read asynchronously),
// server/project-watch.js (its scan's stats together, a slow project looked at less often), server/toolchain.js
// (config.json read once per change).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { mapLimit, filesOf } from '../server/concurrent.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let tmp, P, T, W;
before(async () => {
  tmp = await scratchEnv('silinx-listing-test-');
  P = await import('../server/projects.js');
  T = await import('../server/toolchain.js');
  W = await import('../server/project-watch.js');
});
after(() => fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

// fs.promises.stat counted while fn runs: { calls, most (the most waiting at once), result }
async function statsDuring(fn, delay = 5) {
  const stat = fss.promises.stat, seen = { calls: 0, most: 0 };
  let now = 0;
  fss.promises.stat = async (...a) => {
    seen.calls++; seen.most = Math.max(seen.most, ++now);
    try { await sleep(delay); return await stat(...a); } finally { now--; }
  };
  try { seen.result = await fn(); } finally { fss.promises.stat = stat; }
  return seen;
}

// n files in folders of a project's folder, and later ones in hidden folders and build/: the newest counted file's time
async function bigProject(dir, n) {
  let newest = 0;
  for (let i = 0; i < n; i++) {
    const f = path.join(dir, `src${i % 4}`, `f${i}.v`);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, `// ${i}`);
    const t = new Date(2026, 0, 1, 0, 0, i);
    await fs.utimes(f, t, t);
    newest = Math.max(newest, t.getTime());
  }
  for (const f of ['.git/x', 'build/top.bit', 'src0/build/late.v', 'src1/.hidden']) {
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.writeFile(path.join(dir, f), 'later');   // (now: newer than every file counted)
  }
  return newest;
}

test('#4775 mapLimit: every result in order, no more than the limit at once, an error thrown; filesOf: the tree, skip as asked', async () => {
  let now = 0, most = 0;
  const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (x, i) => { most = Math.max(most, ++now); await sleep(x); now--; return x * 10 + i; });
  assert.deepEqual(out, [50, 11, 42, 23, 34, 5]);
  assert.equal(most, 2);
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
  await assert.rejects(mapLimit([1, 2, 3], 2, async x => { if (x === 2) throw new Error('two'); return x; }), /two/);
  const dir = path.join(tmp, 'tree');
  for (const f of ['a.v', 'd/b.v', 'd/e/c.v', '.h/x', 'd/.y', 'build/z', 'd/build/w']) {
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.writeFile(path.join(dir, f), '');
  }
  assert.deepEqual((await filesOf(dir)).sort(), ['.h/x', 'a.v', 'build/z', 'd/.y', 'd/b.v', 'd/build/w', 'd/e/c.v']);
  assert.deepEqual((await filesOf(dir, { skip: (name, rel) => name.startsWith('.') || rel === 'build' })).sort(), ['a.v', 'd/b.v', 'd/build/w', 'd/e/c.v']);
  assert.deepEqual(await filesOf(path.join(tmp, 'none')), []);
});

test('#4775 listProjects: a project\'s files statted together (not one after another); its time still the newest file\'s', async () => {
  const { name } = await P.createProject({ name: 'Many' });
  const dir = P.projectDir(name);
  for (const f of await fs.readdir(dir)) if (f !== 'silinx.json') await fs.rm(path.join(dir, f), { recursive: true, force: true });
  const newest = await bigProject(dir, 40);
  const old = new Date(2025, 0, 1);
  await fs.utimes(path.join(dir, 'silinx.json'), old, old);
  const seen = await statsDuring(() => P.listProjects());
  assert.equal(seen.result.find(r => r.name === 'Many').modified, newest, 'the newest file, hidden folders and build/ aside');
  assert.ok(seen.calls >= 41, `${seen.calls} stats`);
  assert.ok(seen.most > 1, `the stats waited one at a time (${seen.most} at once)`);
});

test('#4775 the watcher: its scan\'s stats together; a project whose look is slow looked at less often', async () => {
  const dir = path.join(tmp, 'watched');
  await bigProject(dir, 24);
  const w = W.createProjectWatcher({ dirOf: () => dir, interval: 5 });
  const seen = await statsDuring(async () => { const off = w.subscribe('P', () => {}); await sleep(100); off(); });
  w.close();
  assert.ok(seen.most > 1, `the scan's stats waited one at a time (${seen.most} at once)`);
  // a look of 50 ms every 5 ms: the timer's looks 4 × 50 ms apart at least (before: one after another, ~1 per 50 ms)
  let looks = 0;
  const slow = W.createProjectWatcher({ dirOf: () => dir, interval: 5, scanDir: async () => { looks++; await sleep(50); return new Map(); } });
  const off = slow.subscribe('S', () => {});
  await sleep(700);
  off(); slow.close();
  assert.ok(looks >= 2 && looks <= 5, `${looks} looks in 700 ms`);
  // a quick one still looked at every interval
  let quick = 0;
  const fast = W.createProjectWatcher({ dirOf: () => dir, interval: 10, scanDir: async () => { quick++; return new Map(); } });
  const off2 = fast.subscribe('F', () => {});
  await sleep(300);
  off2(); fast.close();
  assert.ok(quick >= 10, `${quick} looks in 300 ms`);
});

test('#4775 config.json read once per change, not per request (the relay\'s settings, the MCP remotes, the ISE work folder)', async () => {
  const file = T.configPath();
  const read = fss.readFileSync;
  let reads = 0;
  fss.readFileSync = (f, ...a) => { if (String(f) === file) reads++; return read(f, ...a); };
  try {
    await fs.writeFile(file, JSON.stringify({ relay: { origins: ['https://a.example'], key: 'k'.repeat(24) }, mcp: { remotes: ['Me/Repo'] }, ssh: { remoteDir: '~/b/' } }));
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(T.relayConfig(), { origins: ['https://a.example'], key: 'k'.repeat(24), relays: [] });
      assert.deepEqual(T.mcpRemotes(), ['me/repo']);
      assert.equal(T.iseWorkBase('x', {}), 'b');
    }
    assert.equal(reads, 1, 'read once');
    await fs.writeFile(file, JSON.stringify({ relay: { origins: ['https://c.example', 'ftp://d'] } }));
    assert.deepEqual(T.relayConfig().origins, ['https://c.example'], 'a change read');
    assert.deepEqual(T.mcpRemotes(), []);
    assert.equal(T.iseWorkBase('x', {}), 'x');
    assert.equal(reads, 2);
    await T.saveConfig({ mode: 'silinx' });
    assert.deepEqual(T.relayConfig().origins, ['https://c.example'], 'saved by the server: read again');
    await fs.writeFile(file, '{ not json');
    assert.deepEqual(T.relayConfig(), { origins: [], key: '', relays: [] });
    await fs.rm(file);
    assert.deepEqual(T.relayConfig(), { origins: [], key: '', relays: [] }, 'none');
    assert.deepEqual(T.relayConfig({ relay: { relays: ['https://e.example/x'] } }).relays, ['https://e.example'], 'a config given: not read');
  } finally { fss.readFileSync = read; }
});

test('#4775 a clone\'s trust mark read without holding the server\'s thread; the project still untrusted', async () => {
  const { name } = await P.createProject({ name: 'Cloned' });
  const mark = path.join(P.projectDir(name), P.CLONE_TRUST);
  await fs.mkdir(path.dirname(mark), { recursive: true });
  await fs.writeFile(mark, JSON.stringify({ trusted: false, madeBy: 'mcp' }));
  const read = fss.readFileSync;
  let sync = 0;
  fss.readFileSync = (f, ...a) => { if (String(f).includes('silinx-trust')) sync++; return read(f, ...a); };
  let pj;
  try { pj = await P.readProject(name); await P.writeProject(name, pj); } finally { fss.readFileSync = read; }
  assert.equal(sync, 0, 'read synchronously');
  assert.equal(pj.trusted, false);
  assert.equal(pj.madeBy, 'mcp');
  const text = JSON.parse(await fs.readFile(path.join(P.projectDir(name), 'silinx.json'), 'utf8'));
  assert.equal(text.trusted, undefined, 'the mark kept in .git, not in silinx.json');
});

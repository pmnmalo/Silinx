// The project lock across processes (#4726, server/project-lock.js): two processes changing one project's silinx.json
// at once (the server and the MCP server, `silinx mcp`) keep both's changes; a lock left by a process that died is
// taken over, one a live process holds is waited for, and one held too long gives a 503 that says so; the locks are
// kept outside the workspace (a repository, a synced folder), one folder per workspace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratchEnv } from './server-helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-project-lock-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');
const L = await import('../server/project-lock.js');

async function newProject(name) {
  const dir = path.join(process.env.SILINX_WORKSPACE, name);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'silinx.json'), JSON.stringify({ name, device: 'xc3s100e-cp132', top: null, files: [] }));
}

// a process that adds `n` entries to the project's files, one read-modify-write each (as the MCP's write_file does)
function adder(name, tag, n) {
  const code = `const P = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server/projects.js')).href)});
    for (let i = 0; i < ${n}; i++) await P.updateProject(${JSON.stringify(name)}, async pj => {
      await new Promise(r => setTimeout(r, Math.random() * 3));   // (a read, then the write a little later)
      pj.files.push({ path: '${tag}' + i + '.vhd', lang: 'vhdl', role: 'design' });
    });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', d => { err += d; });
  return new Promise((resolve, reject) => child.on('exit', c => (c === 0 ? resolve() : reject(new Error(err)))));
}

test('two processes changing one project at once keep both\'s changes', async () => {
  await newProject('race');
  await Promise.all([adder('race', 'a', 25), adder('race', 'b', 25), (async () => {
    for (let i = 0; i < 25; i++) await P.updateProject('race', pj => { pj.files.push({ path: `c${i}.vhd`, lang: 'vhdl', role: 'design' }); });
  })()]);
  const files = (await P.readProject('race')).files.map(f => f.path);
  assert.equal(files.length, 75);
  for (const t of 'abc') for (let i = 0; i < 25; i++) assert.ok(files.includes(`${t}${i}.vhd`), `${t}${i}.vhd kept`);
  // (released: no lock left behind)
  assert.deepEqual(await fsp.readdir(L.locksDir(process.env.SILINX_WORKSPACE)), []);
});

test('the locks are kept outside the workspace, one folder per workspace whatever its spelling', async () => {
  const ws = process.env.SILINX_WORKSPACE, dir = L.locksDir(ws);
  assert.ok(dir.startsWith(path.join(os.tmpdir(), 'silinx-locks')));
  assert.ok(!dir.startsWith(ws));
  assert.equal(L.locksDir(ws + path.sep), dir);
  assert.notEqual(L.locksDir(path.join(tmp, 'other')), dir);
});

const lockPath = async name => {
  // the one file a held lock makes
  let file;
  await L.withFileLock(process.env.SILINX_WORKSPACE, name, async () => {
    const dir = L.locksDir(process.env.SILINX_WORKSPACE);
    file = path.join(dir, (await fsp.readdir(dir))[0]);
  });
  return file;
};

test('a lock left by a process that is no longer running is taken over at once', async () => {
  await newProject('dead');
  const file = await lockPath('dead');
  // a process that ran and ended: its pid is free
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise(r => child.on('exit', r));
  await fsp.writeFile(file, JSON.stringify({ pid: child.pid, host: os.hostname(), token: 'gone' }));
  const t0 = Date.now();
  await P.updateProject('dead', pj => { pj.top = 'x'; });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal((await P.readProject('dead')).top, 'x');
});

test('a lock not touched for its stale time is taken over; one touched is waited for, then a 503', async () => {
  await newProject('old');
  const file = await lockPath('old');
  // another machine's (its pid cannot be asked): its age decides
  await fsp.writeFile(file, JSON.stringify({ pid: 1, host: 'another-machine', token: 'x' }));
  const old = new Date(Date.now() - 60_000);
  await fsp.utimes(file, old, old);
  let ran = false;
  await L.withFileLock(process.env.SILINX_WORKSPACE, 'old', () => { ran = true; }, { stale: 1000, wait: 500 });
  assert.ok(ran);
  // a fresh one: waited for `wait` ms, then refused, and left as it is
  await fsp.writeFile(file, JSON.stringify({ pid: 1, host: 'another-machine', token: 'x' }));
  const t0 = Date.now();
  await assert.rejects(L.withFileLock(process.env.SILINX_WORKSPACE, 'old', () => {}, { stale: 10_000, wait: 300 }),
    e => e.status === 503 && /the project 'old' is busy \(another Silinx process holds it\)/.test(e.message));
  assert.ok(Date.now() - t0 >= 300);
  assert.equal(JSON.parse(await fsp.readFile(file, 'utf8')).token, 'x');
  // released by its holder: taken
  await fsp.rm(file);
  assert.equal(await L.withFileLock(process.env.SILINX_WORKSPACE, 'old', () => 42, { wait: 300 }), 42);
});

test('a holder touches its lock while it holds it, and removes only its own', async () => {
  await newProject('long');
  const file = await lockPath('long');
  let seen;
  await L.withFileLock(process.env.SILINX_WORKSPACE, 'long', async () => {
    const t0 = (await fsp.stat(file)).mtimeMs;
    await new Promise(r => setTimeout(r, 250));
    seen = (await fsp.stat(file)).mtimeMs > t0;
    // taken over meanwhile (as a dead holder's would be): the other's lock is not removed at the end
    await fsp.writeFile(file, JSON.stringify({ pid: 1, host: 'another-machine', token: 'theirs' }));
  }, { stale: 150 });
  assert.ok(seen, 'touched');
  assert.equal(JSON.parse(await fsp.readFile(file, 'utf8')).token, 'theirs');
  await fsp.rm(file);
});

test('an error inside the lock releases it, and same-process callers are still taken in turn', async () => {
  await newProject('err');
  await assert.rejects(P.updateProject('err', () => { throw new Error('boom'); }), /boom/);
  const order = [];
  await Promise.all([1, 2, 3].map(i => P.updateProject('err', async pj => { order.push(`in${i}`); await new Promise(r => setTimeout(r, 5)); pj.top = `t${i}`; order.push(`out${i}`); })));
  assert.deepEqual(order, ['in1', 'out1', 'in2', 'out2', 'in3', 'out3']);
  assert.equal((await P.readProject('err')).top, 't3');
});

// The server's own writes known by what it wrote (#4726, server/own-writes.js, server/project-watch.js): while a page's
// request holds the project, or a run of the server's, what the server wrote itself is not told to the page that asked
// (told to its other tabs, #3972), and what another process wrote meanwhile (the MCP server, an editor) is told to every
// page; a run's build summary is the run's; a request whose writes are not all recorded (git's, a merge's) keeps the
// old rule (every change its own). Also: a real `silinx mcp`-like process writing during a run reaches the page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createProjectWatcher } from '../server/project-watch.js';
import { noteWritten, noteRemoved, noteMoving, isOwnChange } from '../server/own-writes.js';
import { scratchEnv, sleep } from './server-helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp, P;
before(async () => { tmp = await scratchEnv('silinx-watch-own-'); P = await import('../server/projects.js'); });
after(() => fs.rm(tmp, { recursive: true, force: true }));
const tick = () => sleep(15);

async function setup(name, { busy = () => false } = {}) {
  assert.equal((await P.createProject({ name })).name, name);
  const dir = P.projectDir(name);
  await P.writeFile(name, 'src/top.vhd', 'entity top is end;\n');
  const w = createProjectWatcher({ dirOf: P.projectDir, busy, interval: 60_000 });
  const seen = { A: [], B: [] };
  for (const c of ['A', 'B']) w.subscribe(name, ev => seen[c].push(...ev.changes.map(x => `${x.kind} ${x.path}${ev.tab ? ' (tab)' : ''}`)), { client: c });
  await w.check(name);
  const look = async () => { seen.A.length = 0; seen.B.length = 0; await w.check(name); return { A: [...seen.A].sort(), B: [...seen.B].sort() }; };
  return { w, dir, look };
}

test('own-writes: a file written is its own while its text is the one written; a removed file or folder, its own deletion', async () => {
  const dir = path.join(tmp, 'ow');
  await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
  const f = path.join(dir, 'a.txt');
  noteWritten(f, 'one');
  await fs.writeFile(f, 'one');
  assert.equal(await isOwnChange(f, 'created'), true);
  assert.equal(await isOwnChange(f, 'changed'), true);
  await fs.writeFile(f, 'two');   // (another process, after it)
  assert.equal(await isOwnChange(f, 'changed'), false);
  assert.equal(await isOwnChange(f, 'deleted'), false, 'a file written, not removed: its deletion is another\'s');
  assert.equal(await isOwnChange(path.join(dir, 'never.txt'), 'created'), false);
  noteRemoved(path.join(dir, 'sub'));
  assert.equal(await isOwnChange(path.join(dir, 'sub', 'deep', 'x.txt'), 'deleted'), true, 'below a removed folder');
  assert.equal(await isOwnChange(path.join(dir, 'other.txt'), 'deleted'), false);
  // a move: the new path written with the old one's text, the old one removed; its case only, the new one kept
  await fs.writeFile(path.join(dir, 'm.txt'), 'moved');
  await noteMoving(path.join(dir, 'm.txt'), path.join(dir, 'n.txt'));
  await fs.rename(path.join(dir, 'm.txt'), path.join(dir, 'n.txt'));
  assert.equal(await isOwnChange(path.join(dir, 'n.txt'), 'created'), true);
  assert.equal(await isOwnChange(path.join(dir, 'm.txt'), 'deleted'), true);
  await noteMoving(path.join(dir, 'n.txt'), path.join(dir, 'N.txt'));
  await fs.rename(path.join(dir, 'n.txt'), path.join(dir, 'N.txt'));
  assert.equal(await isOwnChange(path.join(dir, 'N.txt'), 'created'), true);
  assert.equal(await isOwnChange(path.join(dir, 'N.txt'), 'changed'), true);
  if (process.platform === 'linux') assert.equal(await isOwnChange(path.join(dir, 'n.txt'), 'deleted'), true, 'a case-sensitive file system: two paths');
});

test('a page\'s request held (known): its own writes not told to it, told to its other tab; another process\'s told to both', async () => {
  const { w, dir, look } = await setup('Known');
  const release = w.hold('Known', 'A', { known: true });
  await P.writeFile('Known', 'src/own.vhd', 'entity own is end;\n');   // (the request's: recorded)
  await fs.writeFile(path.join(dir, 'src', 'mcp.vhd'), 'entity mcp is end;\n');   // (another process's)
  const got = await look();
  release();
  const after = await look();
  const all = { A: [...got.A, ...after.A].sort(), B: [...got.B, ...after.B].sort() };
  assert.deepEqual(all.A, ['created src/mcp.vhd']);
  assert.ok(all.B.includes('created src/mcp.vhd') && all.B.includes('created src/own.vhd (tab)'));
  assert.ok(all.B.some(x => /silinx\.json \(tab\)/.test(x)), 'the description the request changed: told to the other tab');
  // a file the request wrote, written again by another process before the look: told to the page that asked too
  const r2 = w.hold('Known', 'A', { known: true });
  await tick();
  await P.writeFile('Known', 'src/own.vhd', 'entity own is end entity;\n');
  await fs.writeFile(path.join(dir, 'src', 'own.vhd'), '-- the MCP server\'s\nentity own is end;\n');
  const g2 = await look(); r2(); const a2 = await look();
  assert.ok([...g2.A, ...a2.A].includes('changed src/own.vhd'));
  // deleted by the request (Delete File): not told to it; deleted by another process meanwhile: told
  const r3 = w.hold('Known', 'A', { known: true });
  await P.deleteFile('Known', 'src/own.vhd');
  await fs.rm(path.join(dir, 'src', 'mcp.vhd'));
  const g3 = await look(); r3(); const a3 = await look();
  assert.deepEqual([...g3.A, ...a3.A].filter(x => !/silinx\.json/.test(x)).sort(), ['deleted src/mcp.vhd']);
  // a rename of the request's: not told to it
  const r4 = w.hold('Known', 'A', { known: true });
  await P.renameFile('Known', 'src/top.vhd', 'src/toplevel.vhd');
  const g4 = await look(); r4(); const a4 = await look();
  assert.deepEqual([...g4.A, ...a4.A], []);
  w.close();
});

test('a request whose writes are not all recorded (git\'s, a merge\'s): every change while it holds the project its own, as before', async () => {
  const { w, dir, look } = await setup('Opaque');
  const release = w.hold('Opaque', 'A');
  await fs.writeFile(path.join(dir, 'src', 'pulled.vhd'), '--\n');
  const got = await look();
  release();
  const after = await look();
  assert.deepEqual([...got.A, ...after.A], []);
  w.close();
});

test('a run of the server\'s: its build summary its own; another process\'s source told to every page, the server\'s own not', async () => {
  const state = { busy: false };
  const { w, dir, look } = await setup('Running', { busy: () => state.busy });
  state.busy = true;
  await fs.mkdir(path.join(dir, 'build'), { recursive: true });
  await fs.writeFile(path.join(dir, 'build', 'reports.json'), '{}');
  await P.writeFile('Running', 'constraints/top.ucf', '# pins\n');   // (a run's update of the constraints: recorded)
  await fs.writeFile(path.join(dir, 'src', 'editor.vhd'), '-- an editor\'s\n');
  const got = await look();
  assert.deepEqual(got.A, ['created src/editor.vhd']);
  assert.deepEqual(got.B, ['created src/editor.vhd']);
  state.busy = false;
  assert.deepEqual((await look()).A, []);
  w.close();
});

test('#4726 another process (as `silinx mcp`) writing a source during a run: told to the page', async () => {
  const { w, look } = await setup('McpRun', { busy: () => true });
  const code = `const P = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server/projects.js')).href)});
    await P.writeFile('McpRun', 'src/mcp.vhd', 'entity mcp is end;\\n');`;
  await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', d => { err += d; });
    c.on('exit', k => (k === 0 ? resolve() : reject(new Error(err))));
  });
  const got = await look();
  assert.deepEqual(got.A, ['changed silinx.json', 'created src/mcp.vhd']);
  w.close();
});

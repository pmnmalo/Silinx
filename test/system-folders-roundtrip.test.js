// A System project's nodes as folders (#5488) through the ways a project leaves the workspace and comes back, by the
// MCP server's tools as the interface's: export_project and import_project (a zip round trip: the same files in the same
// node folders, the same System, checked as before); git_clone of a System project from a local bare repository (no
// network), a drawing of a node's folder committed and diffed by its objects; share_project and follow_project (the
// follower sees each node's files in its folder, and reads them: a MicroPython program too, #5551).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';
import { closable } from './server-close.js';
import { unlabelled } from './mcp-label.js';

let tmp, srv, base, closeSrv;
const G = await import('../server/git.js');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-system-roundtrip-'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
  fs.mkdirSync(process.env.SILINX_MCP_FOLDER, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  const { createApp, tokenFile } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'tok-sys' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  fs.mkdirSync(path.dirname(tokenFile(srv.address().port)), { recursive: true });
  fs.writeFileSync(tokenFile(srv.address().port), 'tok-sys');
});
after(async () => {
  G.GIT_TESTING.localRemotes = false;
  await (await import('../server/mcp-collab.js')).endCollab();
  await closeSrv();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const tree = async p => (await P.fileTree(p)).filter(f => f !== 'silinx.json' && f !== '.gitignore').sort();
const UA = ['fpga/debounce.vhd', 'fpga/sevenseg.vhd', 'fpga/uart.ucf', 'fpga/uart.vhd', 'fpga/uart_rx.vhd', 'fpga/uart_tx.vhd', 'uart_avr.sys.json', 'uno/hello.asm', 'uno/hello.hex'];
const WARN = "WARNING: serial: uno's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
const checked = async (project) => (await ok('check_system', { project, file: 'uart_avr.sys.json' })).text.split('\n').filter(l => /^(WARNING|ERROR)/.test(l));
const nodes = async (project) => (await ok('project_info', { project })).data.nodes.map(n => [n.id, n.folder, n.inFolder]);
const NODES = [['uno', 'uno', ['uno/hello.asm', 'uno/hello.hex']], ['fpga', 'fpga', ['fpga/debounce.vhd', 'fpga/sevenseg.vhd', 'fpga/uart.ucf', 'fpga/uart.vhd', 'fpga/uart_rx.vhd', 'fpga/uart_tx.vhd']]];

test('#5488 a System project exported as a zip and imported: its files in the same node folders, its System the same, checked as before', async () => {
  await ok('new_project_from_example', { name: 'ua', example: 'uart-avr' });
  await ok('export_project', { project: 'ua', kind: 'silinx', path: path.join(tmp, 'exchange', 'ua.zip') });
  await ok('import_project', { name: 'ub', from: path.join(tmp, 'exchange', 'ua.zip') });
  assert.deepEqual([await tree('ua'), await tree('ub')], [UA, UA]);
  assert.equal(await P.readFile('ub', 'uart_avr.sys.json'), await P.readFile('ua', 'uart_avr.sys.json'));
  assert.equal((await P.readProject('ub')).kind, 'system');
  assert.deepEqual(await nodes('ub'), NODES);
  assert.deepEqual(await checked('ub'), [WARN]);
});

test('#5488 a System project cloned from git: its node folders; a state diagram of a node\'s folder committed and diffed by its objects', async () => {
  const bare = path.join(tmp, 'ua.git'), seed = path.join(tmp, 'seed');
  fs.mkdirSync(bare);
  sh(bare, 'init', '--quiet', '--bare');
  sh(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  fs.cpSync(path.join(ROOT, 'examples', 'uart-avr'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', bare, 'HEAD:main');
  await ok('git_clone', { url: bare, name: 'uc' });
  assert.deepEqual(await tree('uc'), UA);
  assert.deepEqual(await nodes('uc'), NODES);
  assert.deepEqual(await checked('uc'), [WARN]);
  // a state diagram in the Arduino's folder, committed, then a state moved: diffed by its objects
  const FSM = 'uno/lock.fsm.json';
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'lock', 'src', 'lock.fsm.json'), 'utf8'));
  delete lock.generatedFile;
  await ok('write_file', { project: 'uc', path: FSM, text: `${JSON.stringify(lock, null, 2)}\n` });
  const c = await ok('git_commit', { project: 'uc', message: 'A lock' });
  assert.ok(c.text.split('\n').includes(`  ${FSM} (new)`), c.text);
  // (as committed: write_file linked it to the HDL it made)
  const kept = JSON.parse(await P.readFile('uc', FSM)), s0 = kept.states[0];
  await ok('write_file', { project: 'uc', path: FSM, text: `${JSON.stringify({ ...kept, states: [{ ...s0, x: s0.x + 20 }, ...kept.states.slice(1)] }, null, 2)}\n` });
  const d = await ok('git_diff', { project: 'uc', path: FSM });
  assert.deepEqual(d.text.split('\n'), [`${FSM}, the last commit to now: 1 change(s).`, `  moved states/${s0.id} (${s0.name})`]);
  assert.equal((await ok('git_status', { project: 'uc' })).text.split('\n').slice(1).join('\n'), `  ${FSM} (changed)`);
});

test('#5488 a System project shared and followed: the follower sees each node\'s files in its folder and reads them', async () => {
  const { data: { link } } = await ok('share_project', { project: 'ua', name: 'Ana', server: base });
  const f = await ok('follow_project', { link, name: 'Bot' });
  assert.deepEqual(f.data.files.filter(x => x !== 'silinx.json').sort(), UA);
  // (each node's text files read through the import gate, as the interface's follower reads them: the Arduino's program
  // too, an .asm a text file of the gate, #5535)
  for (const p of ['uno/hello.asm', 'uno/hello.hex', 'uart_avr.sys.json', 'fpga/uart.vhd']) assert.equal((await ok('follow_project', { link, path: p })).data.text, await P.readFile('ua', p), p);
  assert.equal((await ok('follow_project', { link, stop: true })).text, 'Stopped following.');
  await ok('share_project', { project: 'ua', action: 'stop' });
});

test('#5551 a MicroPython program (.py) of a node\'s folder followed: read through the import gate as the owner has it', async () => {
  await ok('new_project_from_example', { name: 'up', example: 'uart-avr' });
  const PY = '# blink\nfrom machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)\n';
  await P.writeFile('up', 'esp/main.py', PY);
  const { data: { link } } = await ok('share_project', { project: 'up', name: 'Ana', server: base });
  const f = await ok('follow_project', { link, name: 'Bot' });
  assert.ok(f.data.files.includes('esp/main.py'), f.data.files.join(', '));
  assert.equal((await ok('follow_project', { link, path: 'esp/main.py' })).data.text, PY);
  assert.equal((await ok('follow_project', { link, stop: true })).text, 'Stopped following.');
  await ok('share_project', { project: 'up', action: 'stop' });
});

// A project's last back-up and where it is stored (#4971): project_info reports them (stored: its folder on the disk;
// lastBackup: null until a back-up is recorded); export_project as a Silinx project records one (as a Xilinx ISE project:
// none), as does Export Project (.zip)…'s route (?kind=silinx&backup=1; a copy for a link, without backup=1: none); a
// project renamed takes its record along, one deleted loses it; the records are in the configuration folder
// (server/backup-store.js: backups.json, written only when it changes). git_push's: test/mcp-git.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, app;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-backup-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
  app = await startApp();
});
after(async () => { await app?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const info = async (project) => (await ok('project_info', { project }));
const out = (f) => path.join(tmp, 'exchange', f);
const backups = () => path.join(process.env.SILINX_CONFIG_DIR, 'backups.json');
const recent = (b, how) => { assert.equal(b?.how, how); assert.ok(Math.abs(Date.parse(b.at) - Date.now()) < 60000, b.at); };

test('project_info: where the project is stored and its last back-up; export_project as a Silinx project records one', async () => {
  await ok('new_project_from_example', { name: 'blinky', example: 'blinky' });
  const before = await info('blinky');
  assert.deepEqual(before.data.stored, { kind: 'folder', folder: '<workspace>/blinky' });   // (the workspace's path never in a result, #3418)
  assert.equal(before.data.lastBackup, null);
  assert.equal(before.text.split('\n').at(-1), '  stored in the folder <workspace>/blinky on the disk; last back-up: none recorded');
  assert.equal(fs.existsSync(backups()), false, 'nothing written before a back-up');
  // a Xilinx ISE project: not a back-up of the whole project
  await ok('export_project', { project: 'blinky', path: out('blinky.zip') });
  assert.equal((await info('blinky')).data.lastBackup, null);
  // a Silinx project: its back-up
  await ok('export_project', { project: 'blinky', kind: 'silinx', path: out('blinky-silinx.zip') });
  const after = await info('blinky');
  recent(after.data.lastBackup, 'export');
  assert.equal(after.text.split('\n').at(-1), `  stored in the folder <workspace>/blinky on the disk; last back-up: ${after.data.lastBackup.at}, exported (Export Project (.zip))`);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(backups(), 'utf8')).projects).length, 1);
});

test('a project renamed takes its last back-up along; one deleted loses it (a new one of its name has none)', async () => {
  await ok('new_project_from_example', { name: 'gates', example: 'gates' });
  await ok('export_project', { project: 'gates', kind: 'silinx', path: out('gates-silinx.zip') });
  const was = (await info('gates')).data.lastBackup;
  await ok('rename_project', { project: 'gates', to: 'gates2' });
  assert.deepEqual((await info('gates2')).data.lastBackup, was);
  await ok('delete_project', { project: 'gates2' });
  await ok('new_project_from_example', { name: 'gates2', example: 'gates' });
  assert.equal((await info('gates2')).data.lastBackup, null);
});

test('Export Project (.zip)…\'s route: a Silinx project with backup=1 recorded; a copy without it, or a Xilinx ISE project, not', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  assert.equal((await app.call('GET', '/projects/traffic/export.zip?kind=silinx&copy=1')).status, 200);
  assert.equal((await app.call('GET', '/projects/traffic/export.zip?kind=xilinx&copy=1&backup=1')).status, 200);
  assert.equal((await info('traffic')).data.lastBackup, null);
  assert.equal((await app.call('GET', '/projects/traffic/export.zip?kind=silinx&copy=1&backup=1')).status, 200);
  recent((await info('traffic')).data.lastBackup, 'export');
});

// The MCP's project files and exchange folder under a folder whose name the system spells otherwise (#5023): Windows's
// temporary folder is C:\Users\RUNNER~1\…, a short name the system's realpath expands and fs.realpathSync keeps, and a
// project's file was refused as hidden (the path from one to the other climbed through RUNNER~1). A case-insensitive
// disk shows the same: a folder Run~1 named run~1, which the system's realpath spells Run~1 (skipped elsewhere).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unlabelled } from './mcp-label.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-mcp-short-'));
fs.mkdirSync(path.join(tmp, 'Run~1', 'x'), { recursive: true });
const spelled = path.join(tmp, 'run~1');
const differs = fs.existsSync(spelled) && fs.realpathSync.native(spelled) !== fs.realpathSync(spelled);
process.env.SILINX_WORKSPACE = path.join(spelled, 'ws');
process.env.SILINX_MCP_FOLDER = path.join(spelled, 'x');
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
before(() => fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true }));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#5023 a project and the exchange folder under a folder the system spells otherwise: read, written, exported, imported; a hidden file still refused', { skip: !differs && 'the disk spells run~1 as it is named' }, async () => {
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  const text = (await ok('read_file', { project: 'b', path: 'src/speed_ctrl.asm.json' })).text;
  await ok('write_file', { project: 'b', path: 'src/speed_ctrl.asm.json', text });
  await ok('export_project', { project: 'b', path: 'b.zip' });
  assert.ok(fs.existsSync(path.join(tmp, 'Run~1', 'x', 'b.zip')));
  await ok('import_project', { from: 'b.zip', name: 'c' });
  assert.equal((await ok('project_info', { project: 'c' })).data.project, 'c');
  // (the hidden files as before: the project's, and the exchange folder's)
  assert.equal((await call('write_file', { project: 'b', path: '.env', text: 'x' })).text, "write_file: '.env': a hidden file or folder cannot be written");
  fs.writeFileSync(path.join(tmp, 'Run~1', 'x', '.secret.vhd'), '');
  assert.match((await call('import_source', { project: 'b', files: ['.secret.vhd'] })).text, /is a hidden file or folder \('\.secret\.vhd'\)/);
});

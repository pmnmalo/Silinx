// The project operations' transforms shared by the local server (server/projects.js) and the browser edition's stores
// (web/js/project-store.js), #4766: a new project's silinx.json and its text (core/project-defaults.js), a file or a folder
// renamed or deleted (core/project-entries.js renameEntries, deleteEntries); and the two stores doing the same to a
// project's silinx.json, where they differed: a source renamed to another HDL's name (.vhd to .vh), a GateMate's .ccf.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { DEFAULT_DEVICE, NEW_IMPL, newProjectJson, projectJsonText } from '../core/project-defaults.js';
import { renameEntries, deleteEntries } from '../core/project-entries.js';
import { folderStore, projectOps, emptyProjectJson, projectJsonText as storeText } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-project-ops-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');

test('#4766 newProjectJson: the default device, a board, the device\'s constraints format; a design project; not shared', () => {
  const a = newProjectJson('a');
  assert.deepEqual(a, { name: 'a', version: 2, profile: 'fpga', device: { ...DEFAULT_DEVICE }, board: null, top: '', simTop: '', files: [], constraints: 'constraints/top.ucf', stimuli: {}, impl: { ...NEW_IMPL } });
  a.device.part = 'x'; a.impl.optLevel = 9;
  assert.equal(DEFAULT_DEVICE.part, 'xc3s250e');
  assert.equal(NEW_IMPL.optLevel, 1);
  const ice = { family: 'ice40', part: 'up5k', package: 'sg48', speed: '' };
  assert.deepEqual([newProjectJson('i', { device: ice, board: 'icebreaker' }).constraints, newProjectJson('i', { device: ice, board: 'icebreaker' }).board], ['constraints/top.pcf', 'icebreaker']);
  const d = newProjectJson('d', { device: ice, board: 'icebreaker', kind: 'design' });
  assert.deepEqual([d.kind, d.profile, d.board, d.constraints, d.device], [undefined, 'logic', null, null, { ...DEFAULT_DEVICE }]);
  // (the browser store's names are core's)
  assert.equal(storeText, projectJsonText);
  assert.deepEqual(emptyProjectJson('e', { board: 'basys2-250' }), newProjectJson('e', { board: 'basys2-250' }));
});

test('#4766 projectJsonText: 2-space JSON, a final newline, the project\'s name, no fileTree', () => {
  assert.equal(projectJsonText('n', { name: 'old', version: 2, top: 't', fileTree: ['a'] }), '{\n  "name": "n",\n  "version": 2,\n  "top": "t"\n}\n');
  // (a description of before: in this Silinx's version, #5907)
  assert.equal(projectJsonText('n', { name: 'old', top: 't', kind: 'design' }), '{\n  "name": "n",\n  "top": "t",\n  "profile": "logic",\n  "files": [],\n  "version": 2\n}\n');
});

test('#4766 renameEntries: a file, a folder, an HDL language following the name, the constraints, the excluded, the languages', () => {
  const pj = () => ({ files: [{ path: 'src/a.vhd', lang: 'vhdl', role: 'design' }, { path: 'ip/x.v', lang: 'verilog', role: 'design' }, { path: 'ip/y.txt', lang: 'text', role: 'design' }],
    constraints: 'ip/top.ucf', excluded: ['ip/old.v', 'src/a.vhd.bak'], sourceLanguage: { 'src/a.vhd': 'vhdl-2008' } });
  assert.deepEqual(renameEntries(pj(), 'src/a.vhd', 'src/a.vh'), { files: [{ path: 'src/a.vh', lang: 'verilog', role: 'design' }, { path: 'ip/x.v', lang: 'verilog', role: 'design' }, { path: 'ip/y.txt', lang: 'text', role: 'design' }],
    constraints: 'ip/top.ucf', excluded: ['ip/old.v', 'src/a.vhd.bak'], sourceLanguage: { 'src/a.vh': 'vhdl-2008' } });
  const f = renameEntries(pj(), 'ip', 'lib/ip');
  assert.deepEqual([f.files.map(x => `${x.path}:${x.lang}`), f.constraints, f.excluded], [['src/a.vhd:vhdl', 'lib/ip/x.v:verilog', 'lib/ip/y.txt:text'], 'lib/ip/top.ucf', ['lib/ip/old.v', 'src/a.vhd.bak']]);
  // (a name that only starts like the folder's: not under it)
  assert.deepEqual(renameEntries({ files: [{ path: 'ipx/a.v', lang: 'verilog' }] }, 'ip', 'q').files, [{ path: 'ipx/a.v', lang: 'verilog' }]);
});

test('#4766 deleteEntries: a file, a folder, the constraints none, the excluded; false when nothing changed', () => {
  const pj = { files: [{ path: 'ip/x.v' }, { path: 'src/a.vhd' }], constraints: 'ip/top.ucf', excluded: ['ip/z', 'n.txt'] };
  assert.equal(deleteEntries(pj, 'ip'), true);
  assert.deepEqual(pj, { files: [{ path: 'src/a.vhd' }], constraints: null, excluded: ['n.txt'] });
  assert.equal(deleteEntries(pj, 'other.txt'), false);
});

test('#4766 the server and a workspace folder: a source renamed to another HDL\'s name, a folder renamed, a .ccf: the same silinx.json', async () => {
  const root = fakeDirectory('Silinx-projects'), store = folderStore(root), ops = projectOps(() => store, {});
  await ops.create({ name: 'Par' });
  await P.createProject({ name: 'Par' });
  const both = async (fn, sfn) => { await fn(); await sfn(); };
  for (const [f, t] of [['src/a.vhd', 'entity a is end;\n'], ['ip/x.v', 'module x; endmodule\n']]) await both(() => ops.writeFile('Par', f, t), () => P.writeFile('Par', f, t));
  await both(() => ops.renameFile('Par', 'src/a.vhd', 'src/a.vh'), () => P.renameFile('Par', 'src/a.vhd', 'src/a.vh'));
  await both(() => ops.renameFile('Par', 'ip', 'lib'), () => P.renameFile('Par', 'ip', 'lib'));
  await both(() => ops.deleteFile('Par', 'lib'), () => P.deleteFile('Par', 'lib'));
  const mine = (await dump(root))['Par/silinx.json'], server = fs.readFileSync(path.join(P.projectDir('Par'), 'silinx.json'), 'utf8');
  assert.equal(mine, server);
  assert.deepEqual(JSON.parse(server).files, [{ path: 'src/a.vh', lang: 'verilog', role: 'design' }]);
  // a GateMate's constraints file: a constraints file for the server too
  assert.equal(P.langOf('top.ccf'), 'ucf');
});

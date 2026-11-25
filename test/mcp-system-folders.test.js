// A System project's nodes as folders through the MCP server's edit_system (#5488, server/system-folders.js,
// core/system-layout.js): the uart-avr example's files in its nodes' folders; a node renamed renames its folder (its
// firmware's path and silinx.json's entries with it), a removed node's folder kept or moved to the trash
// (delete_folders); a folder that cannot be renamed writes nothing; ids and files that would leave a node's folder
// refused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-folders-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const tree = async p => (await P.fileTree(p)).filter(f => f !== 'silinx.json');
const doc = async p => JSON.parse(await P.readFile(p, 'uart_avr.sys.json'));
const edit = (project, edits, more = {}) => call('edit_system', { project, file: 'uart_avr.sys.json', edits, ...more });
const WARN = "serial: uno's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";

test('#5488 the uart-avr example: its System at the root, each node\'s files in its folder', async () => {
  await P.createProject({ name: 'ua', template: 'uart-avr' });
  assert.deepEqual(await tree('ua'), ['fpga/debounce.vhd', 'fpga/sevenseg.vhd', 'fpga/uart.ucf', 'fpga/uart.vhd', 'fpga/uart_rx.vhd', 'fpga/uart_tx.vhd', 'uart_avr.sys.json', 'uno/hello.asm', 'uno/hello.hex']);
  const s = await doc('ua');
  assert.deepEqual([s.version, s.nodes.map(n => [n.id, n.lang, n.firmware ?? n.module])], [2, [['uno', 'c', 'uno/hello.hex'], ['fpga', 'vhdl', 'uart']]]);
});

test('#5488 a node renamed: its folder renamed, its firmware\'s path and silinx.json\'s entries with it; checked as before', async () => {
  const r = await edit('ua', [{ action: 'change_node', node: 'uno', fields: { id: 'avr' } }, { action: 'change_node', node: 'fpga', fields: { id: 'board' } }]);
  assert.equal(r.isError, false, r.text);
  const warn = WARN.replace("uno's", "avr's").replace("fpga's", "board's");
  assert.deepEqual(r.text.split('\n'), ['change_node avr', 'change_node board', 'folder uno/ renamed avr/', 'folder fpga/ renamed board/',
    `WARNING: ${warn}`, 'Process "Check System" of uart_avr.sys.json completed successfully with 1 warning(s).']);
  assert.deepEqual(await tree('ua'), ['avr/hello.asm', 'avr/hello.hex', 'board/debounce.vhd', 'board/sevenseg.vhd', 'board/uart.ucf', 'board/uart.vhd', 'board/uart_rx.vhd', 'board/uart_tx.vhd', 'uart_avr.sys.json']);
  // (its constraints file's path too, #5581)
  assert.deepEqual((await doc('ua')).nodes.map(n => [n.id, n.firmware ?? n.module, n.constraints ?? null]), [['avr', 'avr/hello.hex', null], ['board', 'uart', 'board/uart.ucf']]);
  assert.deepEqual((await P.readProject('ua')).files.map(f => f.path).sort(), ['board/debounce.vhd', 'board/sevenseg.vhd', 'board/uart.vhd', 'board/uart_rx.vhd', 'board/uart_tx.vhd']);
  // (renamed back and forth in one call: nothing moved)
  const same = await edit('ua', [{ action: 'change_node', node: 'avr', fields: { id: 'x' } }, { action: 'change_node', node: 'x', fields: { id: 'avr' } }]);
  assert.deepEqual(same.text.split('\n').slice(0, 3), ['change_node x', 'change_node avr', `WARNING: ${warn}`]);
});

test('#5488 a folder that cannot be renamed (one of that name there): an error, nothing written', async () => {
  await ok('write_file', { project: 'ua', path: 'mcu/notes.txt', text: 'mine' });
  const before = await P.readFile('ua', 'uart_avr.sys.json');
  const r = await edit('ua', [{ action: 'change_node', node: 'avr', fields: { id: 'mcu' } }]);
  assert.deepEqual([r.isError, r.text], [true, "edit_system: 'mcu' already exists"]);
  assert.equal(await P.readFile('ua', 'uart_avr.sys.json'), before);
  assert.deepEqual((await tree('ua')).filter(f => /^(avr|mcu)\//.test(f)), ['avr/hello.asm', 'avr/hello.hex', 'mcu/notes.txt']);
});

test('#5488 a node removed: its folder kept and said, or moved to the trash (delete_folders)', async () => {
  const kept = await edit('ua', [{ action: 'remove_node', node: 'avr' }]);
  assert.equal(kept.isError, false, kept.text);
  assert.deepEqual(kept.text.split('\n').slice(0, 2), ['remove_node avr', 'folder avr/ of the removed node avr kept (delete_folders moves it to the trash)']);
  assert.ok((await tree('ua')).includes('avr/hello.hex'));
  await P.createProject({ name: 'ub', template: 'uart-avr' });
  const gone = await edit('ub', [{ action: 'remove_node', node: 'uno' }], { delete_folders: true });
  assert.equal(gone.isError, false, gone.text);
  const [, line] = gone.text.split('\n');
  assert.match(line, /^folder uno\/ moved to the trash \(\.trash\/ub-\d+\/uno\)$/);
  assert.deepEqual((await tree('ub')).filter(f => !f.startsWith('fpga/')), ['uart_avr.sys.json']);
  assert.ok(fs.existsSync(path.join(P.workspaceDir(), line.match(/\((.+)\)$/)[1], 'hello.hex')), 'in the trash, to be moved back by hand');
});

test('#5488 ids and files that would leave a node\'s folder refused, nothing written', async () => {
  const before = await P.readFile('ub', 'uart_avr.sys.json');
  const refused = async (e, why) => { const r = await edit('ub', [e]); assert.deepEqual([r.isError, r.text], [true, `edit_system: edit 0 (${e.action}): ${why} (nothing written)`]); };
  for (const bad of ['..', '../x', 'a/b', 'a\\b', '.git', '']) {
    await refused({ action: 'change_node', node: 'fpga', fields: { id: bad } }, `'${bad}' is not an id: a letter, then letters, digits and _`);
    await refused({ action: 'add_node', fields: { kind: 'mcu', id: bad } }, `'${bad}' is not an id: a letter, then letters, digits and _`);
  }
  await ok('edit_system', { project: 'ub', file: 'uart_avr.sys.json', edits: [{ action: 'add_node', fields: { kind: 'mcu', id: 'm' } }] });
  for (const fw of ['../../../etc/passwd', 'm/../fpga/uart.vhd', '/m/a.hex', 'fpga/uart.vhd', 'a.hex', 'M2/a.hex']) {
    await refused({ action: 'change_node', node: 'm', fields: { firmware: fw } }, `m: its firmware '${fw}' is not in its folder m/`);
  }
  await refused({ action: 'add_node', fields: { kind: 'circuit', id: 'c', circuit: 'c/../x.circ.json' } }, "c: its circuit 'c/../x.circ.json' is not in its folder c/");
  assert.notEqual(await P.readFile('ub', 'uart_avr.sys.json'), before, 'm added');
  assert.deepEqual((await doc('ub')).nodes.find(n => n.id === 'm').firmware, null);
});

test('#5488 the regs-avr example\'s FPGA node renamed: its register map\'s link to its HDL follows the folder', async () => {
  await P.createProject({ name: 'ra', template: 'regs-avr' });
  assert.equal(JSON.parse(await P.readFile('ra', 'fpga/pwm_regs.regs.json')).generatedFile, 'fpga/pwm_regs.vhd');
  const r = await call('edit_system', { project: 'ra', file: 'regs_avr.sys.json', edits: [{ action: 'change_node', node: 'fpga', fields: { id: 'pl' } }] });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.text.split('\n').slice(0, 2), ['change_node pl', 'folder fpga/ renamed pl/']);
  assert.equal(JSON.parse(await P.readFile('ra', 'pl/pwm_regs.regs.json')).generatedFile, 'pl/pwm_regs.vhd');
  assert.deepEqual((await ok('check_drawing', { project: 'ra', file: 'pl/pwm_regs.regs.json' })).isError, false);
});

test('#5488 new_source in a System project: the first FPGA node\'s folder, its base language; a location in a node\'s folder, that node\'s', async () => {
  await P.createProject({ name: 'ns', template: 'uart-avr' });
  const made = async (args) => (await ok('new_source', { project: 'ns', type: 'module', ...args })).data.path;
  assert.equal(await made({ name: 'blink' }), 'fpga/blink.vhd');
  await ok('edit_system', { project: 'ns', file: 'uart_avr.sys.json', edits: [{ action: 'change_node', node: 'fpga', fields: { lang: 'verilog' } }] });
  assert.equal(await made({ name: 'count' }), 'fpga/count.v');
  assert.equal(await made({ name: 'shift', location: 'fpga/sub' }), 'fpga/sub/shift.v');
  assert.equal(await made({ name: 'tb_count', type: 'test_bench', module: 'count' }), 'fpga/sim/tb_count.v');
  // (a folder of no node's, or a node with no HDL: the project's preferred language)
  assert.equal(await made({ name: 'misc', location: 'other' }), 'other/misc.vhd');
  assert.equal(await made({ name: 'glue', location: 'uno' }), 'uno/glue.vhd');
  assert.equal(await made({ name: 'mine', language: 'vhdl' }), 'fpga/mine.vhd');
});

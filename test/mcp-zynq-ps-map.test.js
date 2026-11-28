// A Zynq node's PS–PL register map (#4688, part 2b: core/zynq-ps-map.js): edit_system's change_node sets an FPGA node's
// `psMap` (an AXI4-Lite .regs.json of its folder), refused on a board with no PS, out of its folder or not a register map;
// check_system describes it and says a map missing or not on AXI4-Lite; the node's Implement builds the top Silinx writes
// (core/zynq-pl-top.js: the PS7, its M_AXI_GP0 on the map's slave, the module) in place of its module, in VHDL and in
// Verilog, with no error and no warning; the module's ports that do not meet the map's registers refuse it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { psMapError, psMapProblems, psMapSummary, psTopName } from '../core/zynq-ps-map.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-zynq-ps-map-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

// the student's module (zynq-pl-top's test's counter) and its map: enable written, count read, clear a strobe
const src = fs.readFileSync(path.join(ROOT, 'test/zynq-pl-top.test.js'), 'utf8');
const COUNTER = { vhdl: src.split('vhdl: `')[1].split('`, verilog')[0], verilog: src.split('verilog: `')[1].split('` };')[0] };
const MAP = { format: 'silinx-regmap', version: 1, name: 'cnt_regs', bus: 'axi', registers: [{ name: 'enable', addr: 0, width: 1, access: 'rw', reset: 0 },
  { name: 'count', addr: 4, width: 16, access: 'ro' }, { name: 'clear', addr: 8, width: 1, access: 'wo', strobe: true }] };
const LEDS = { 'led<0>': 'M14', 'led<1>': 'M15', 'led<2>': 'G14', 'led<3>': 'D18' };
const system = (lang, over = {}) => ({ format: 'silinx-system', version: 2, name: 'zynq', nodes: [
  { id: 'zybo', kind: 'fpga', module: 'counter', board: 'zybo-z7', variant: '20', lang, pins: LEDS, interfaces: [], ...over },
  { id: 'b2', kind: 'fpga', module: 'counter', board: 'basys2', variant: '250', lang, interfaces: [] },
], links: [] });

async function project(name, lang, over) {
  await P.createProject({ name, template: 'uart-avr' });
  const ext = lang === 'vhdl' ? 'vhd' : 'v';
  await ok('write_file', { project: name, path: `zybo/counter.${ext}`, text: COUNTER[lang] });
  await ok('write_file', { project: name, path: 'zybo/cnt_regs.regs.json', text: JSON.stringify(MAP, null, 2) });
  await ok('write_file', { project: name, path: 'uart_avr.sys.json', text: JSON.stringify(system(lang, over), null, 2) });
}

test('#4688 a node\'s PS–PL map: its place, its problems, its summary', () => {
  assert.equal(psTopName('counter'), 'counter_zynq');
  assert.equal(psMapError('zybo/cnt_regs.regs.json', 'zybo'), null);
  assert.equal(psMapError('b2/cnt_regs.regs.json', 'zybo'), 'its PS–PL register map b2/cnt_regs.regs.json is not in zybo/');
  assert.equal(psMapError('zybo/counter.vhd', 'zybo'), 'its PS–PL register map zybo/counter.vhd is not a register map (.regs.json)');
  const n = { id: 'zybo', kind: 'fpga', module: 'counter', board: 'zybo-z7', variant: '20', psMap: 'zybo/cnt_regs.regs.json' };
  assert.deepEqual(psMapProblems({ ...n, psMap: undefined }), []);
  assert.deepEqual(psMapProblems(n), []);
  assert.deepEqual(psMapProblems(n, [], {}), ['zybo: no register map zybo/cnt_regs.regs.json in the project']);
  assert.deepEqual(psMapProblems(n, [n.psMap], { [n.psMap]: JSON.stringify({ ...MAP, bus: 'spi' }) }), ['zybo: its PS–PL register map zybo/cnt_regs.regs.json is on SPI, not AXI4-Lite']);
  assert.deepEqual(psMapProblems({ ...n, board: 'basys2', variant: '250' }), ['zybo: the board basys2 has no processing system (its PS–PL register map zybo/cnt_regs.regs.json)']);
  assert.equal(psMapSummary(n), 'its PL built as counter_zynq: the PS7, its M_AXI_GP0 on the registers of zybo/cnt_regs.regs.json, and counter');
  assert.equal(psMapSummary({ ...n, psMap: undefined }), null);
});

test('#4688 edit_system: a Zynq node\'s psMap set and removed; refused on a board with no PS, out of its folder, not a map; check_system says it', async () => {
  await project('m', 'vhdl');
  const set = (node, psMap) => call('edit_system', { project: 'm', file: 'uart_avr.sys.json', edits: [{ action: 'change_node', node, fields: { psMap } }] });
  assert.equal((await set('b2', 'b2/x.regs.json')).text.includes('b2: the board basys2 has no processing system'), true);
  assert.match((await set('zybo', 'b2/x.regs.json')).text, /zybo: its PS–PL register map b2\/x\.regs\.json is not in zybo\//);
  assert.match((await set('zybo', 'zybo/counter.vhd')).text, /zybo: its PS–PL register map zybo\/counter\.vhd is not a register map \(\.regs\.json\)/);
  await ok('edit_system', { project: 'm', file: 'uart_avr.sys.json', edits: [{ action: 'change_node', node: 'zybo', fields: { psMap: 'zybo/cnt_regs.regs.json' } }] });
  assert.equal(JSON.parse((await ok('read_file', { project: 'm', path: 'uart_avr.sys.json' })).text).nodes[0].psMap, 'zybo/cnt_regs.regs.json');
  const c = await ok('check_system', { project: 'm', file: 'uart_avr.sys.json' });
  assert.match(c.text, /its PL built as counter_zynq: the PS7, its M_AXI_GP0 on the registers of zybo\/cnt_regs\.regs\.json, and counter/);
  assert.deepEqual(c.data.errors.filter((x) => /register map/.test(x.message)), []);
  // (the map on SPI: the check says it; deleted: missing)
  await ok('write_file', { project: 'm', path: 'zybo/cnt_regs.regs.json', text: JSON.stringify({ ...MAP, bus: 'spi', registers: MAP.registers.map((r, i) => ({ ...r, addr: i })) }) });
  assert.deepEqual((await ok('check_system', { project: 'm', file: 'uart_avr.sys.json' })).data.errors.filter((x) => /register map/.test(x.message)).map((x) => [x.message, x.item]),
    [['zybo: its PS–PL register map zybo/cnt_regs.regs.json is on SPI, not AXI4-Lite', 'zybo']]);
  await ok('delete_file', { project: 'm', path: 'zybo/cnt_regs.regs.json' });
  assert.deepEqual((await ok('check_system', { project: 'm', file: 'uart_avr.sys.json' })).data.errors.filter((x) => /register map/.test(x.message)).map((x) => x.message),
    ['zybo: no register map zybo/cnt_regs.regs.json in the project']);
  // (removed: '' none)
  await ok('edit_system', { project: 'm', file: 'uart_avr.sys.json', edits: [{ action: 'change_node', node: 'zybo', fields: { psMap: '' } }] });
  assert.equal(JSON.parse((await ok('read_file', { project: 'm', path: 'uart_avr.sys.json' })).text).nodes[0].psMap, undefined);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#4688 a Zynq node with its map synthesized in ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: its top Silinx's counter_zynq, written in its build folder; no error, no warning`, { timeout: 600000 }, async () => {
    const name = `s_${lang}`;
    await project(name, lang, { psMap: 'zybo/cnt_regs.regs.json' });
    const r = await call('run_process', { project: name, process: 'synthesize', node: 'zybo' });
    assert.equal(r.isError, false, r.text);
    assert.deepEqual([r.data.errors, r.data.warnings], [[], []]);
    const file = `zybo/counter_zynq.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    assert.ok(r.text.includes(`System node zybo: its PL's top counter_zynq (${file}), written by Silinx: the PS7, its M_AXI_GP0 on the registers of zybo/cnt_regs.regs.json, and counter.`), r.text);
    assert.match(fs.readFileSync(path.join(P.projectDir(name), 'build/nodes/zybo', file), 'utf8'), /PS7/);
    assert.equal(fs.existsSync(path.join(P.projectDir(name), file)), false, 'not written into the project');
  });
}

test('#4688 a Zynq node whose module does not meet its map: its Implement refused, the port said', { timeout: 600000 }, async () => {
  await project('bad', 'vhdl', { psMap: 'zybo/cnt_regs.regs.json' });
  await ok('write_file', { project: 'bad', path: 'zybo/cnt_regs.regs.json', text: JSON.stringify({ ...MAP, registers: [...MAP.registers, { name: 'limit', addr: 12, width: 8, access: 'rw', reset: 0 }] }) });
  const r = await call('run_process', { project: 'bad', process: 'synthesize', node: 'zybo' });
  assert.equal(r.isError, true);
  assert.match(r.text, /zybo: the module counter has no port limit for the register map cnt_regs's limit/);
});

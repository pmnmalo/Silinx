// The MCP server's symbol_info (server/mcp-symbol-info.js, #3935): a schematic symbol's datasheet as the Symbol Info
// dialog shows it (test/ui/symbolinfo.test.js: the same M4_1's pins, its compact truth table, its VHDL), by its palette,
// Xilinx library or computed name or its type, its parameters changing it, in Portuguese; a device primitive's resource on
// the project's device; a design and simulation project's without HDL, Xilinx equivalents, primitives (#3891); its errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-symbol-info-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
// a section's lines: from its title to the next blank line
const section = (text, title) => { const l = text.split('\n'); const i = l.indexOf(title); return i < 0 ? null : l.slice(i + 1, (l.indexOf('', i) + 1 || l.length + 1) - 1); };

let made = null;
// (the projects, made once, by the first test that needs them)
const setup = () => (made ||= (async () => { await ok('new_project', { name: 'fpga', board: 'basys2' }); await ok('new_project', { name: 'drawn', design_only: true }); })());

test('symbol_info M4_1: its pins, its compact truth table, its VHDL and Verilog, as the dialog', async () => {
  await setup();
  const r = await ok('symbol_info', { project: 'fpga', symbol: 'M4_1' });
  assert.equal(r.text.split('\n')[0], 'Symbol Info: M4_1   Category: Mux');
  assert.deepEqual(r.data.pins.map(p => `${p.name} ${p.dir} ${p.widthText} ${p.func}`), [
    'D0 in 1 Data input selected when S1 S0 = 00 (0)', 'D1 in 1 Data input selected when S1 S0 = 01 (1)', 'D2 in 1 Data input selected when S1 S0 = 10 (2)',
    'D3 in 1 Data input selected when S1 S0 = 11 (3)', 'S1 in 1 Select, most significant bit (weight 2)', 'S0 in 1 Select, least significant bit (weight 1)', 'O out 1 Output: the selected data input']);
  assert.match(r.text, /\n {2}D0 {3}input {6}1 {6}Data input selected when S1 S0 = 00 \(0\)\n/);
  // (the dialog's compact table: 8 rows, its second 0 0 1 X X X | 1)
  const tt = section(r.text, 'Truth table (compact):');
  assert.equal(tt.length, 9);
  assert.equal(tt[2].replace(/\s+/g, ' ').trim(), '0 0 1 X X X | 1');
  assert.equal(r.data.truthTable.compact.length, 8);
  assert.deepEqual(r.data.xilinx, []);   // (the library's M2_1 alone: no line, as the dialog's)
  assert.doesNotMatch(r.text, /Xilinx library equivalents/);
  assert.match(r.data.hdl.vhdl, /entity M4_1 is[\s\S]*O <= D0 when S1 = '0' and S0 = '0' else/);
  assert.match(r.data.hdl.verilog, /module M4_1/);
  assert.match(r.text, /\nEquivalent HDL \(VHDL\):\n[\s\S]*\nEquivalent HDL \(Verilog\):\n/);
});

test('symbol_info by its type, its parameters changing it; a flip-flop\'s mode table and Xilinx equivalent; in Portuguese', async () => {
  await setup();
  const w = await ok('symbol_info', { project: 'fpga', symbol: 'mux2', params: { width: 4 } });
  assert.deepEqual([w.data.symbol, w.data.params.find(p => p.name === 'width').value], ['M2_1', 4]);
  assert.equal(w.data.truthTable.perBit, true);
  const ff = await ok('symbol_info', { project: 'fpga', symbol: 'FDCE' });
  assert.deepEqual(section(ff.text, 'Mode table:').slice(0, 5).map(l => l.replace(/\s+/g, ' ').trim()), ['CLR CE D C | Q', '1 X X X | 0', '0 0 X X | No change', '0 1 0 ↑ | 0', '0 1 1 ↑ | 1']);
  assert.equal(ff.data.truthTable, null);
  assert.match(ff.text, /\nXilinx library equivalents: FDCE\n/);
  const pt = await ok('symbol_info', { project: 'fpga', symbol: 'FDCE', interface_language: 'pt' });
  assert.equal(pt.text.split('\n')[0], 'Informação do Símbolo: FDCE   Categoria: Flip-Flops');
  assert.ok(pt.text.includes('\nPinos:\n') && pt.text.includes('\nHDL equivalente (VHDL):\n'), pt.text);
});

test('symbol_info in a design project: no HDL, no Xilinx equivalents, no device primitive nor HDL BLOCK', async () => {
  await setup();
  const r = await ok('symbol_info', { project: 'drawn', symbol: 'M4_1' });
  assert.doesNotMatch(r.text, /HDL|VHDL|Verilog|Xilinx/);
  assert.equal(r.data.truthTable.compact.length, 8);
  assert.ok(!('hdl' in r.data) && !('xilinx' in r.data), JSON.stringify(Object.keys(r.data)));
  for (const s of ['hdlblock', 'bufgmux']) await fails('symbol_info', { project: 'drawn', symbol: s }, `${s}: not a symbol of a design and simulation project (no FPGA)`);
});

test('symbol_info: a device primitive\'s resource on the project\'s device; its errors', async () => {
  await setup();
  const p = await ok('symbol_info', { project: 'fpga', symbol: 'bufgmux' });
  assert.ok(p.data.resource && p.text.includes('on this device (XC3S250E)'), p.text);
  await fails('symbol_info', { project: 'fpga', symbol: 'NOPE' }, 'no symbol \'NOPE\' in the palette nor a module \'NOPE\' in the project');
  await fails('symbol_info', { project: 'fpga', symbol: 'M4_1', interface_language: 'fr' }, 'interface_language: one of en, pt');
  await fails('symbol_info', { project: 'fpga', symbol: 'M4_1', params: [] }, 'params: an object');
  await fails('symbol_info', { project: 'fpga', symbol: '' }, 'symbol: a symbol\'s name (M4_1, FDCE, AND2…)');
  await fails('symbol_info', { project: 'nothing', symbol: 'M4_1' }, 'no project \'nothing\' in the workspace');
});

// #4807: a symbol built of others (core/symlib.js): its composition's levels in symbol_info, each level's drawing by
// symbol_composition (the schematic it is, its modules the level below), in a design project too; its errors
test('symbol_info ADD8: its composition\'s levels; symbol_composition draws each, down to the gates', async () => {
  await setup();
  const r = await ok('symbol_info', { project: 'fpga', symbol: 'ADD8', params: { cin: true, cout: true } });
  assert.deepEqual(section(r.text, 'Composition:'), ['  ADD8 = 2 × ADD4', '  ADD4 = 4 × FA1', '  FA1 = 2 × XOR2 + 2 × AND2 + OR2']);
  assert.deepEqual(r.data.composition, { top: 'ADD8', levels: [
    { module: 'ADD8', parts: [{ name: 'ADD4', count: 2, module: true }] }, { module: 'ADD4', parts: [{ name: 'FA1', count: 4, module: true }] },
    { module: 'FA1', parts: [{ name: 'XOR2', count: 2, module: false }, { name: 'AND2', count: 2, module: false }, { name: 'OR2', count: 1, module: false }] }] });
  const pt = await ok('symbol_info', { project: 'drawn', symbol: 'sub', params: { width: 4 }, interface_language: 'pt' });
  assert.deepEqual(section(pt.text, 'Composição:'), ['  SUB4_NOBI_NOBO = ADD4 + INV + VCC', '  ADD4 = 4 × FA1', '  FA1 = 2 × XOR2 + 2 × AND2 + OR2'], 'a design project\'s, in Portuguese');
  // (#4809: the multiplexers too; a flip-flop has none)
  const m4 = await ok('symbol_info', { project: 'fpga', symbol: 'M4_1' });
  assert.deepEqual(section(m4.text, 'Composition:'), ['  M4_1 = 3 × M2_1', '  M2_1 = 2 × AND2 + INV + OR2']);
  const ff = await ok('symbol_info', { project: 'fpga', symbol: 'FDCE' });
  assert.equal(ff.data.composition, null, 'none');
  assert.doesNotMatch(ff.text, /Composition/);
  // the top, then a level below, by its name
  const top = await ok('symbol_composition', { project: 'fpga', symbol: 'ADD8', params: { cin: true, cout: true } });
  assert.deepEqual(top.text.split('\n').slice(0, 2), ['ADD8: ADD8 = 2 × ADD4', 'ADD8\'s drawing (a schematic, read-only; its modules: ADD4):']);
  assert.deepEqual([top.data.module, top.data.levels, top.data.ports.map(q => `${q.name}:${q.dir}:${q.width}:${q.side}`)], ['ADD8', ['ADD8', 'ADD4', 'FA1'], ['A:in:8:W', 'B:in:8:W', 'S:out:8:E', 'CI:in:1:S', 'CO:out:1:N']]);
  assert.deepEqual(top.data.doc.symbols.map(s => `${s.name} ${s.params.module}`), ['U1 ADD4', 'U0 ADD4']);
  assert.deepEqual(JSON.parse(top.text.split('\n').slice(2).join('\n')), top.data.doc, 'the drawing, as read_file returns a schematic');
  const fa = await ok('symbol_composition', { project: 'drawn', symbol: 'add', params: { width: 8, cin: true, cout: true }, module: 'fa1' });
  assert.deepEqual(fa.text.split('\n').slice(0, 2), ['ADD8: FA1 = 2 × XOR2 + 2 × AND2 + OR2 (a level of ADD8)', 'FA1\'s drawing (a schematic, read-only; its modules: none, gates only):']);
  assert.deepEqual(fa.data.doc.symbols.map(s => s.type).sort(), ['and2', 'and2', 'or2', 'xor2', 'xor2']);
  await fails('symbol_composition', { project: 'fpga', symbol: 'ADD8', module: 'ADD16' }, 'no level \'ADD16\' in the composition of ADD8: one of ADD8, ADD4, FA1');
  await fails('symbol_composition', { project: 'fpga', symbol: 'FDCE' }, 'FDCE: no composition (a symbol of the palette drawn as it is; the adders, subtractors, comparators, multiplexers, decoders, demultiplexers and encoders have one)');
  await fails('symbol_composition', { project: 'fpga', symbol: 'NOPE' }, 'no symbol \'NOPE\' in the palette');
});

// #4808: a level by its path of instances, as the schematic editor's Push into reaches it; with the symbol's inputs, its
// values as a Try it of the symbol pushed into shows them (the levels above simulated with the symbol's)
test('symbol_composition: a level by its path; with inputs, its values; their errors', async () => {
  await setup();
  const add8 = { project: 'fpga', symbol: 'add', params: { width: 8, cin: true, cout: true } };
  const top = await ok('symbol_composition', { ...add8, inputs: { A: '0x5F', B: 33, CI: 1 } });
  assert.deepEqual([top.data.module, top.data.path, top.data.values], ['ADD8', [], { A: '95', B: '33', S: '129', CI: '1', CO: '0' }]);
  assert.equal(top.text.split('\n')[2], 'Values (A = 95, B = 33, S = 129, CI = 1, CO = 0): the symbol\'s.');
  // U1, bits 7:4: A = 5, B = 2, the carry of F + 1 + 1; its FA1 U2 (bit 6): 1 + 0 + the carry of bits 5:0 (1F + 21 + 1)
  const u1 = await ok('symbol_composition', { ...add8, path: ['U1'], inputs: { A: 0x5f, B: 0x21, CI: 1 } });
  assert.deepEqual([u1.data.module, u1.data.path, u1.data.values], ['ADD4', ['U1'], { A: '5', B: '2', S: '8', CI: '1', CO: '0' }]);
  assert.equal(u1.text.split('\n')[0], 'ADD8: ADD4 = 4 × FA1 (a level of ADD8: U1)');
  const fa = await ok('symbol_composition', { ...add8, path: ['u1', 'U2'], inputs: { A: 0x5f, B: 0x21, CI: 1 } });
  assert.deepEqual([fa.data.module, fa.data.values], ['FA1', { A: '1', B: '0', CI: '1', S: '0', CO: '1' }]);
  const sub = await ok('symbol_composition', { project: 'fpga', symbol: 'sub', params: { width: 8, bin: true, bout: true }, path: ['U0'], inputs: { A: 5, B: 9, BI: 0 } });
  assert.deepEqual(sub.data.values, { A: '5', B: '246', S: '252', CI: '1', CO: '0' }, 'its adder: A + not B + 1, 5 − 9 = 252 with a borrow');
  const half = await ok('symbol_composition', { ...add8, inputs: { A: 1 } });
  assert.deepEqual(half.data.values, { A: '1', B: '0', S: '1', CI: '0', CO: '0' }, 'the inputs left out: 0, as a Try it starts');
  await fails('symbol_composition', { ...add8, path: ['U7'] }, 'path: no instance \'U7\' in ADD8: one of U1, U0');
  await fails('symbol_composition', { ...add8, path: ['U1', 'U0', 'X'] }, 'path: no instance \'X\' in FA1: one of none (gates only)');
  await fails('symbol_composition', { ...add8, inputs: { Q: 1 } }, 'inputs: no input pin \'Q\' (A, B, CI)');
  await fails('symbol_composition', { ...add8, inputs: { A: 256 } }, 'inputs: A: 256 does not fit in its 8 bit(s)');
  await fails('symbol_composition', { ...add8, inputs: { B: 'ten' } }, 'inputs: B: \'ten\' is not a number');
  await fails('symbol_composition', { ...add8, module: 'FA1', inputs: { A: 1 } }, 'inputs: the level by its path (["U1", …]), so that its instance is known');
  await fails('symbol_composition', { ...add8, module: 'FA1', path: ['U1'] }, 'module FA1 is not the path\'s level, ADD4');
});

// #4809: a multiplexer's and an encoder's levels, their values from the symbol's inputs as for an adder
test('symbol_composition M8_1 and PENC8_3: a level by its path, its values', async () => {
  await setup();
  const m8 = await ok('symbol_composition', { project: 'fpga', symbol: 'mux8', params: { width: 1 }, path: ['U1'], inputs: { D5: 1, S0: 1, S2: 1 } });
  assert.deepEqual([m8.data.module, m8.data.values], ['M4_1', { D0: '0', D1: '1', D2: '0', D3: '0', S0: '1', S1: '0', O: '1' }], 'S = 5: the upper M4_1\'s D1, D5');
  assert.equal(m8.text.split('\n')[0], 'M8_1: M4_1 = 3 × M2_1 (a level of M8_1: U1)');
  // a priority encoder, I1 and I6 at 1: its upper PENC4_2 says 2 (I6), V = 1
  const enc = await ok('symbol_composition', { project: 'fpga', symbol: 'encoder', params: { n: 3, mode: 'priority' }, path: ['U1'], inputs: { I1: 1, I6: 1 } });
  assert.deepEqual([enc.data.module, enc.data.values], ['PENC4_2', { I0: '0', I1: '0', I2: '1', I3: '0', A0: '0', A1: '1', V: '1' }]);
  const top = await ok('symbol_composition', { project: 'fpga', symbol: 'encoder', params: { n: 3, mode: 'priority' }, inputs: { I1: 1, I6: 1 } });
  assert.deepEqual(top.data.values, { I0: '0', I1: '1', I2: '0', I3: '0', I4: '0', I5: '0', I6: '1', I7: '0', A0: '0', A1: '1', A2: '1', V: '1' }, 'A = 6');
});

// #4810: a signed comparator: its subtractor takes the operands with their sign bits inverted (−128 < 1)
test('symbol_composition COMP8 signed: its SUB8\'s operands, the sign bits inverted; LT', async () => {
  await setup();
  const p = { project: 'fpga', symbol: 'compare', params: { width: 8, op: 'lt', signed: true }, inputs: { A: '0x80', B: 1 } };
  const top = await ok('symbol_composition', p);
  assert.deepEqual([top.data.module, top.data.values], ['COMP8_LT_S', { A: '128', B: '1', O: '1' }]);
  const sub = await ok('symbol_composition', { ...p, path: ['U1'] });
  assert.deepEqual([sub.data.module, sub.data.values], ['SUB8_NOBI', { A: '0', B: '129', D: '127', BO: '1' }], '0x00 − 0x81: a borrow');
});

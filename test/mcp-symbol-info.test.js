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
  const m4 = await ok('symbol_info', { project: 'fpga', symbol: 'M4_1' });
  assert.equal(m4.data.composition, null, 'none yet');
  assert.doesNotMatch(m4.text, /Composition/);
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
  await fails('symbol_composition', { project: 'fpga', symbol: 'M4_1' }, 'M4_1: no composition (a symbol of the palette drawn as it is; the adders and subtractors have one)');
  await fails('symbol_composition', { project: 'fpga', symbol: 'NOPE' }, 'no symbol \'NOPE\' in the palette');
});

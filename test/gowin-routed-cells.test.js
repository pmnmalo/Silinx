// The Gowin's routed design as Silinx's models take it (#4362: core/gowin-routed.js): nextpnr-himbaechel-gowin's vector pins a
// pin a bit gathered again, its SP and DP the block RAMs synth_gowin wrote (SPX9, DPB, DPX9B by their width), its pins the
// models have not left out; a routed block RAM and multiplier then simulate as the synthesized ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gowinRoutedCells } from '../core/gowin-routed.js';
import { routedVerilog } from '../core/netlist-verilog.js';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const bin = (n, w = 32) => n.toString(2).padStart(w, '0');
// a routed module: its ports (name -> [direction, bits]), its cells (name -> { type, parameters, connections, port_directions })
const routed = (ports, cells) => ({ modules: { top: { attributes: { top: '00000000000000000000000000000001' },
  ports: Object.fromEntries(Object.entries(ports).map(([k, [direction, bits]]) => [k, { direction, bits }])), cells,
  netnames: Object.fromEntries(Object.entries(ports).map(([k, [, bits]]) => [k, { bits }])) } } });
const cellOf = (json, name) => JSON.parse(gowinRoutedCells(JSON.stringify(json))).modules.top.cells[name];
const pins = (prefix, bits, dir) => Object.fromEntries(bits.map((b, i) => [`${prefix}${i}`, b === undefined ? [] : [b]]).map(([k, v]) => [k, v]));
const dirs = (prefix, n, dir) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, dir]));

test('#4362 gowinRoutedCells: a multiplier\'s pins a bit gathered into its vectors (an open input bit unknown, an open output bit a net of its own, a vector with none open), its pins as they are', () => {
  const a = [2, 3, 4], dout = [10, 11];
  const m = cellOf(routed({ x: ['input', a], y: ['output', dout] }, { mul: { type: 'MULT18X18', parameters: {}, port_directions: { ...dirs('A', 18, 'input'), ...dirs('SIA', 18, 'input'), ...dirs('DOUT', 36, 'output'), CE: 'input' },
    connections: { ...pins('A', a), ...pins('SIA', Array(18).fill(undefined)), ...pins('DOUT', dout), CE: ['1'] } } }), 'mul');
  assert.deepEqual(Object.keys(m.connections).sort(), ['A', 'CE', 'DOUT']);
  assert.deepEqual(m.connections.A, [2, 3, 4, ...Array(15).fill('x')]);
  assert.deepEqual(m.connections.DOUT.slice(0, 2), [10, 11]);
  assert.equal(new Set(m.connections.DOUT.slice(2)).size, 34, 'the open output bits each a net of its own');
  assert.ok(m.connections.DOUT.slice(2).every((b) => typeof b === 'number' && b > 11), 'nets not the design\'s');
  assert.deepEqual([m.port_directions.A, m.port_directions.DOUT, m.port_directions.CE], ['input', 'output', 'input']);
});

test('#4362 gowinRoutedCells: SP and DP the synthesis\'s SP / SPX9 and DPB / DPX9B by their width; the SP\'s port B, the RAM16SDP\'s CE and an OBUF\'s BOTTOM_IO_PORT_A / B left out; the other cells as they are', () => {
  const sp = (w) => ({ type: 'SP', parameters: { BIT_WIDTH: bin(w) }, port_directions: { ...dirs('AD', 14, 'input'), ...dirs('ADB', 14, 'input'), CLK: 'input', CLKB: 'input', ...dirs('DO', 36, 'output') },
    connections: { ...pins('AD', Array(14).fill(2)), ...pins('ADB', Array(14).fill(2)), CLK: [3], CLKB: [3], ...pins('DO', [4, 5]) } });
  const dp = (w) => ({ type: 'DP', parameters: { BIT_WIDTH_0: bin(w), BIT_WIDTH_1: bin(w) }, port_directions: { CLKA: 'input' }, connections: { CLKA: [3] } });
  const json = routed({ a: ['input', [2]], c: ['input', [3]], d: ['output', [4, 5]] }, { s32: sp(32), s36: sp(36), s9: sp(9), d16: dp(16), d18: dp(18),
    r: { type: 'RAM16SDP4', parameters: {}, port_directions: { CE: 'input', CLK: 'input' }, connections: { CE: ['1'], CLK: [3] } },
    o: { type: 'OBUF', parameters: { NET_I: 'NET' }, port_directions: { I: 'input', O: 'output', BOTTOM_IO_PORT_A: 'input', BOTTOM_IO_PORT_B: 'input' }, connections: { I: [2], O: [4], BOTTOM_IO_PORT_A: ['0'], BOTTOM_IO_PORT_B: ['0'] } },
    l: { type: 'LUT2', parameters: { INIT: '1000' }, port_directions: { I0: 'input', F: 'output' }, connections: { I0: [2], F: [5] } },
    u: { type: 'NOT_A_GOWIN_CELL', parameters: {}, port_directions: { X: 'input' }, connections: { X: [2] } } });
  const out = JSON.parse(gowinRoutedCells(JSON.stringify(json))).modules.top.cells;
  assert.deepEqual(['s32', 's36', 's9', 'd16', 'd18'].map((k) => out[k].type), ['SP', 'SPX9', 'SPX9', 'DPB', 'DPX9B']);
  assert.deepEqual(Object.keys(out.s32.connections).sort(), ['AD', 'CLK', 'DO']);
  assert.deepEqual([out.s32.connections.DO.length, out.s36.connections.DO.length], [32, 36]);
  assert.deepEqual(out.r.connections, { CLK: [3] });
  assert.deepEqual(out.o.connections, { I: [2], O: [4] });
  assert.deepEqual([out.o.parameters, out.l, out.u], [{ NET_I: 'NET' }, json.modules.top.cells.l, json.modules.top.cells.u]);
});

test('#4362 a routed SPX9 and MULT18X18 (a pin a bit) gathered again simulate as their models: the contents read at their address, the product', async () => {
  // (a block RAM of 36 bits a word, its word 1 read; a multiplier of 3 x 5, its other bits open)
  const init = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`INIT_RAM_${i.toString(16).toUpperCase().padStart(2, '0')}`, '0'.repeat(288)]));
  init.INIT_RAM_00 = '0'.repeat(288 - 72) + '1'.repeat(4) + '0'.repeat(32) + '0'.repeat(36);
  const ad = Array.from({ length: 14 }, (_, i) => (i === 5 ? '1' : '0'));
  const json = routed({ clk: ['input', [2]], q: ['output', [10, 11, 12, 13]], p: ['output', [20, 21, 22, 23]] }, {
    ram: { type: 'SP', parameters: { BIT_WIDTH: bin(36), BLK_SEL: '000', READ_MODE: '0', WRITE_MODE: bin(0), RESET_MODE: 'SYNC', ...init },
      port_directions: { ...dirs('AD', 14, 'input'), ...dirs('ADB', 14, 'input'), CLK: 'input', CE: 'input', OCE: 'input', RESET: 'input', WRE: 'input', ...dirs('DO', 36, 'output') },
      connections: { ...pins('AD', ad), ...pins('ADB', ad), CLK: [2], CE: ['1'], OCE: ['1'], RESET: ['0'], WRE: ['0'], ...pins('DO', Array(32).fill(undefined).concat([10, 11, 12, 13])) } },
    mul: { type: 'MULT18X18', parameters: {}, port_directions: { ...dirs('A', 18, 'input'), ...dirs('B', 18, 'input'), ...dirs('DOUT', 36, 'output') },
      connections: { ...pins('A', ['1', '1', ...Array(16).fill('0')]), ...pins('B', ['1', '0', '1', ...Array(15).fill('0')]), ...pins('DOUT', [20, 21, 22, 23]) } } });
  const net = { path: 'r.v', lang: 'verilog', text: await routedVerilog(gowinRoutedCells(JSON.stringify(json)), yosysNode, 'r') };
  const tb = { path: 'tb.v', lang: 'verilog', text: 'module tb; reg clk = 0; wire [3:0] q, p; r u (.clk(clk), .q(q), .p(p));\n  initial begin #5 clk = 1; #5 $display("%b %b", q, p); end\nendmodule\n' };
  const r = simulate([...primitiveSources([net]), net, tb], 'tb', { until: 20000 });
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => d.message), []);
  assert.deepEqual(r.sim.log.map((e) => e.text), ['1111 1111']);
});

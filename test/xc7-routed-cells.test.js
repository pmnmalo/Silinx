// The 7-series' routed design as Silinx's UNISIM models take it (#4362: core/xc7-routed.js): nextpnr-himbaechel-xilinx's sites'
// cells made the cells synthesis wrote again (X_ORIG_TYPE, X_ORIG_PORT_<pin>): the site pins of a bit gathered into the cell's
// vectors, the constants' cells their nets' values, the inversions of a constant folded, a carry chain's head's CYINIT, a
// BUFGCTRL a BUFG, a RAMD32 a RAM32X1D; a routed LUT, carry chain and distributed RAM then simulate as the synthesized ones; a
// cell it cannot make a model's refused with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xc7RoutedCells, unisimModels } from '../core/xc7-routed.js';
import { routedVerilog } from '../core/netlist-verilog.js';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const bin = (n, w = 32) => n.toString(2).padStart(w, '0');
// a routed module: its ports (name -> [direction, bits]), its cells (name -> { type, parameters, attributes, connections,
// port_directions }); the constants' cells PSEUDO_VCC (net 90) and PSEUDO_GND (net 91)
const routed = (ports, cells) => ({ modules: { top: { attributes: { top: '00000000000000000000000000000001' },
  ports: Object.fromEntries(Object.entries(ports).map(([k, [direction, bits]]) => [k, { direction, bits }])),
  cells: { $PACKER_VCC_DRV: { type: 'PSEUDO_VCC', parameters: {}, attributes: {}, port_directions: { Y: 'output' }, connections: { Y: [90] } },
    $PACKER_GND_DRV: { type: 'PSEUDO_GND', parameters: {}, attributes: {}, port_directions: { Y: 'output' }, connections: { Y: [91] } }, ...cells },
  netnames: { ...Object.fromEntries(Object.entries(ports).map(([k, [, bits]]) => [k, { bits }])), vcc: { bits: [90] }, gnd: { bits: [91] } } } } });
// a site's cell: its type, the cell synthesis wrote, its pins ({ site pin: [cell pin, direction, bits] }), parameters, attributes
const site = (type, orig, pins, parameters = {}, attributes = {}) => ({ type, parameters,
  attributes: { X_ORIG_TYPE: orig, ...Object.fromEntries(Object.entries(pins).filter(([, [o]]) => o).map(([p, [o]]) => [`X_ORIG_PORT_${p}`, o])), ...attributes },
  port_directions: Object.fromEntries(Object.entries(pins).map(([p, [, d]]) => [p, d])), connections: Object.fromEntries(Object.entries(pins).map(([p, [, , b]]) => [p, b])) });
const cells = (json) => JSON.parse(xc7RoutedCells(JSON.stringify(json))).modules.top;
const run = async (json, tb) => {
  const net = { path: 'r.v', lang: 'verilog', text: await routedVerilog(xc7RoutedCells(JSON.stringify(json)), yosysNode, 'r') };
  const r = simulate([...primitiveSources([net]), net, { path: 'tb.v', lang: 'verilog', text: tb }], 'tb', { until: 200000 });
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => d.message), []);
  return r.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`);
};

test('#4362 unisimModels: the UNISIM models\' generics, ports (their widths) and the inputs with a default, from their VHDL', () => {
  const m = unisimModels();
  assert.deepEqual([...m.get('CARRY4').ports], [['CO', 4], ['O', 4], ['CI', 0], ['CYINIT', 0], ['DI', 4], ['S', 4]]);
  assert.deepEqual([...m.get('CARRY4').defaults].sort(), ['CI', 'CYINIT']);
  assert.deepEqual([...m.get('LUT2').generics], ['INIT']);
  assert.deepEqual([m.get('DSP48E1').ports.get('ALUMODE'), m.get('DSP48E1').generics.has('IS_ALUMODE_INVERTED'), m.get('RAM32X1D').ports.get('DPRA4')], [4, true, 0]);
});

test('#4362 xc7RoutedCells: a LUT\'s site pins its I pins (A6 tied high left out), its INIT its own 2^k bits; the constants\' nets their values, their cells and the pads left out', () => {
  const m = cells(routed({ a: ['input', [2]], b: ['input', [3]], y: ['output', [4]] }, {
    l: site('SLICE_LUTX', 'LUT2', { A3: ['I1', 'input', [3]], A5: ['I0', 'input', [2]], A6: [null, 'input', [90]], O6: ['O', 'output', [5]] }, { INIT: bin(6) }),
    ib: site('IOB33_INBUF_EN', 'IBUF', { PAD: ['I', 'input', [2]], OUT: ['O', 'output', [6]] }),
    pad: { type: 'PAD', parameters: {}, attributes: { X_ORIG_TYPE: 'PAD', X_ORIG_PORT_PAD: 'PAD' }, port_directions: { PAD: 'inout' }, connections: { PAD: [2] } },
  }));
  assert.deepEqual(Object.keys(m.cells), ['l', 'ib']);
  assert.deepEqual(m.cells.l, { type: 'LUT2', parameters: { INIT: '0110' }, attributes: m.cells.l.attributes,
    port_directions: { I1: 'input', I0: 'input', O: 'output' }, connections: { I1: [3], I0: [2], O: [5] } });
  assert.deepEqual([m.cells.ib.type, m.cells.ib.connections], ['IBUF', { I: [2], O: [6] }]);
  assert.deepEqual([m.netnames.vcc.bits, m.netnames.gnd.bits], [['1'], ['0']]);
});

test('#4362 xc7RoutedCells: a vector\'s bits gathered (two site pins of a bit the same, an open input bit unknown, an open output bit a net of its own); a constant input inverted folded; an inverted net the model\'s IS_<pin>_INVERTED; the parameters the model\'s', () => {
  const m = cells(routed({ a: ['input', [2, 3]], p: ['output', [4]] }, {
    d: site('DSP48E1_DSP48E1', 'DSP48E1', { A0: ['A[0]', 'input', [2]], A1: ['A[1]', 'input', [3]], P0: ['P[0]', 'output', [4]],
      ALUMODE0: ['ALUMODE[0]', 'input', [90]], ALUMODE1: ['ALUMODE[1]', 'input', [91]], ALUMODE2: ['ALUMODE[2]', 'input', [2]], ALUMODE3: ['ALUMODE[3]', 'input', [91]],
      D0: ['D[0]', 'input', []], RSTD: ['RSTD', 'input', []] },
    { 'IS_ALUMODE[0]_INVERTED': bin(1), 'IS_ALUMODE[2]_INVERTED': bin(1), 'IS_ALUMODE[3]_INVERTED': bin(0), AREG: bin(0), NEXTPNR_ONLY: 'x' },
    { DSP_GND_PINS: ' RSTD D0' }),
    w: site('RAMB18E1_RAMB18E1', 'RAMB18E1', { WEA0: ['WEA[0]', 'input', [2]], WEA1: ['WEA[0]', 'input', [2]], WEA2: ['WEA[1]', 'input', [3]], ADDRATIEHIGH0: [null, 'input', [90]] }),
  }));
  const d = m.cells.d.connections;
  assert.deepEqual(d.A, [2, 3, ...Array(28).fill('x')]);
  assert.deepEqual(d.ALUMODE, ['0', '0', 2, '0'], 'ALUMODE[0] VCC inverted: 0; ALUMODE[2] a net inverted: the generic');
  assert.deepEqual([d.D, d.RSTD], [['0', ...Array(24).fill('x')], ['0']], 'the DSP\'s pins tied to ground (DSP_GND_PINS)');
  assert.equal(d.P[0], 4);
  assert.ok(d.P.slice(1).every((b) => typeof b === 'number' && b > 91) && new Set(d.P).size === 48);
  assert.deepEqual(m.cells.d.parameters, { AREG: bin(0), IS_ALUMODE_INVERTED: '0100' });
  assert.deepEqual(m.cells.w.connections, { WEA: [2, 3] });
});

test('#4362 xc7RoutedCells: a carry chain\'s head\'s CYINIT its X_PRECYINIT; an input whose site pins are all open with no default unknown, one with a default left open; BUFGCTRL a BUFG, RAMD32 a RAM32X1D', () => {
  const carry = (pre) => site('CARRY4', 'CARRY4', { CIN: ['CI', 'input', []], CYINIT: ['CYINIT', 'input', []], S0: ['S[0]', 'input', [2]], S1: ['S[1]', 'input', []], DI0: ['DI[0]', 'input', [90]],
    DI1: ['DI[1]', 'input', []], O0: ['O[0]', 'output', [4]] }, {}, pre ? { X_PRECYINIT: pre } : {});
  const m = cells(routed({ a: ['input', [2, 3]], q: ['output', [4, 5]] }, { c1: carry('C1'), c0: carry('C0'), cn: carry(null),
    g: site('BUFGCTRL', 'BUFGCTRL', { I0: ['I0', 'input', [2]], O: ['O', 'output', [6]], CE0: ['CE0', 'input', [90]], S0: ['S0', 'input', [90]], CE1: ['CE1', 'input', [90]] }, { IS_CE1_INVERTED: bin(1) }),
    r: site('SLICE_LUTX', 'RAMD32', { A1: ['RADR0', 'input', [2]], WA1: ['WADR0', 'input', [3]], DI1: ['I', 'input', [3]], O5: ['O', 'output', [5]], CLK: ['CLK', 'input', [2]], WE: ['WE', 'input', [90]], A6: [null, 'input', [90]] },
      { IS_WCLK_INVERTED: bin(0), INIT: bin(5) }) }));
  assert.deepEqual([m.cells.c1.connections.CYINIT, m.cells.c0.connections.CYINIT, m.cells.cn.connections.CYINIT], [['1'], ['0'], undefined]);
  assert.equal(m.cells.c1.connections.CI, undefined, 'CI open: its default');
  assert.deepEqual([m.cells.c1.connections.S, m.cells.c1.connections.DI], [[2, 'x', 'x', 'x'], ['1', 'x', 'x', 'x']]);
  assert.deepEqual([m.cells.g.type, m.cells.g.connections, m.cells.g.parameters], ['BUFG', { I: [2], O: [6] }, {}]);
  assert.deepEqual([m.cells.r.type, m.cells.r.connections, m.cells.r.parameters], ['RAM32X1D', { DPRA0: [2], A0: [3], D: [3], DPO: [5], WCLK: [2], WE: ['1'] }, { INIT: bin(5) }]);
});

test('#4362 xc7RoutedCells: a cell it cannot make a model\'s refused with its reason', () => {
  const one = (c) => () => xc7RoutedCells(JSON.stringify(routed({}, { c })));
  assert.throws(one({ type: 'SLICE_LUTX', parameters: {}, attributes: {}, port_directions: {}, connections: {} }),
    /^Error: the routed design's cell c \(SLICE_LUTX\) has no cell of the synthesis \(X_ORIG_TYPE\): Silinx has no model of it$/);
  assert.throws(one(site('GTPE2_CHANNEL', 'GTPE2_CHANNEL', {})), /^Error: the routed design's cell c is a GTPE2_CHANNEL, which Silinx's UNISIM models do not model$/);
  assert.throws(one(site('SLICE_LUTX', 'LUT1', { A1: ['I7', 'input', [2]] })), /^Error: the routed design's LUT1 c has a pin I7 its model has not$/);
  assert.throws(one(site('SLICE_FFX', 'FDRE', { CK: ['C', 'input', [2]] }, { IS_C_INVERTED: bin(1) })), /^Error: the routed design's FDRE c has its pin C inverted, which its model does not take$/);
});

test('#4362 a routed LUT, carry chain and distributed RAM simulate as the cells synthesis wrote: a xor, a + b + 1 on the chain\'s head\'s CYINIT 1, a RAM32X1D written and read', async () => {
  const json = routed({ a: ['input', [2, 3]], b: ['input', [4, 5]], clk: ['input', [6]], x: ['output', [7]], s: ['output', [8, 9]], q: ['output', [10]] }, {
    l: site('SLICE_LUTX', 'LUT2', { A2: ['I0', 'input', [2]], A4: ['I1', 'input', [4]], A6: [null, 'input', [90]], O6: ['O', 'output', [7]] }, { INIT: bin(6) }),
    p0: site('SLICE_LUTX', 'LUT2', { A1: ['I0', 'input', [2]], A2: ['I1', 'input', [4]], O6: ['O', 'output', [11]] }, { INIT: bin(6) }),
    p1: site('SLICE_LUTX', 'LUT2', { A1: ['I0', 'input', [3]], A2: ['I1', 'input', [5]], O6: ['O', 'output', [12]] }, { INIT: bin(6) }),
    c: site('CARRY4', 'CARRY4', { CIN: ['CI', 'input', []], CYINIT: ['CYINIT', 'input', []], S0: ['S[0]', 'input', [11]], S1: ['S[1]', 'input', [12]], S2: ['S[2]', 'input', []], S3: ['S[3]', 'input', []],
      DI0: ['DI[0]', 'input', [2]], DI1: ['DI[1]', 'input', [3]], DI2: ['DI[2]', 'input', []], DI3: ['DI[3]', 'input', []], O0: ['O[0]', 'output', [8]], O1: ['O[1]', 'output', [9]] }, {}, { X_PRECYINIT: 'C1' }),
    r: site('SLICE_LUTX', 'RAMD32', { A1: ['RADR0', 'input', [3]], A2: ['RADR1', 'input', [91]], A3: ['RADR2', 'input', [91]], A4: ['RADR3', 'input', [91]], A5: ['RADR4', 'input', [91]],
      WA1: ['WADR0', 'input', [3]], WA2: ['WADR1', 'input', [91]], WA3: ['WADR2', 'input', [91]], WA4: ['WADR3', 'input', [91]], WA5: ['WADR4', 'input', [91]],
      DI2: ['I', 'input', [2]], O6: ['O', 'output', [10]], CLK: ['CLK', 'input', [6]], WE: ['WE', 'input', [90]] }, { INIT: bin(2) }),
  });
  const tb = `module tb; reg [1:0] a, b; reg clk = 0; wire x, q; wire [1:0] s; r u (.a(a), .b(b), .clk(clk), .x(x), .s(s), .q(q));
  integer i; initial begin for (i = 0; i < 16; i = i + 1) begin a = i[1:0]; b = i[3:2]; #5 $display("%0d %0d %b %0d", a, b, x, s); end
  a = 2'b00; #1 $display("init q=%b", q); a = 2'b10; #1 $display("init q=%b", q); clk = 1; #5 a = 2'b11; #1 $display("written q=%b", q); end
endmodule
`;
  const want = [];
  for (let i = 0; i < 16; i++) { const a = i & 3, b = i >> 2; want.push(`${a} ${b} ${(a ^ b) & 1} ${(a + b + 1) & 3}`); }
  // (INIT 2: word 0 is 0, word 1 is 1; on the edge a[0], 0, written at word a[1], 1)
  assert.deepEqual(await run(json, tb), [...want, 'init q=0', 'init q=1', 'written q=0']);
});

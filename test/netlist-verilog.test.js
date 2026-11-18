// The Verilog of the iCE40's, ECP5's and Gowin's simulation models (#2299: core/netlist-verilog.js): the test bench's generics as the
// netlist's parameters, the global buffers left out, each pad on a net of its own (an inout connected to an input port's bit loses its value, #4360), nextpnr's
// routed design through Yosys's write_verilog, its module named as the design's top, a cell named as a net renamed; the Gowin's ALU
// chains' ends (ALU_MODE "C2L", "ONE2C") as their LUTs (#4362).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { globalBuffers, gowinAluModes, padNets, routedVerilog, withParameters } from '../core/netlist-verilog.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

test('withParameters: the generics declared as the first module\'s parameters; none: the netlist as it is', () => {
  const v = 'module top(a, y);\n  input a;\n  output y;\nendmodule\nmodule other(b);\nendmodule\n';
  assert.equal(withParameters(v, { div: 2, refresh: 4 }), 'module top(a, y);\n  parameter div = 2;\n  parameter refresh = 4;\n  input a;\n  output y;\nendmodule\nmodule other(b);\nendmodule\n');
  assert.equal(withParameters(v, {}), v);
});

const NET = `module top(sw, led, clk, io);
  input [1:0] sw;
  output [1:0] led;
  input clk;
  inout [0:0] io;
  SB_IO #(.PIN_TYPE(6'b000001)) i0 (.PACKAGE_PIN(sw[1]), .D_IN_0(a));
  SB_IO #(.PIN_TYPE(6'b011001)) o0 (.PACKAGE_PIN(led[0]), .D_OUT_0(a));
  SB_IO #(.PIN_TYPE(6'b000001)) c0 (.PACKAGE_PIN(clk), .D_IN_0(b));
  SB_IO #(.PIN_TYPE(6'b011001)) o1 (.PACKAGE_PIN(led[1]), .D_OUT_0(b));
  SB_IO #(.PIN_TYPE(6'b101001)) x0 (.PACKAGE_PIN(io[0]), .D_OUT_0(b), .OUTPUT_ENABLE(1'b0));
  wire a, b;
endmodule
`;

test('padNets: each pad of an input or output port (or a bit of one) on a net of its own, assigned from it or onto it; an inout\'s as it is', () => {
  const v = padNets(NET);
  for (const [pin, net] of [['i0', '\\sw[1]$pad '], ['o0', '\\led[0]$pad '], ['c0', '\\clk$pad '], ['o1', '\\led[1]$pad ']]) assert.ok(v.includes(`${pin} (.PACKAGE_PIN(${net})`), pin);
  assert.ok(v.includes('x0 (.PACKAGE_PIN(io[0])'));
  assert.match(v, /wire \\sw\[1\]\$pad ;\n {2}wire \\led\[0\]\$pad ;\n {2}wire \\clk\$pad ;\n {2}wire \\led\[1\]\$pad ;\n {2}assign \\sw\[1\]\$pad = sw\[1\];\n {2}assign led\[0\] = \\led\[0\]\$pad ;\n {2}assign \\clk\$pad = clk;\n {2}assign led\[1\] = \\led\[1\]\$pad ;\nendmodule\n$/);
  assert.equal(padNets('module a(x);\n  input x;\nendmodule\n'), 'module a(x);\n  input x;\nendmodule\n');
  // (simulated with the iCE40's SB_IO: the inputs reach the outputs, as they do not through the port's bit itself, #4360)
  const tb = 'module tb; reg [1:0] sw = 2\'b10; reg clk = 0; wire [1:0] led; wire [0:0] io;\n  top t (.sw(sw), .led(led), .clk(clk), .io(io));\n'
    + '  initial begin #5 $display("%b", led); sw = 2\'b00; clk = 1; #5 $display("%b", led); end\nendmodule\n';
  const srcs = [{ path: 'n.v', lang: 'verilog', text: v }, { path: 'tb.v', lang: 'verilog', text: tb }];
  const r = simulate([...primitiveSources(srcs), ...srcs], 'tb', { until: 20000 });
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => d.message), []);
  assert.deepEqual(r.sim.log.map((e) => e.text), ['01', '10']);
});

test('routedVerilog: nextpnr\'s routed JSON as Verilog, its module (top) named as the design\'s top, a cell named as a net renamed', async () => {
  const json = { modules: { top: { attributes: { top: '1' }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } },
    cells: { n: { type: 'SB_LUT4', parameters: { LUT_INIT: '0000000000000001' }, port_directions: { I0: 'input', O: 'output' }, connections: { I0: [2], O: [4] } },
      g: { type: 'SB_GB', parameters: {}, port_directions: { USER_SIGNAL_TO_GLOBAL_BUFFER: 'input', GLOBAL_BUFFER_OUTPUT: 'output' }, connections: { USER_SIGNAL_TO_GLOBAL_BUFFER: [4], GLOBAL_BUFFER_OUTPUT: [3] } } },
    netnames: { a: { bits: [2] }, y: { bits: [3] }, n: { bits: [4] } } } } };
  const v = await routedVerilog(JSON.stringify(json), yosysNode, 'blink');
  assert.match(v, /^module blink\(a, y\);$/m);
  assert.match(v, /SB_LUT4 #\(\s*\.LUT_INIT\(16'h0001\)\s*\) \\n\$cell {2}\(/);
  assert.match(v, /SB_GB g \(/);
});

test('globalBuffers: each SB_GB left out, its output net its input\'s wherever it is used, but in its declaration', () => {
  const v = 'module t(clk);\n  wire \\c$glb ;\n  wire g2;\n  SB_GB _1_ (\n    .GLOBAL_BUFFER_OUTPUT(\\c$glb ),\n    .USER_SIGNAL_TO_GLOBAL_BUFFER(\\clk$in )\n  );\n'
    + '  SB_GB g (\n    .GLOBAL_BUFFER_OUTPUT(g2),\n    .USER_SIGNAL_TO_GLOBAL_BUFFER(x[3])\n  );\n  X a (.C(\\c$glb ), .D(g2), .E(g20));\nendmodule\n';
  assert.equal(globalBuffers(v), 'module t(clk);\n  wire \\c$glb ;\n  wire g2;\n  X a (.C(\\clk$in ), .D(x[3]), .E(g20));\nendmodule\n');
  assert.equal(globalBuffers('module t;\nendmodule\n'), 'module t;\nendmodule\n');
});

test('#4362 gowinAluModes: ALU_MODE "C2L" and "ONE2C" written as ADDSUB with their LUTs (0 and 15, Apicula\'s), the numbered modes and the rest as they are', () => {
  const v = (mode) => `  ALU #(\n    .ALU_MODE(${mode})\n  ) a (\n    .COUT(c)\n  );\n`;
  assert.equal(gowinAluModes(v('"C2L"')), v("32'd2),\n    .RAW_ALU_LUT(32'd0"));
  assert.equal(gowinAluModes(v('"ONE2C"')), v("32'd2),\n    .RAW_ALU_LUT(32'd15"));
  for (const m of ["32'd2", '"0"', '"hadder"']) assert.equal(gowinAluModes(v(m)), v(m));
  // (the result simulates: a C2L passes CIN to SUM, a ONE2C's COUT is 1)
  const net = { path: 'm.v', lang: 'verilog', text: `module m(input c, output s, output o);\n  ALU #(\n    .ALU_MODE("C2L")\n  ) a (\n    .CIN(c),\n    .SUM(s)\n  );\n  ALU #(\n    .ALU_MODE("ONE2C")\n  ) b (\n    .COUT(o)\n  );\nendmodule\n` };
  net.text = gowinAluModes(net.text);
  const tb = { path: 'tb.v', lang: 'verilog', text: 'module tb; reg c = 1; wire s, o; m u (.c(c), .s(s), .o(o));\n  initial begin #1 $display("%b %b", s, o); c = 0; #1 $display("%b %b", s, o); end\nendmodule\n' };
  const r = simulate([...primitiveSources([net]), net, tb], 'tb', { until: 10000 });
  assert.deepEqual([[...r.lib.errors, ...r.design.diags].map((d) => d.message), r.sim.log.map((e) => e.text)], [[], ['1 1', '0 1']]);
});

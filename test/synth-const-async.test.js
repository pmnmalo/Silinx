// Open synthesis: a constant net into a flip-flop's asynchronous control (#4332). The flattened Verilog read a net
// driven by one constant as that constant (#14) in the flip-flop's condition but not in its event list, so Yosys's proc
// stopped ("Multiple edge sensitive events found for this signal!").
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { toVerilog } from '../core/synth-verilog.js';

const FF = `module ff(input clk, input pre_n, input d, output reg q);
always @(posedge clk or negedge pre_n) if (!pre_n) q <= 1'b1; else q <= d;
endmodule
`;
const NET = `${FF}module top(input clk, input d, output q);
wire n = 1'b1;
ff u (.clk(clk), .pre_n(n), .d(d), .q(q));
endmodule
`;
const PORT = `${FF}module top(input clk, input d, output q);
ff u (.clk(clk), .pre_n(1'b1), .d(d), .q(q));
endmodule
`;
const design = text => elaborate(compile([{ path: 'top.v', text }]), 'top');

test('#4332 a net assigned a constant into a flip-flop\'s asynchronous preset: its event list and its condition read the same net', () => {
  const v = toVerilog(design(NET)).text;
  assert.match(v, /always @\(posedge clk or negedge n\) begin\n\s+if \(!\(n\)\) begin/);
});

test('#4332 the open synthesis of a flip-flop whose preset is a net assigned 1: no error, no warning, the cells of .pre_n(1\'b1)\'s', { timeout: 120000 }, async () => {
  const net = await synthesizeOpen(design(NET), { run: yosysNode, abc9: false });
  const port = await synthesizeOpen(design(PORT), { run: yosysNode, abc9: false });
  assert.deepEqual(net.errors ?? [], []);
  assert.deepEqual(net.warnings, []);
  assert.deepEqual(port.warnings, []);
  assert.deepEqual(net.cells, port.cells);
});

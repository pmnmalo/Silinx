// The MCP server on the iCE40 (#2299, #2674: what the interface does): a design that instantiates the iCE40's primitives (a
// PLL, the high-frequency oscillator) elaborates, simulates with Silinx's models of them (ice40-prims.js) and synthesizes,
// the primitives kept as the iCE40's cells; every result's text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-ice40-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

// the iCEBreaker's 12 MHz × 4 (DIVF 63, DIVQ 4: 48 MHz), the oscillator's 48 MHz / 8 (6 MHz)
const PLL_TOP = `module top(input clk, output lock, output reg [3:0] n = 0, output reg [3:0] m = 0);
  wire fast, slow;
  SB_PLL40_PAD #(.FEEDBACK_PATH("SIMPLE"), .DIVR(4'b0000), .DIVF(7'b0111111), .DIVQ(3'b100), .FILTER_RANGE(3'b001))
    u (.PACKAGEPIN(clk), .PLLOUTGLOBAL(fast), .LOCK(lock), .RESETB(1'b1), .BYPASS(1'b0));
  SB_HFOSC #(.CLKHF_DIV("0b11")) o (.CLKHFEN(1'b1), .CLKHFPU(1'b1), .CLKHF(slow));
  always @(posedge fast) n <= n + 1;
  always @(posedge slow) m <= m + 1;
endmodule
`;
const PLL_TB = `\`timescale 1ps / 1ps
module tb_top;
  reg clk = 0;
  wire lock;
  wire [3:0] n, m;
  top dut (.clk(clk), .lock(lock), .n(n), .m(m));
  always #41667 clk = ~clk;
  initial begin #1000000; $display("lock %b n %0d m %0d", lock, n, m); end
endmodule
`;
test('a project instantiating SB_PLL40_PAD and SB_HFOSC on the iCEBreaker: set_top, check_syntax and simulate, its synthesis (#2299)', { timeout: 600000 }, async () => {
  await ok('new_project', { name: 'pll' });
  await ok('set_design_properties', { project: 'pll', board: 'icebreaker' });
  await ok('write_file', { project: 'pll', path: 'src/top.v', text: PLL_TOP });
  await ok('write_file', { project: 'pll', path: 'sim/tb_top.v', text: PLL_TB });
  await ok('set_top', { project: 'pll', top: 'top', sim_top: 'tb_top' });
  assert.match((await ok('check_syntax', { project: 'pll' })).text, /^Process "Check Syntax" of <top> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  assert.match((await ok('check_syntax', { project: 'pll', simulation: true })).text, /^Process "Check Syntax" of <tb_top> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  const s = await ok('simulate', { project: 'pll', time_ns: 1100, signals: [] });
  // the reference rises at 41.667, 125.001 … ns: locked at the third (208.3 ns), the 48 MHz from the fourth (291.669 ns), a
  // rising edge every 20 833 ps (its period to the picosecond): 35 to 1000 ns, n = 35 mod 16; the 6 MHz rises at 83.3, 250 …
  // 916.7 ns: 6
  assert.deepEqual([s.data.log.map(l => l.text), s.data.warnings, s.data.failed], [['lock 1 n 3 m 6'], [], false]);
  const run = await ok('run_process', { project: 'pll', process: 'synthesize' });
  assert.deepEqual(run.data.warnings, []);
  // (the primitives kept as the iCE40's cells)
  const net = fs.readFileSync(path.join(P.projectDir('pll'), 'build', 'open', 'top_yosys.v'), 'utf8');
  assert.match(net, /^\s*SB_PLL40_PAD #\(/m);
  assert.match(net, /^\s*SB_HFOSC #\(/m);
});

// #2299: the flow's simulation models (core/flow-models-nextpnr.js, shown again since #3707 hid them): blinky's Post-Synthesis and
// Post-Place & Route models (Verilog, the iCE40 cells, synthesized with the test bench's generics), each simulated against its test bench
test('run_process post_synthesis_model and post_par_model on the icebreaker: the models of blinky, simulate model each: its test bench passes, no warning (#2299)', { timeout: 900000 }, async () => {
  await ok('new_project_from_example', { name: 'models', example: 'blinky' });
  await ok('set_design_properties', { project: 'models', board: 'icebreaker', update_constraints: true });
  const syn = await ok('run_process', { project: 'models', process: 'post_synthesis_model' });
  assert.deepEqual([syn.data.warnings, syn.data.errors], [[], []]);
  assert.match(syn.text, /^Post-Synthesis Simulation Model: build\/netgen\/synthesis\/top_synthesis\.v \(Verilog, the iCE40 cells\), 334 cells$/m);
  const par = await ok('run_process', { project: 'models', process: 'post_par_model' });
  assert.deepEqual([par.data.warnings, par.data.errors], [['WARNING:Place - the port led[5] has no pin (set_io in the PCF): nextpnr places it anywhere.',
    'WARNING:Place - the port led[6] has no pin (set_io in the PCF): nextpnr places it anywhere.', 'WARNING:Place - the port led[7] has no pin (set_io in the PCF): nextpnr places it anywhere.',
    "WARNING:Place - IO 'led[7]' is unconstrained in PCF and will be automatically placed", "WARNING:Place - IO 'led[6]' is unconstrained in PCF and will be automatically placed",
    "WARNING:Place - IO 'led[5]' is unconstrained in PCF and will be automatically placed"], []]);
  assert.match(par.text, /^Placing and routing the design synthesized with the test bench's generics \(nextpnr\), for its model\.$/m);
  assert.match(par.text, /^Post-Place & Route Simulation Model: build\/netgen\/par\/top_timesim\.v \(Verilog, the iCE40 cells\), 223 cells$/m);
  for (const model of ['postsynth', 'postpar']) {
    const s = await ok('simulate', { project: 'models', model, time_ns: 2000000, signals: [] });
    assert.deepEqual([s.data.log.map(l => l.text).slice(-1), s.data.warnings, s.data.failed, s.data.notes], [['Simulation finished OK'], [], false, []], model);
  }
  // (Verilog netlists of the family's cells, the test bench's generics their parameters)
  const net = fs.readFileSync(path.join(P.projectDir('models'), 'build', 'netgen', 'par', 'top_timesim.v'), 'utf8');
  assert.match(net, /^module top\(/m);
  assert.match(net, /^  parameter div = 2;$/m);
});

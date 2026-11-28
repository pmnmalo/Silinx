// The System example regs-zynq (#4688, part 4): a Zybo Z7's node whose PL's counter is driven by its PS's program through
// a register map on AXI4-Lite (its psMap, zybo/cnt_regs.regs.json): the Cortex-A9 clears it, sets its period, enables it
// and prints the count it reads back on the USB serial port, linked to a serial terminal. Made with the MCP server,
// checked (no warning), simulated (no warning, the PS's program run: its first line on the terminal, #4689), its PL built by the Silinx toolchain as Silinx's top counter_zynq (the PS7, its M_AXI_GP0 on
// the map's slave, the counter) with no warning, its PS program compiled (a stand-in arm-none-eabi-gcc) with no warning;
// the program's register offsets are the map's; the counter with Silinx's top, in VHDL and in Verilog (a twin of it),
// compiled and elaborated with no error and no warning and simulated against a stand-in of the PS7 running the program's
// accesses: cleared, its period set, enabled, counting at its period, stopped, cleared.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig, ROOT } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { readRegmap } from '../core/regmap.js';
import { readSystem } from '../core/system-doc.js';
import { nodeConstraints } from '../core/system-node.js';
import { generateRegmap } from '../core/regmap-hdl.js';
import { zynqPlTop, GP0 } from '../core/zynq-pl-top.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const EX = path.join(ROOT, 'examples/regs-zynq');
const GCC = path.join(ROOT, 'test/fixtures/arm-gcc-stub/arm-none-eabi-gcc');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-regs-zynq-'); await writeConfig({ mode: 'silinx', paths: { 'arm-none-eabi-gcc': GCC } }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const MAP = readRegmap(fs.readFileSync(path.join(EX, 'zybo/cnt_regs.regs.json'), 'utf8')).regmap;
const PINS = JSON.parse(fs.readFileSync(path.join(EX, 'regs_zynq.sys.json'), 'utf8')).nodes[0].pins;
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#4688 regs-zynq: its PS program\'s register offsets are its map\'s', () => {
  const c = fs.readFileSync(path.join(EX, 'zybo/ps/main.c'), 'utf8');
  const offsets = Object.fromEntries([...c.matchAll(/#define CNT_(\w+) +REG\(PL_BASE \+ 0x([0-9A-F]+)\)/g)].map(([, n, a]) => [n.toLowerCase(), parseInt(a, 16)]));
  assert.deepEqual(offsets, Object.fromEntries(MAP.registers.map((r) => [r.name, r.addr])));
  assert.match(c, /#define PL_BASE +0x40000000u/);
});

test('#4688 regs-zynq\'s node\'s XDC as Silinx makes it (nodeConstraints): its LEDs\' pins only, its registers and clk the top\'s', () => {
  const n = readSystem(fs.readFileSync(path.join(EX, 'regs_zynq.sys.json'), 'utf8')).system.nodes[0];
  const ports = MODULE.ports.map((p) => ({ ...p, msb: p.width > 1 ? p.width - 1 : null, lsb: p.width > 1 ? 0 : null }));
  assert.equal(fs.readFileSync(path.join(EX, 'zybo/counter.xdc'), 'utf8'), nodeConstraints(n, ports).text);
});

// the counter's Verilog twin, and the ports of both
const COUNTER = { vhdl: fs.readFileSync(path.join(EX, 'zybo/counter.vhd'), 'utf8'), verilog: `module counter (
  input  wire        clk,
  input  wire        enable,
  input  wire [31:0] period,
  input  wire        clear,
  input  wire        clear_wr,
  output wire [15:0] count,
  output wire [3:0]  led
);
  reg [31:0] ticks = 32'd0;
  reg [15:0] c = 16'd0;
  always @(posedge clk)
    if (clear_wr && clear) begin ticks <= 32'd0; c <= 16'd0; end
    else if (enable) begin
      if (ticks + 32'd1 >= period) begin ticks <= 32'd0; c <= c + 16'd1; end
      else ticks <= ticks + 32'd1;
    end
  assign count = c;
  assign led = c[3:0];
endmodule
` };
const MODULE = { name: 'counter', ports: [['clk', 'in', 1], ['enable', 'in', 1], ['period', 'in', 32], ['clear', 'in', 1], ['clear_wr', 'in', 1], ['count', 'out', 16], ['led', 'out', 4]]
  .map(([name, dir, width]) => ({ name, dir, width })) };
// the stand-ins: BUFG; the PS7 (FCLK_CLK0 at 100 MHz, its reset released) running main.c's accesses on M_AXI_GP0, at its base
const VCOMP = { path: 'vcomponents.vhd', text: 'package VCOMPONENTS is\nend VCOMPONENTS;\n' };
const STANDINS = ['`timescale 1ns/1ps', 'module BUFG (input I, output O); assign O = I; endmodule',
  `module PS7 (output reg [3:0] FCLKCLK = 0, output reg [3:0] FCLKRESETN = 0,
  ${GP0.map(([s, d, wd]) => `${d === 'out' ? 'output reg' : 'input'} ${wd === 1 ? '' : `[${wd - 1}:0] `}MAXIGP0${s}${d === 'out' ? ' = 0' : ''}`).join(', ')});`,
  '  always #5 FCLKCLK[0] = ~FCLKCLK[0];',
  '  task wr(input [31:0] a, input [31:0] d); begin',
  '    @(negedge FCLKCLK[0]); MAXIGP0AWADDR = 32\'h40000000 + a; MAXIGP0AWVALID = 1; MAXIGP0WDATA = d; MAXIGP0WSTRB = 4\'hf; MAXIGP0WVALID = 1;',
  '    @(posedge FCLKCLK[0]); while (!(MAXIGP0AWREADY && MAXIGP0WREADY)) @(posedge FCLKCLK[0]);',
  '    @(negedge FCLKCLK[0]); MAXIGP0AWVALID = 0; MAXIGP0WVALID = 0; MAXIGP0BREADY = 1;',
  '    while (!MAXIGP0BVALID) @(negedge FCLKCLK[0]);', '    @(negedge FCLKCLK[0]); MAXIGP0BREADY = 0;', '  end endtask',
  '  task rd(input [31:0] a); begin',
  '    @(negedge FCLKCLK[0]); MAXIGP0ARADDR = 32\'h40000000 + a; MAXIGP0ARVALID = 1;', '    @(posedge FCLKCLK[0]); while (!MAXIGP0ARREADY) @(posedge FCLKCLK[0]);',
  '    @(negedge FCLKCLK[0]); MAXIGP0ARVALID = 0; MAXIGP0RREADY = 1;', '    while (!MAXIGP0RVALID) @(negedge FCLKCLK[0]);',
  '    $display("read %h: %0d", a, MAXIGP0RDATA);', '    @(negedge FCLKCLK[0]); MAXIGP0RREADY = 0;', '  end endtask',
  '  initial begin',
  '    repeat (4) @(negedge FCLKCLK[0]); FCLKRESETN = 4\'hf;',
  '    rd(4); rd(0);',                                  // (the reset values: period 50 000 000, disabled)
  '    wr(12, 1); wr(4, 10); wr(0, 1);',                // (main.c's: cleared, its period, enabled)
  '    repeat (200) @(negedge FCLKCLK[0]);',
  '    wr(0, 0); rd(8); rd(4); rd(0);',                 // (stopped: its count, its period and enable read back)
  '    wr(12, 1); rd(8);',                              // (cleared)
  '    $finish;', '  end', 'endmodule', ''].join('\n');

test('#4688 regs-zynq\'s counter with Silinx\'s top, in VHDL and Verilog: compiled and elaborated, no error nor warning; simulated against the PS7\'s stand-in: main.c\'s accesses', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const t = zynqPlTop({ module: MODULE, map: MAP, pins: PINS, lang, fixedIo: false });
    assert.deepEqual(t.errors, [], lang);
    const slave = generateRegmap(MAP, { lang });
    const files = [{ path: slave.file, text: slave.code }, { path: `counter.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: COUNTER[lang] }, { path: t.file, text: t.code }];
    const lib = compile([VCOMP, ...files, { path: 'standins.v', text: STANDINS }]);
    const d = elaborate(lib, 'counter_zynq');
    assert.deepEqual([...lib.errors, ...d.diags].map((e) => `${e.severity}: ${e.message}`), [], lang);
    const r = simulate([VCOMP, ...files, { path: 'standins.v', text: STANDINS }, { path: 'tb.v', text: '`timescale 1ns/1ps\nmodule tb; wire [3:0] led; counter_zynq dut (.led(led)); endmodule\n' }],
      'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], lang);
    const log = r.sim.log.map((l) => l.text);
    assert.match(log.pop(), /^simulation finished \(\$finish\) at \d+ [nu]s$/, lang);
    const [period0, enable0, count, period, enable, cleared] = log.map((l) => Number(l.match(/^read 0000000[048c]: (\d+)$/)?.[1]));
    assert.deepEqual([period0, enable0, period, enable, cleared], [50000000, 0, 10, 0, 0], `${lang}: ${log.join('; ')}`);
    // (a step every 10 clocks of the 200 or so it ran)
    assert.ok(count >= 19 && count <= 22, `${lang}: count ${count}`);
  }
});

test('#4688 regs-zynq made with the MCP server: checked (no warning), simulated (no warning, its PS\'s first line on the terminal), its PL built as counter_zynq with no warning, its PS program compiled', { timeout: 600000 }, async () => {
  const ex = await ok('list_examples', {});
  assert.equal(ex.text.split('\n').at(-1), 'regs-zynq: a System example (FPGA and microcontroller nodes in a System), 1 file(s)');
  await ok('new_project_from_example', { name: 'rz', example: 'regs-zynq' });
  const c = await ok('check_system', { project: 'rz', file: 'regs_zynq.sys.json' });
  assert.deepEqual(c.text.split('\n'), ['System regs_zynq: 2 nodes, 1 link',
    'node zybo: FPGA, module counter on zybo-z7-20, in VHDL; its PS\'s program zybo/ps/main.c: the Cortex-A9 at 666.7 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 50 MHz; its PL built as counter_zynq: the PS7, its M_AXI_GP0 on the registers of zybo/cnt_regs.regs.json, and counter',
    '  PS_UART1: UART 115200 baud 8N1, its PS\'s UART1: TX MIO 48, RX MIO 49, the board\'s USB serial port',
    'node term: Serial terminal', '  serial: UART 115200 baud 8N1', 'link serial: UART zybo.PS_UART1 ↔ term.serial', 'No wires: no link joins two resolved interfaces.',
    'Process "Check System" of regs_zynq.sys.json completed successfully.']);
  const s = await ok('simulate', { project: 'rz', time_ns: 7e6 });
  // (its PS's program run, #4689: its first line on the terminal, 63 bytes in 5.5 ms; its counts after its delay)
  assert.deepEqual([s.data.warnings, s.data.errors, s.data.terminals], [[], [], { term: 'The PL\'s counter, driven by the Cortex-A9 of Digilent Zybo Z7\r\n' }]);
  const b = await ok('run_process', { project: 'rz', process: 'bitstream', node: 'zybo' });
  assert.deepEqual([b.data.errors, b.data.warnings], [[], []]);
  assert.ok(b.text.includes('System node zybo: its PL\'s top counter_zynq (zybo/counter_zynq.vhd), written by Silinx: the PS7, its M_AXI_GP0 on the registers of zybo/cnt_regs.regs.json, and counter.'), b.text);
  assert.ok(fs.existsSync(path.join(P.projectDir('rz'), 'build/nodes/zybo/zybo/counter_zynq.vhd')));
  // (the stand-in for arm-none-eabi-gcc is a script run by its #! line: not on Windows, as test/system-example-zynq.test.js's, #6011)
  if (process.platform === 'win32') return;
  await P.updateProject('rz', (p) => ({ ...p, trusted: true }));
  const ps = await ok('run_process', { project: 'rz', process: 'ps', node: 'zybo' });
  assert.deepEqual([ps.data.errors, ps.data.warnings], [[], []]);
});

test('#4689 regs-zynq simulated with its PS driving its PL (part 5c): the counter enabled, its period set, the counts the A9 reads back on the terminal at the counter\'s rate; no warning', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'rs', example: 'regs-zynq' });
  // (its period 10 clocks of FCLK0, 200 ns a step; its delay between prints 200 iterations: seconds of the A9 else)
  const src = fs.readFileSync(path.join(EX, 'zybo/ps/main.c'), 'utf8').replace('CNT_PERIOD = 12500000u;', 'CNT_PERIOD = 10u;').replace('i < 20000000u', 'i < 200u');
  await ok('write_file', { project: 'rs', path: 'zybo/ps/main.c', text: src });
  const s = await ok('simulate', { project: 'rs', time_ns: 15e6 });
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  const lines = s.data.terminals.term.split('\r\n');
  assert.equal(lines[0], 'The PL\'s counter, driven by the Cortex-A9 of Digilent Zybo Z7');
  const counts = lines.slice(1).filter((l) => /^count: \d+$/.test(l)).map((l) => Number(l.slice(7)));
  assert.ok(counts.length >= 4, lines.join(' | '));
  // (between two reads, the line before sent at 115200 baud (the FIFO full, each read waits for its room): "count: 7788\r\n",
  // 13 bytes × 10 bits / 115207 baud = 1.128 ms, 5642 steps of 200 ns; the counter's rate is FCLK0's / its period, not the
  // board's 125 MHz)
  for (let i = 1; i < counts.length; i++) {
    const step = `count: ${counts[i - 1]}\r\n`.length * 10 / (100e6 / (124 * 7)) / 200e-9;
    assert.ok(Math.abs(counts[i] - counts[i - 1] - step) <= 3, `${counts[i - 1]} then ${counts[i]}: ${step} expected`);
  }
});

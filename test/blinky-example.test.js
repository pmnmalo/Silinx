// The blinky example (examples/blinky, the third example): the knight rider and binary counter on the LEDs,
// and the steps of the LED pattern counted on the 4-digit 7-segment display (#983): a BCD counter
// (src/bcd_counter.vhd, 0000 to 9999 and around) shown by the clock example's display driver (src/sevenseg.v,
// multiplexed, one digit per ms). The project's sources; the UCF has the display's pins on every board; the
// test bench passes and fails on a wrong design (the ones digit wrapping at 8, a count that goes on while paused,
// a reset that keeps the count, the digits in the wrong order).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TARGETS, targetName, example, exampleUcf, runTestbench } from './examples-lib.mjs';
import { generate } from '../core/asm.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { boardGenericValues } from '../core/board-generics.js';
import { resolveBoard } from '../server/devices.js';
import { BOARDS } from '../server/boards.js';

const ex = example('blinky');
const read = (f) => fs.readFileSync(path.join(ex.dir, f), 'utf8');

test('blinky: the project (top top, test bench tb_top, Basys2, mixed VHDL / Verilog), its sources', () => {
  assert.deepEqual([ex.project.name, ex.project.top, ex.project.simTop, ex.project.board, ex.project.device.part, ex.project.preferredLanguage],
    ['blinky', 'top', 'tb_top', 'basys2', 'xc3s250e', 'vhdl']);
  assert.deepEqual(ex.project.files.map((f) => `${f.path}:${f.lang}:${f.role}`), [
    'src/counter.v:verilog:design', 'src/knight.vhd:vhdl:design', 'src/speed_ctrl.vhd:vhdl:design', 'src/bcd_counter.vhd:vhdl:design',
    'src/sevenseg.v:verilog:design', 'src/top.vhd:vhdl:design', 'sim/tb_top.vhd:vhdl:sim',
  ]);
  // the display is the clock example's (only its header comment differs: the example is complete by itself)
  const body = (t) => t.replace(/^(\/\/.*\n)+/, '');
  assert.equal(body(read('src/sevenseg.v')), body(fs.readFileSync(path.join(example('clock').dir, 'src/sevenseg.v'), 'utf8')));
});

test('blinky: the display\'s pins in the UCF it ships (Basys2) and in the board pin assignment of every device', () => {
  const ucf = read('constraints/top.ucf');
  const display = { 'seg<0>': 'L14', 'seg<1>': 'H12', 'seg<2>': 'N14', 'seg<3>': 'N11', 'seg<4>': 'P12', 'seg<5>': 'L13', 'seg<6>': 'M12', dp: 'N13',
    'an<0>': 'F12', 'an<1>': 'J12', 'an<2>': 'M13', 'an<3>': 'K14' };
  for (const [net, loc] of Object.entries(display)) {
    assert.match(ucf, new RegExp(`^NET "${net.replace(/[<>]/g, '\\$&')}" +LOC = "${loc}" \\| IOSTANDARD = LVCMOS33 ;$`, 'm'), net);
  }
  const loc = (text, net) => text.match(new RegExp(`^NET "${net}" +LOC = "(\\w+)"`, 'm'))?.[1];
  for (const t of TARGETS) {
    const u = exampleUcf('blinky', t);
    assert.deepEqual(u.unmatched, [], `${targetName(t)}`);
    // the other boards' displays: other pins (the Nexys2's anodes F17 H17 C18 F15, its segments L18 F18 D17 D16 G14
    // J17 H14, dp C17; the Nexys3's from its master UCF; the Atlys's on its VHDCI connector, #732)
    const want = {
      nexys2: { 'an<0>': 'F17', 'an<3>': 'F15', 'seg<0>': 'L18', 'seg<6>': 'H14', dp: 'C17' },
      nexys3: { 'an<0>': 'N16', 'an<3>': 'P17', 'seg<0>': 'T17', 'seg<6>': 'L14', dp: 'M13' },
      atlys: { 'an<0>': 'U11', 'an<3>': 'R8', 'seg<0>': 'U16', 'seg<6>': 'N10', dp: 'M10' },
    }[t.board] || { 'an<0>': 'F12', 'an<3>': 'K14', 'seg<0>': 'L14', 'seg<6>': 'M12', dp: 'N13' };
    for (const [net, pin] of Object.entries(want)) assert.equal(loc(u.text, net), pin, `${targetName(t)} ${net}`);
  }
});

test('blinky: the test bench passes (the LEDs, the speed buttons, the display\'s count, pause, wrap and reset)', { timeout: 120000 }, async () => {
  const r = await runTestbench('blinky');
  assert.ok(r.passed, r.log.join('\n'));
  assert.deepEqual(r.warnings, []);
});

// a wrong design: the test bench fails, saying what
const MUTANTS = [
  ['the ones digit wrapping at 8', 'src/bcd_counter.vhd', 'if ones /= 9 then', 'if ones /= 8 then', /display: expected 14 steps, got 15/],
  ['a count that goes on while paused', 'src/top.vhd', 'inc => step', 'inc => speed_step', /pause did not hold the display/],
  ['a reset that keeps the count', 'src/bcd_counter.vhd', 'ones <= (others => \'0\'); tens <= (others => \'0\');\n                hundreds <= (others => \'0\'); thousands <= (others => \'0\');', 'null;', /reset did not clear the count/],
  ['the digits in the wrong order', 'src/top.vhd', 'an => an );', 'an(0) => an(3), an(1) => an(2), an(2) => an(1), an(3) => an(0) );', /display: expected 14 steps, got 4100/],
];
for (const [what, file, from, to, message] of MUTANTS) {
  test(`blinky: the test bench fails on ${what}`, { timeout: 120000 }, async () => {
    const text = read(file);
    assert.ok(text.includes(from), `${file}: ${from}`);
    const r = await runTestbench('blinky', { edit: { [file]: text.replace(from, to) } });
    assert.equal(r.passed, false);
    assert.match(r.log.join('\n'), message);
  });
}

// The buttons' debouncers on every board's clock (#3922, #4377): speed_ctrl's counters (cnt_f, cnt_s) count to
// DEBOUNCE - 1, the top's DEBOUNCE_N. Counted in clock cycles (CLK_HZ / 50, 20 ms) no width fitted every board: 21 bits
// never reached it above 104.8 MHz (the Zybo Z7's buttons did nothing, #3922), 22 left bit 21 constant at 100 MHz
// (XST's Xst:1293 on the Nexys3 and the Atlys, #4377). Counted in the prescaler's ticks (80 a second), DEBOUNCE_N is
// the same on every board, and the counters' width is its count's: every bit used, none missing.
const chart = () => JSON.parse(read('src/speed_ctrl.asm.json'));
/** The top's DEBOUNCE_N at a board's clock: its `or_else(DEBOUNCE, …)` default, evaluated with CLK_HZ. */
function debounceAt(hz) {
  const m = read('src/top.vhd').match(/constant DEBOUNCE_N : integer := or_else\(DEBOUNCE, ([^;]+)\);/);
  assert.ok(m, 'DEBOUNCE_N in top.vhd');
  const expr = m[1].replace(/CLK_HZ/g, String(hz)).replace(/_/g, '');
  assert.match(expr, /^[\d\s/*+-]+$/);
  return expr.split('/').map((x) => Number(x.trim())).reduce((a, b) => Math.trunc(a / b));
}

test('#4377 blinky: speed_ctrl\'s debounce counters as wide as DEBOUNCE - 1 at every board\'s clock, in the chart and its VHDL', () => {
  const widths = Object.fromEntries(chart().registers.filter((r) => /^cnt_/.test(r.name)).map((r) => [r.name, r.width]));
  const clocks = BOARDS.map((b) => [b.id, boardGenericValues(resolveBoard(b.id)).CLK_HZ]).filter(([, hz]) => hz);
  assert.ok(clocks.some(([id, hz]) => id === 'zybo-z7' && hz === 125_000_000));
  assert.ok(clocks.some(([id, hz]) => id === 'nexys3' && hz === 100_000_000));
  for (const [id, hz] of clocks) {
    const max = debounceAt(hz) - 1;
    assert.ok(max >= 1, `${id}: DEBOUNCE ${max + 1}`);
    assert.deepEqual(widths, { cnt_f: max.toString(2).length, cnt_s: max.toString(2).length }, `${id} (${hz} Hz): DEBOUNCE - 1 = ${max}`);
  }
  assert.equal(chart().generics.find((g) => g.name === 'DEBOUNCE').default, debounceAt(50_000_000));
  for (const n of ['cnt_f', 'cnt_s']) assert.match(read('src/speed_ctrl.vhd'), new RegExp(`signal ${n}, ${n}_next : std_logic_vector\\(${widths[n] - 1} downto 0\\)`));
});

// speed_ctrl with a tick every 4 cycles: a step every 2^level ticks, level 5 at reset (10 steps in 1280 cycles); a
// button held 2 ticks is not taken (a bounce), held 3 ticks (DEBOUNCE) it is: faster, level 4 (20 steps), or slower,
// level 6 (5 steps), whatever the clock.
const tbTicks = (button) => `module tb;
  reg clk = 0, rst = 1, faster = 0, slower = 0;
  reg [1:0] c = 0;
  wire tick = c == 3, step;
  integer n;
  speed_ctrl dut(.clk(clk), .rst(rst), .faster(faster), .slower(slower), .tick(tick), .step(step));
  always #4 clk = ~clk;
  always @(posedge clk) c <= c + 1;
  task count; begin n = 0; repeat (1280) begin @(posedge clk); #1; if (step) n = n + 1; end end endtask
  initial begin
    #20 rst = 0;
    count; $display("before %0d", n);
    ${button} = 1; repeat (8) @(posedge clk); ${button} = 0;
    count; $display("held 2 ticks %0d", n);
    ${button} = 1; repeat (16) @(posedge clk);
    count; $display("held 4 ticks %0d", n);
    $finish;
  end
endmodule`;
for (const lang of ['vhdl', 'verilog']) {
  for (const [button, steps] of [['faster', 20], ['slower', 5]]) {
    test(`#4377 blinky: speed_ctrl in ${lang}: ${button} held 2 ticks is not taken, held 4 (DEBOUNCE 3) changes the speed`, () => {
      // (the VHDL: the example's file; the Verilog: the chart's)
      const dut = lang === 'vhdl' ? { path: 'speed_ctrl.vhd', text: read('src/speed_ctrl.vhd') } : { path: 'speed_ctrl.v', text: generate(chart(), 'verilog').code };
      const lib = compile([dut, { path: 'tb.v', text: tbTicks(button) }]);
      const design = elaborate(lib, 'tb');
      assert.deepEqual([...lib.errors, ...design.diags].map((d) => d.message), []);
      const sim = new Simulator(design, { waveTail: () => 1 });
      sim.run(1e9);
      assert.deepEqual(sim.log.map((e) => `${e.kind}: ${e.text}`), ['print: before 10', 'print: held 2 ticks 10', `print: held 4 ticks ${steps}`,
        'note: simulation finished ($finish) at 30925 ns']);
    });
  }
}

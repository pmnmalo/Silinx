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

// The buttons' debouncers on a fast clock (#3922): the top gives speed_ctrl DEBOUNCE = CLK_HZ / 50 (20 ms), and its
// counters (cnt_f, cnt_s) must reach DEBOUNCE - 1; with 21 bits (at most 2,097,151) they never did above 104.8 MHz:
// on the Zybo Z7's 125 MHz the buttons did nothing (Vivado removed their logic).
const chart = () => JSON.parse(read('src/speed_ctrl.asm.json'));

test('#3922 blinky: speed_ctrl\'s debounce counters hold CLK_HZ / 50 - 1 on every board, in the chart and its VHDL', () => {
  const widths = Object.fromEntries(chart().registers.filter((r) => /^cnt_/.test(r.name)).map((r) => [r.name, r.width]));
  assert.deepEqual(widths, { cnt_f: 22, cnt_s: 22 });
  for (const n of ['cnt_f', 'cnt_s']) assert.match(read('src/speed_ctrl.vhd'), new RegExp(`signal ${n}, ${n}_next : std_logic_vector\\(21 downto 0\\)`));
  const clocks = BOARDS.map((b) => [b.id, boardGenericValues(resolveBoard(b.id)).CLK_HZ]).filter(([, hz]) => hz);
  assert.ok(clocks.some(([id, hz]) => id === 'zybo-z7' && hz === 125_000_000));
  for (const [id, hz] of clocks) assert.ok(hz / 50 - 1 < 2 ** 22, `${id}: DEBOUNCE ${hz / 50}`);
});

// speed_ctrl at 125 MHz (DEBOUNCE 2,500,000) with a tick every cycle: a step every 2^level cycles, level 5 at reset
// (10 steps in 320 cycles); a button held past 20 ms: faster, level 4 (20 steps), or slower, level 6 (5 steps).
const tb125 = (button) => `module tb;
  reg clk = 0, rst = 1, faster = 0, slower = 0, tick = 1;
  wire step;
  integer n;
  speed_ctrl #(.DEBOUNCE(2500000)) dut(.clk(clk), .rst(rst), .faster(faster), .slower(slower), .tick(tick), .step(step));
  always #4 clk = ~clk;
  task count; begin n = 0; repeat (320) begin @(posedge clk); #1; if (step) n = n + 1; end end endtask
  initial begin
    #20 rst = 0;
    count; $display("before %0d", n);
    ${button} = 1;
    #19990000; count; $display("at 19.99 ms %0d", n);
    #20000; count; $display("after %0d", n);
    $finish;
  end
endmodule`;
for (const lang of ['vhdl', 'verilog']) {
  for (const [button, steps] of [['faster', 20], ['slower', 5]]) {
    test(`#3922 blinky: speed_ctrl in ${lang} at 125 MHz: ${button} held 20 ms changes the speed`, { timeout: 300000 }, () => {
      // (the VHDL: the example's file; the Verilog: the chart's)
      const dut = lang === 'vhdl' ? { path: 'speed_ctrl.vhd', text: read('src/speed_ctrl.vhd') } : { path: 'speed_ctrl.v', text: generate(chart(), 'verilog').code };
      const lib = compile([dut, { path: 'tb.v', text: tb125(button) }]);
      const design = elaborate(lib, 'tb');
      assert.deepEqual([...lib.errors, ...design.diags].map((d) => d.message), []);
      // (only the waveforms' last change kept: no recording limit over 2.5 million cycles)
      const sim = new Simulator(design, { waveTail: () => 1 });
      sim.run(3e10);
      assert.deepEqual(sim.log.map((e) => `${e.kind}: ${e.text}`), ['print: before 10', 'print: at 19.99 ms 10', `print: after ${steps}`,
        'note: simulation finished ($finish) at 20017693 ns']);
    });
  }
}

// Every example's test bench on its Post-Place & Route Simulation Model with its timing (SDF), VHDL and Verilog (#122);
// split from test/sim-model-par.test.js, run beside it (#3124). micro80's, the longest after vga's, in
// test/sim-model-par-micro80.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleTimesim } from './timesim-lib.mjs';
import { EXAMPLES } from './examples-lib.mjs';

// every example's test bench, on the post-place & route model of the example (its generics the test bench's: the
// the longest, in test/sim-model-par-vga.test.js and test/sim-model-par-vga-verilog.test.js: run beside these)
// the longest, in test/sim-model-par-vga.test.js: run beside these)
for (const name of EXAMPLES.filter(n => n !== 'vga' && n !== 'micro80')) {
  test(`example ${name}: its test bench passes on the post-place & route model with its timing (SDF), VHDL and Verilog (#122)`, { timeout: 1800000 }, () => exampleTimesim(name));
}

// #4460: blinky's test bench reads a digit at a rising edge, a whole cycle after the edge that changed the segments. It read
// it at a falling edge, half a cycle (10 ns) after: with speed_ctrl's debounce counters 1 bit wide (what the ASM chart's
// width clog2(DEBOUNCE) gives at the test bench's DEBOUNCE = 2), the design placed so, the segments' clock to pad on the
// model is 10.3 to 11.2 ns, and the test bench read a digit half changed ("digit 0: not a decimal digit"). The netlists
// were right: the post-synthesis models (Spartan-3E, iCE40, ECP5, Gowin) and this model without its SDF passed.
test('example blinky with 1-bit debounce counters: its test bench passes on the post-place & route model with its timing, VHDL and Verilog (#4460)', { timeout: 1800000 }, () =>
  exampleTimesim('blinky', ['vhdl', 'verilog'], {
    edit: (p, text) => {
      if (!/speed_ctrl\.vhd$/.test(p)) return text;
      const t = text.replace(/\(1 downto 0\) := "00"/g, '(0 downto 0) := "0"').replace(/<= "00";/g, '<= "0";');
      assert.deepEqual([t.match(/: std_logic_vector\(0 downto 0\) := "0"/g)?.length, /"00"|1 downto 0/.test(t)], [2, false]);   // (cnt_f, cnt_s)
      return t;
    },
  }));

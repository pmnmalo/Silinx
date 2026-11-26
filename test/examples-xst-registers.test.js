// The examples' registers that ISE's XST would leave unconnected (#5654): a register whose bits feed nothing, or one
// XST moves into the multipliers it feeds but still reads elsewhere, warns Xst:2677 ("Node <…> of sequential type is
// unconnected"), and the examples build in ISE with no warnings. Yosys trims such bits silently, so the open flows'
// tests do not see them: these check the sources. ISE's own runs: test/ise/examples.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';

const read = (f) => fs.readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8');

// stopwatch's to_decimal (#4877 registered its value before the multipliers): one register shared by the three
// multipliers and read for its last 4 bits left x_4 .. x_13 unconnected on the Spartan-3E's and the Spartan-3A's
test('#5654 stopwatch: each register of to_decimal that a multiplier reads is read by that multiplier alone', () => {
  const text = read('stopwatch/src/to_decimal.vhd').replace(/--.*$/gm, '');
  const body = text.slice(text.indexOf('rising_edge'));
  const operands = [...body.matchAll(/quotient\((\w+),/g)].map((m) => m[1]);
  assert.deepEqual(operands, ['x1', 'x2', 'x3']);
  for (const x of operands) {
    assert.match(body, new RegExp(`\\b${x} <= value;`), x);   // the value, registered whole
    assert.equal(body.match(new RegExp(`\\b${x}\\b`, 'g')).length, 2, `${x}: written once, read by its multiplier alone`);
  }
  // the value's last 4 bits: a register of their own
  assert.match(body, /\bx0 <= value\(3 downto 0\);/);
  assert.match(body, /\bv {2}<= x0;/);
});

// lock's typed.cpp: a register of the four digits shifted left kept the oldest digit's bits, shifted out at the next
// call (ap_r_digits_12 .. _15 unconnected on every board); its static variable is the last three digits
test('#5654 lock: typed\'s registers, in VHDL and in Verilog: the last three digits (12 bits) and shown\'s', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cToHdl(read('lock/src/typed.cpp'), { file: 'src/typed.cpp', lang });
    assert.deepEqual(r.diagnostics, [], lang);
    const regs = lang === 'vhdl'
      ? [...r.hdl.matchAll(/signal (ap_r_\w+) : unsigned\((\d+) downto 0\)/g)].map((m) => [m[1], +m[2] + 1])
      : [...r.hdl.matchAll(/reg \[(\d+):0\] (ap_r_\w+);/g)].map((m) => [m[2], +m[1] + 1]);
    assert.deepEqual(regs, [['ap_r_clear_reg', 1], ['ap_r_digit_reg', 4], ['ap_r_shown_reg', 16], ['ap_r_last', 12], ['ap_r_shown_vld_reg', 1]], lang);
  }
});

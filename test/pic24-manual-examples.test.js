// The PIC24 emulator (#5480) against the worked examples of Microchip's 16-bit MCU and DSC Programmer's Reference
// Manual (DS70000157G, section 5): each PIC24F instruction page's examples, their registers and memory before and
// after, transcribed in test/fixtures/pic24-manual-examples.json (their instructions as written, a page's addresses
// as .org; a page's labels the example does not define bound to the PC it ends at). Each is assembled at its address,
// run (to its PC after, or out of its code), and every register and word the manual shows after is compared.
//
// The manual's own mistakes, each checked by hand from its operands, are its `errata`: the value it should have
// shown, and why (an XOR's result, a flag the operation must set). And the DC flag after a subtraction (SUB, SUBB,
// SUBR, SUBBR, CP, CPB, CP0, DEC, DEC2, NEG) is not compared: the examples disagree with one another on it (SUB.B
// #0x23, W0 and SUBB.B #0x23, W0 with W0 = 0x7804 show DC clear and set though their low digits borrow alike), the
// emulator keeps the adder's carry polarity (as C), and MPLAB X's simulator settles it (#5483).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpuWith, get, set, hex4 } from './pic24-lib.mjs';
import { implemented } from '../packages/silinx-pic24/src/decode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/pic24-manual-examples.json'), 'utf8'));
const NO_DC = /^(SUB|SUBB|SUBR|SUBBR|CP|CPB|CP0|DEC|DEC2|NEG):/;

// an example's symbols: its rows' RAMnnn at 0x1000 + 2n, and its labels not defined (to its PC after)
function assemble(e) {
  const symbols = {};
  for (const k of [...Object.keys(e.before), ...Object.keys(e.after)]) if (/^RAM\d+$/.test(k)) symbols[k] = 0x1000 + 2 * parseInt(k.slice(3), 10);
  for (const [k, v] of Object.entries(e.symbols ?? {})) symbols[k] = parseInt(v, 16);
  const org = /^\.org (0x[0-9A-F]+)$/i.exec(e.code[0] ?? ''), at = org ? parseInt(org[1], 16) : e.before.PC ? parseInt(e.before.PC, 16) : 0x1000;
  for (let i = 0; ; i++) {
    try { return { ...cpuWith(e.code, { org: at, symbols }), symbols, at }; } catch (x) {
      const m = /unknown symbol: (\w+)/.exec(x.message);
      if (!m || !e.after.PC || i > 4) throw x;
      symbols[m[1]] = parseInt(e.after.PC, 16);
    }
  }
}

function runExample(e) {
  const { cpu, symbols, at, end } = assemble(e);
  const key = (k) => (k in symbols ? symbols[k] : k);
  for (const [k, v] of Object.entries(e.before)) if (k !== 'PC') set(cpu, key(k), parseInt(v, 16));
  if (e.after.PC) { const to = parseInt(e.after.PC, 16); let n = 0; do cpu.step(); while (cpu.pc !== to && ++n < 1000); }
  else for (let n = 0; cpu.pc >= at && cpu.pc < end && n < 1000; n++) cpu.step();
  const after = { ...e.after, ...(e.errata?.after ?? {}) }, bad = [];
  for (const [k, v] of Object.entries(after)) {
    const mask = k === 'SR' && NO_DC.test(e.instruction) ? 0xfeff : 0xffffff;
    const got = get(cpu, key(k));
    if ((got & mask) !== (parseInt(v, 16) & mask)) bad.push(`${k} ${hex4(got)}, not ${v}`);
  }
  for (const l of cpu.log) bad.push(`said: ${l.text}`);
  return bad;
}

// the examples the opcode map covers (each of its instructions' top bytes implemented)
const covered = EXAMPLES.filter((e) => {
  try { const { cpu, at, end } = assemble(e); return [...cpu.prog.subarray(at >> 1, end >> 1)].every((w) => implemented(w >>> 16)); } catch { return false; }
});

test('#5480 the manual\'s worked examples: the registers and memory after each, as DS70000157 shows them (its errata as checked)', () => {
  assert.equal(EXAMPLES.length, 228);
  assert.equal(covered.length, 121);   // (the ALU's and the moves': the bit, shift, multiply, divide and flow instructions next)
  const bad = [];
  for (const e of covered) {
    const b = runExample(e);
    if (b.length) bad.push(`${e.instruction} | ${e.code.join(' ; ')} | ${b.join(', ')}`);
  }
  assert.deepEqual(bad, []);
});

test('#5480 the manual\'s errata: each one\'s value differs from the manual\'s, with its reason', () => {
  const errata = EXAMPLES.filter((e) => e.errata);
  assert.equal(errata.length, 18);
  // (each covered one's correction run in the test above)
  for (const e of errata) {
    assert.ok(e.errata.why.length > 10, e.code.join(' ; '));
    for (const [k, v] of Object.entries(e.errata.after)) assert.notEqual(v, e.after[k], `${e.code.join(' ; ')}: ${k}`);
  }
});

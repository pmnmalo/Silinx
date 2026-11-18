// The functions inside an IC with no gates (core/circuit-inside-blocks.js, #4508), for every such IC of the library and
// every KiCad catalogue's part that behaves as one (it takes the library IC's definition, core/circuit-kicad.js): a box a
// unit of a dual or quad flip-flop, latch or decoder, else one box; every signal pin's line straight from its pin to its
// box's edge, inside the package, through no other box; no two boxes overlapping; each pin's name in its box, a clock's
// ▷ (falling: its bubble), an active-low input's bubble; IEC's labels and qualifier. Which ICs have no drawing inside at
// all (their pins named) is printed, and checked to be only #4505's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { CATALOGUE } from '../core/kicad-catalogue.js';
import { blocksLayout, isClock, qualifierOf } from '../core/circuit-inside-blocks.js';
import { insideLayout } from '../core/circuit-inside.js';

const P = 20;
const pinsOf = (d) => d.pins.map((q) => ({ n: q.n, x: q.dx * P, y: q.dy * P }));
const ICS = PART_ORDER.filter((t) => PARTS[t].kind === 'ic').map((t) => PARTS[t]);
const BLOCK_ICS = ICS.filter((d) => !d.gates);
const signal = (d) => d.pins.filter((p) => !['vcc', 'gnd', 'nc'].includes(p.dir));

test('#4508 every IC with no gates: its boxes, each signal pin\'s line straight into one, inside the package, no box over another or over a line', () => {
  assert.ok(BLOCK_ICS.length >= 48, `${BLOCK_ICS.length} ICs`);
  for (const d of BLOCK_ICS) {
    const pins = pinsOf(d), at = new Map(pins.map((q) => [q.n, q])), ys = pins.map((q) => q.y), xs = pins.map((q) => q.x);
    const L = blocksLayout(d, pins);
    assert.ok(L?.boxes.length, d.type);
    // (each signal pin in one box; a supply pin in one at most, the one over it)
    const boxed = L.boxes.flatMap((b) => b.pins.map((p) => p.n));
    assert.deepEqual(signal(d).map((p) => p.n).sort((a, b) => a - b), boxed.filter((n) => !['vcc', 'gnd'].includes(d.pins.find((p) => p.n === n).dir)).sort((a, b) => a - b), d.type);
    assert.equal(new Set(boxed).size, boxed.length, `${d.type}: a pin in two boxes`);
    assert.equal(L.wires.length, boxed.length, d.type);
    for (const b of L.boxes) {
      assert.ok(b.x >= Math.min(...xs) - 8 && b.x + b.w <= Math.max(...xs) + 8 && b.y >= Math.min(...ys) + 7 && b.y + b.h <= Math.max(...ys) - 7, `${d.type}: box ${b.unit} inside the package`);
      for (const o of L.boxes) if (o !== b) assert.ok(b.x + b.w <= o.x || o.x + o.w <= b.x || b.y + b.h <= o.y || o.y + o.h <= b.y, `${d.type}: boxes ${b.unit} and ${o.unit} overlap`);
    }
    for (const w of L.wires) {
      const q = at.get(w.pin), b = L.boxes[w.box], [a, e] = w.points;
      assert.deepEqual(a, [q.x, q.y], `${d.type} pin ${w.pin}: from its pin`);
      assert.ok(e[0] === q.x && (e[1] === b.y || e[1] === b.y + b.h) && e[0] >= b.x && e[0] <= b.x + b.w, `${d.type} pin ${w.pin}: straight into its box's edge`);
      for (const o of L.boxes) if (o !== b) assert.ok(!(q.x > o.x && q.x < o.x + o.w && Math.min(a[1], e[1]) < o.y + o.h && Math.max(a[1], e[1]) > o.y), `${d.type} pin ${w.pin}: through box ${o.unit}`);
    }
  }
});

test('#4508 the units: a dual or quad flip-flop\'s, latch\'s, decoder\'s; the 7474 as its datasheet, its clocks, its bubbles; IEC\'s labels', () => {
  const units = Object.fromEntries(BLOCK_ICS.map((d) => [d.type, blocksLayout(d, pinsOf(d)).boxes.map((b) => b.unit)]));
  // (the library's at #4508; an IC added since, #4440's dual counters, checked by the rules above)
  const UNITS = { 74139: 2, 7474: 2, 7476: 2, 74112: 2, 7473: 2, 74107: 2, 74109: 2, 74113: 2, 4013: 2, 4027: 2, 74375: 4, 74279: 4 };
  for (const [t, n] of Object.entries(UNITS)) assert.deepEqual(units[t], Array.from({ length: n }, (_, i) => i + 1), t);
  for (const t of ['7478', '74114', '7475', '7477', '74161', '74174', '74374', '74138', '7485']) assert.deepEqual(units[t], [null], t);
  // (the others one box: a counter's, a register's, an MSI IC's; or units sharing their pins, the 7478's clock, the 7475's enables)
  for (const [t, u] of Object.entries(units)) if (u[0] === null) assert.equal(u.length, 1, t);
  const L = blocksLayout(PARTS['7474'], pinsOf(PARTS['7474']));
  // unit 1 along pins 1–6 below, unit 2 along 8–13 above, each half the body's height
  assert.deepEqual(L.boxes.map((b) => [b.unit, b.x, b.y, b.w, b.h]), [[1, -7, -28, 114, 16], [2, 13, -48, 114, 16]]);
  assert.deepEqual(L.boxes[0].pins.map((p) => [p.n, p.name, p.iec, p.edge, p.clock, p.low]), [
    [1, 'CLR̅', 'R', 'bottom', false, true], [2, 'D', '1D', 'bottom', false, false], [3, 'CLK', 'C1', 'bottom', true, false], [4, 'PRE̅', 'S', 'bottom', false, true],
    [5, 'Q', '', 'bottom', false, false], [6, 'Q̅', '', 'bottom', false, false]]);
  assert.equal(L.boxes[0].pins.find((p) => p.clock).falling, false);
  // the 7476's clocks on falling edges; its VCC (pin 5) between its units, under the second
  const J = blocksLayout(PARTS['7476'], pinsOf(PARTS['7476']));
  assert.deepEqual(J.boxes.map((b) => b.pins.filter((p) => p.clock).map((p) => [p.name, p.falling])), [[['CLK', true]], [['CLK', true]]]);
  assert.deepEqual(J.boxes.map((b) => b.pins.filter((p) => !p.clock && /VCC|GND/.test(p.name)).map((p) => p.name)), [['GND'], ['VCC']]);
  // (a dual decoder's units: X/Y each; a flip-flop's none)
  assert.deepEqual(blocksLayout(PARTS['74139'], pinsOf(PARTS['74139'])).boxes.map((b) => b.qualifier), ['X/Y', 'X/Y']);
  assert.deepEqual(L.boxes.map((b) => b.qualifier), ['', '']);
  // a counter: one box, its pins' names as the datasheet's, IEC's qualifier CTR
  const C = blocksLayout(PARTS['74161'], pinsOf(PARTS['74161']));
  assert.deepEqual(C.boxes.map((b) => [b.unit, b.qualifier, b.pins.length]), [[null, 'CTR', 16]]);
  assert.deepEqual(C.boxes[0].pins.filter((p) => p.clock || p.low).map((p) => p.name), ['CLR̅', 'CLK', 'LOAD̅']);
  assert.deepEqual([qualifierOf('8-bit serial in, parallel out shift register'), qualifierOf('3-to-8 line decoder'), qualifierOf('8-to-1 line multiplexer'), qualifierOf('4-bit binary full adder'),
    qualifierOf('4-bit magnitude comparator'), qualifierOf('Octal D flip-flop, 3-state outputs (rising edge)'), qualifierOf('BCD to 7-segment decoder/driver, active high')], ['SRG', 'X/Y', 'MUX', 'Σ', 'COMP', 'RG', 'BCD/7SEG']);
  assert.deepEqual(['CLK', '1CLK', 'CKA', 'SRCLK', 'RCLK', 'UP', 'DOWN', 'CLK INH', 'C', 'LE', 'CLR̅'].map(isClock), [true, true, true, true, true, true, true, false, false, false, false]);
  // (a gate IC: none here)
  assert.equal(blocksLayout(PARTS['7400'], pinsOf(PARTS['7400'])), null);
});

test('#4508 every IC of the library and every KiCad catalogue\'s part that behaves: drawn inside, no IC left with its pins named only (#4505)', (t) => {
  const drawn = (d) => (d.gates ? insideLayout(d, pinsOf(d)).gates.length > 0 : !!blocksLayout(d, pinsOf(d))?.boxes.length);
  const named = ICS.filter((d) => !drawn(d)).map((d) => d.type);
  t.diagnostic(`pins named only (#4505): ${named.join(' ')}`);
  assert.deepEqual(named, []);
  // (a KiCad part that behaves as a library IC takes its definition: its drawing)
  const kicad = CATALOGUE.filter((e) => e.as && PARTS[e.as]?.kind === 'ic');
  assert.ok(kicad.length > 100, `${kicad.length} KiCad parts`);
  assert.deepEqual(kicad.filter((e) => !drawn(PARTS[e.as]) && !named.includes(e.as)).map((e) => e.id), []);
  t.diagnostic(`KiCad parts behaving as an IC drawn inside: ${kicad.filter((e) => drawn(PARTS[e.as])).length} of ${kicad.length}`);
});

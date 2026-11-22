// The usability tests' own logic (#5148, test/usability/lib/): the seeded generator, the shrinking of a failing sequence,
// and the schematic's invariants on drawings made for each (a wire's end on nothing, a net name's stub, a wire come off
// its pin, a diagonal, overlapping symbols, the junction dots, the nets, the HDL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prng, seeds, shrink } from './usability/lib/random.js';
import { danglingEnds, detachedEnds, badSegments, overlaps, junctionPoints, nets, schInvariants, hdlErrors } from './usability/lib/sch-invariants.js';
import { newDoc, normalizeDoc } from '../core/schdoc.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
// U1 at (80, 90): I (80, 100), O (160, 100); U2 at (300, 90): I (300, 100), O (380, 100)
function two() {
  const d = newDoc('two', 'vhdl');
  d.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 300, 90));
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 40, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 440, y: 100 });
  d.wires.push({ id: 'W1', points: [P(40, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(300, 100)] }, { id: 'W3', points: [P(380, 100), P(440, 100)] });
  return normalizeDoc(d);
}

test('usability: the seeded generator: the same numbers from a seed on every machine, others from another; int, pick, weighted', () => {
  const a = prng(8), b = prng(8), c = prng(9);
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(Array.from({ length: 5 }, () => b.next()), xs);
  assert.notDeepEqual(Array.from({ length: 5 }, () => c.next()), xs);
  // (mulberry32's first number of seed 1, as its reference implementation gives it)
  assert.equal(prng(1).next(), 0.6270739405881613);
  const r = prng(3);
  for (let i = 0; i < 200; i++) { const n = r.int(-3, 3); assert.ok(Number.isInteger(n) && n >= -3 && n <= 3); }
  assert.equal(r.pick([]), undefined);
  const w = prng(4), count = { a: 0, b: 0 };
  for (let i = 0; i < 1000; i++) count[w.weighted([{ k: 'a', weight: 9 }, { k: 'b', weight: 1 }]).k]++;
  assert.ok(count.a > 800 && count.b > 50, JSON.stringify(count));
});

test('usability: the seeds: the fixed ones and the week\'s, or SILINX_USABILITY_SEED\'s alone', () => {
  const day = 864e5, t = Date.UTC(2026, 10, 22);
  const saved = process.env.SILINX_USABILITY_SEED;
  delete process.env.SILINX_USABILITY_SEED;
  try {
    assert.deepEqual(seeds([1, 2], t), [1, 2, Math.floor(t / (7 * day))]);
    assert.deepEqual(seeds([1, 2], t + day).at(-1), seeds([1, 2], t).at(-1), 'the same week');
    assert.notEqual(seeds([], t + 7 * day)[0], seeds([], t)[0], 'the next week');
    process.env.SILINX_USABILITY_SEED = '2968';
    assert.deepEqual(seeds([1, 2], t), [2968]);
  } finally {
    if (saved == null) delete process.env.SILINX_USABILITY_SEED; else process.env.SILINX_USABILITY_SEED = saved;
  }
});

test('usability: a failing sequence shrunk to the steps that still fail; a sequence that fails at once kept; the time bounded', async () => {
  // it fails when 'b' comes after 'a' (with anything between)
  const fails = (l) => { const i = l.indexOf('a'); return i >= 0 && l.indexOf('b', i) > i; };
  assert.deepEqual(await shrink(['x', 'a', 'y', 'z', 'b', 'w'], async (l) => fails(l)), ['a', 'b']);
  assert.deepEqual(await shrink(['a', 'b'], async (l) => fails(l)), ['a', 'b']);
  let tries = 0;
  assert.deepEqual(await shrink(['x', 'a', 'b'], async (l) => { tries++; return fails(l); }, { ms: -1 }), ['x', 'a', 'b'], 'no time: as it was');
  assert.equal(tries, 0);
});

test('usability: the schematic\'s invariants: a sound drawing holds them all, its nets, its HDL in VHDL and Verilog', () => {
  const d = two();
  assert.deepEqual(schInvariants(d), {});
  assert.deepEqual(danglingEnds(d), []);
  assert.deepEqual(nets(d), ['U1.I port:a', 'U1.O U2.I', 'U2.O port:y']);
  assert.deepEqual(hdlErrors(d), []);
  // the gates example as shipped
  const gates = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/gates/src/gates.sch.json'), 'utf8'));
  assert.deepEqual(schInvariants(gates), {});
  assert.deepEqual(danglingEnds(gates), [], 'its net names\' stubs are no loose ends');
  assert.equal(nets(gates).length, 22);
});

test('usability: the schematic\'s invariants: a loose end, a wire come off its pin, a diagonal, overlapping symbols said', () => {
  const d = two();
  // W2 ends 10 short of U2's input: a loose end, and a wire come off its pin since the drawing before
  const e = structuredClone(d);
  e.wires[1].points[1] = P(290, 100);
  assert.deepEqual(danglingEnds(e).map((x) => x.text), ["wire W2's end (290, 100) on nothing"]);
  assert.deepEqual(detachedEnds(d, e), ["wire W2's last end came off its pin"]);
  assert.deepEqual(detachedEnds(d, e, { except: ['W2'] }), [], 'a wire the step may free');
  // a net name on it: no loose end (its net joined by its name)
  e.labels.push({ id: 'L1', x: 200, y: 100, net: 'n' });
  assert.deepEqual(danglingEnds(e), []);
  // a diagonal, a segment of no length
  const f = structuredClone(d);
  f.wires[1].points = [P(160, 100), P(160, 100), P(300, 120)];
  assert.deepEqual(badSegments(f), ['wire W2: a segment of no length at (160, 100)', 'wire W2: a diagonal segment (160, 100) to (300, 120)']);
  // U2 dropped onto U1
  const g = structuredClone(d);
  g.symbols[1].x = 100;
  assert.deepEqual(overlaps(g), ['symbols U1 and U2 overlap']);
  assert.ok(Object.keys(schInvariants(g)).includes('overlapping symbols'));
});

test('usability: the junction dots: where three branches meet, wires\' and a pin\'s; none where two wires only meet or cross', () => {
  const d = two();
  assert.deepEqual(junctionPoints(d), []);
  // a T on W2 at (230, 100) down to (230, 160): a dot there
  d.wires.push({ id: 'W4', points: [P(230, 100), P(230, 160)] });
  assert.deepEqual(junctionPoints(d), ['230,100']);
  // a second wire on U1's output pin: the pin and two wires, a dot
  d.wires.push({ id: 'W5', points: [P(160, 100), P(160, 160)] });
  assert.deepEqual(junctionPoints(d), ['160,100', '230,100']);
  // a wire crossing W2 (no vertex there): no dot
  d.wires.push({ id: 'W6', points: [P(260, 60), P(260, 140)] });
  assert.deepEqual(junctionPoints(d), ['160,100', '230,100']);
});

test('usability: the circuit\'s invariants: the breadboard example holds them; a wire come off, a loose end, a short said', async () => {
  const { circInvariants, circDangling, circDetached, circNets, circHdlErrors, circDiagnostics } = await import('./usability/lib/circ-invariants.js');
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/breadboard/src/breadboard.circ.json'), 'utf8'));
  assert.deepEqual(circInvariants(m), {});
  assert.deepEqual(circDangling(m), []);
  assert.deepEqual(circDiagnostics(m), []);
  assert.deepEqual(circHdlErrors(m), []);
  assert.equal(circNets(m).length, 30);
  // U2's VCC wire (w11: its pin 14 at (19, 4) to the + rail) moved off the board: its end on nothing, come off its pin
  const e = structuredClone(m);
  e.wires.find((w) => w.id === 'w11').points[0] = [19, 30];
  assert.deepEqual(circDangling(e).map((x) => x.text), ["wire w11's end (19, 30) on nothing"]);
  assert.deepEqual(circDetached(m, e), ["wire w11's first end came off its pin"]);
  assert.deepEqual(circDetached(m, e, { except: ['w11'] }), []);
  assert.deepEqual(Object.keys(circInvariants(e)), ['errors'], 'U2 not powered');
  // the top rails' + and − joined: a short circuit, an error
  const f = structuredClone(m);
  f.wires.push({ id: 'w99', points: [[10, -4], [10, -3]] });
  assert.match(circInvariants(f).errors[0], /^error: Short circuit: the supply's \+ and − are joined/);
});

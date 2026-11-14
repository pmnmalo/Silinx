// The digital circuits (#3897, docs/CIRCUITS.md): the parts' pinouts (their datasheets'), each IC's gates against its
// truth table (written here, independently of core/circuit-parts.js), the breadboard's strips, the nets, the live
// simulation (the delays, inertial; a ring oscillator; an unpowered IC, a floating input, a button, a short) and the
// check's exact errors and warnings; the edits' results and messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, partPins, gateValue, readInput, breadboardHoles } from '../core/circuit-parts.js';
import { normalizeCircuit, newCircuit, circuitPorts, circuitCounts, isCircuit } from '../core/circuit.js';
import { circuitNets } from '../core/circuit-net.js';
import { createCircuitSim, runMessages } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { pointOf, addPart, addWire, movePart, rotatePart, deleteItem, setPartProps } from '../core/circuit-edit.js';
import { halfAdder, icBench } from './circuit-helpers.mjs';

// the datasheets' pinouts: pin 1 to 14
const PINOUT = {
  7400: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
  7404: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
};
PINOUT[7408] = PINOUT[7432] = PINOUT[7486] = PINOUT[7400];
// the truth tables: the inputs' bits → the output
const TRUTH = {
  7400: { '00': '1', '01': '1', 10: '1', 11: '0' },
  7404: { 0: '1', 1: '0' },
  7408: { '00': '0', '01': '0', 10: '0', 11: '1' },
  7432: { '00': '0', '01': '1', 10: '1', 11: '1' },
  7486: { '00': '0', '01': '1', 10: '1', 11: '0' },
};
const DELAY = { 7400: 10, 7404: 10, 7408: 10, 7432: 14, 7486: 12 };
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };

test('the ICs\' pinouts are their datasheets\': pin 1 lower left, VCC 14, GND 7; a 14-pin DIP straddles the channel', () => {
  for (const [type, names] of Object.entries(PINOUT)) {
    const d = PARTS[type];
    assert.deepEqual(d.pins.map((p) => p.name), names, type);
    assert.equal(d.chip, `SN74LS${type.slice(2)}`);
    assert.equal(d.tpd, DELAY[type]);
    // pins 1–7 left to right at y 0, 8–14 right to left 3 steps above (rows f and e)
    assert.deepEqual(partPins({ type, x: 4, y: 7 }).map((p) => [p.n, p.x, p.y]), Array.from({ length: 14 }, (_, i) => (i < 7 ? [i + 1, 4 + i, 7] : [i + 1, 4 + 13 - i, 4])));
  }
  // turned a quarter clockwise: pin 2 below pin 1, pin 14 to its right
  const t = partPins({ type: '7400', x: 0, y: 0, rot: 1 });
  assert.deepEqual([t[1], t[13]].map((p) => [p.x, p.y]), [[0, 1], [3, 0]]);
});

test('each IC\'s gates against its truth table: every combination, every gate on its own, through the engine', () => {
  for (const type of Object.keys(TRUTH)) {
    const m = circuitBench(type);
    assert.deepEqual(checkCircuit(m), [], `${type}: a clean bench`);
    const sim = createCircuitSim(m);
    const gates = PARTS[type].gates;
    const width = gates[0].ins.length;
    // each combination on every gate at once, then random ones (each gate its own)
    const vectors = [...Object.keys(TRUTH[type]).map((bits) => gates.map(() => bits)),
      ...Array.from({ length: 24 }, () => gates.map(() => (rnd() % (1 << width)).toString(2).padStart(width, '0')))];
    for (const v of vectors) {
      v.forEach((bits, i) => [...bits].forEach((b, j) => sim.set(`S${i + 1}${'ab'[j]}`, b === '1')));
      const r = sim.run();
      assert.equal(r.quiet, true);
      assert.deepEqual(Object.values(sim.outputs()), v.map((bits) => TRUTH[type][bits]), `${type} ${v.join(' ')}`);
    }
  }
});
const circuitBench = (type) => icBench(type);

test('the gates\' logic with unknowns, as std_logic_1164\'s; a floating input reads high on a 74LS, X on a 4000', () => {
  assert.equal(gateValue('nand', ['0', 'X']), '1');
  assert.equal(gateValue('nand', ['1', 'X']), 'X');
  assert.equal(gateValue('and', ['X', '0']), '0');
  assert.equal(gateValue('or', ['X', '1']), '1');
  assert.equal(gateValue('or', ['X', '0']), 'X');
  assert.equal(gateValue('xor', ['X', '0']), 'X');
  assert.equal(gateValue('not', ['X']), 'X');
  assert.equal(gateValue('nor', ['0', '0']), '1');
  assert.throws(() => gateValue('nope', ['0']), /no gate function 'nope'/);
  assert.deepEqual(['0', '1', 'Z', 'X'].map((l) => readInput('ttl', l)), ['0', '1', '1', 'X']);
  assert.deepEqual(['0', '1', 'Z', 'X'].map((l) => readInput('cmos', l)), ['0', '1', 'X', 'X']);
});

test('a breadboard: a column\'s a–e one strip, its f–j another, the rails along the board', () => {
  const holes = breadboardHoles();
  assert.equal(holes.length, 30 * 14);
  const strip = (n) => holes.find((h) => h.name === n).strip;
  assert.equal(strip('a1'), strip('e1'));
  assert.notEqual(strip('e1'), strip('f1'));
  assert.equal(strip('f1'), strip('j1'));
  assert.notEqual(strip('a1'), strip('a2'));
  assert.equal(strip('tp1'), strip('tp30'));
  assert.notEqual(strip('tp1'), strip('tn1'));
  assert.notEqual(strip('tn1'), strip('bn1'));   // (the two − rails: joined by a wire, as on the bench)
  // pins on the same strip are one net; on two columns, two nets; wires join their ends only, not where they cross
  const m = newCircuit('x');
  m.parts.push({ id: 'D1', type: 'led', x: 0, y: 0 }, { id: 'D2', type: 'led', x: 0, y: 4 }, { id: 'D3', type: 'led', x: 5, y: 7 });
  m.wires.push({ id: 'wa', points: [[1, 1], [5, 9]], color: 'red' }, { id: 'wb', points: [[3, -10], [3, 20]], color: 'red' });
  const n = circuitNets(normalizeCircuit(m));
  assert.equal(n.pinNet.get('D1.1'), n.pinNet.get('D2.1'), 'a1 and a5: one strip');
  assert.equal(n.pinNet.get('D1.2'), n.pinNet.get('D2.2'));
  assert.notEqual(n.pinNet.get('D1.1'), n.pinNet.get('D1.2'));
  assert.equal(n.pinNet.get('D1.2'), n.pinNet.get('D3.1'), 'b2 to h6 by the wire wa');
  assert.notEqual(n.pinNet.get('D3.1'), n.pinNet.get('D3.2'));
});

test('the half adder on its breadboard: no errors, no warnings; its ports, counts, nets; simulated', () => {
  const m = halfAdder();
  assert.deepEqual(checkCircuit(m), []);
  assert.deepEqual(circuitPorts(m), { inputs: [{ name: 'a', part: 'S1', type: 'logic-switch', index: 0, kind: 'level' }, { name: 'b', part: 'S2', type: 'logic-switch', index: 0, kind: 'level' }],
    outputs: [{ name: 's', part: 'D1', type: 'led', index: 0 }, { name: 'c', part: 'D2', type: 'led', index: 0 }] });
  assert.equal(circuitCounts(m), '2 IC(s) · 2 input(s) · 2 display(s) · 15 wire(s)');
  assert.equal(isCircuit('src/ha.circ.json'), true);
  assert.equal(isCircuit('src/ha.pn.json'), false);
  const sim = createCircuitSim(m);
  assert.deepEqual(sim.run(), { quiet: true, time: 12, start: 0, oscillating: [] });
  assert.equal(sim.powered('U1'), true);
  const got = [];
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    sim.set('S1', a); sim.set('S2', b);
    sim.run();
    got.push(`${a}${b}:${sim.outputs().s}${sim.outputs().c}`);
  }
  assert.deepEqual(got, ['00:00', '01:10', '10:10', '11:01']);
  assert.deepEqual(sim.leds(), { D1: 'off', D2: 'on' });
  assert.deepEqual(sim.inputs(), { S1: true, S2: true });
  assert.equal(sim.pin('U2', 3), '1');
  assert.equal(sim.pin('U2.3'), '1');
  assert.deepEqual(sim.shorts(), []);
  assert.throws(() => sim.set('U1', true), /U1 is not a switch, a button or a clock of the circuit/);
});

// three inverters of a 7404 in a row (a → 1A, 1Y → 2A, 2Y → 3A, 3Y → the LED); `loop`: 3Y back to 1A (a ring oscillator)
function chain({ loop = false } = {}) {
  const m = icBench('7404');
  const W = (...points) => m.wires.push({ id: `x${m.wires.length}`, points, color: 'green' });
  const pins = new Map(partPins(m.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  // the bench's switches of gates 2 and 3 and its LEDs 1 and 2 removed, their wires too; the chain wired
  m.parts = m.parts.filter((p) => !['S2a', 'S3a', 'S4a', 'S5a', 'S6a', 'D1', 'D2', 'D4', 'D5', 'D6', ...(loop ? ['S1a'] : [])].includes(p.id));
  m.wires = m.wires.filter((w) => w.id === 'w1' || w.id === 'w2' || (!loop && w.id === 'w3') || ['w10', 'w11'].includes(w.id));
  W(pins.get(2), pins.get(3)); W(pins.get(4), pins.get(5));
  if (loop) W(pins.get(6), [-2, 0], pins.get(1));
  return normalizeCircuit(m);
}

test('the delays: three 7404 inverters in a row take 30 ns; a pulse shorter than a gate\'s delay does not get through', () => {
  const m = chain();
  assert.deepEqual(m.parts.map((p) => p.id), ['U1', 'P1', 'S1a', 'D3']);
  assert.deepEqual(checkCircuit(m), []);
  const sim = createCircuitSim(m);
  sim.run();
  assert.equal(sim.outputs().g3y, '1', 'a 0 inverted three times');
  const t0 = sim.time;
  sim.set('S1a', true);
  const r = sim.run();
  assert.equal(r.time - t0, 30);
  assert.equal(sim.outputs().g3y, '0');
  // an AND of a and not a: on a's rise, a pulse of one inverter's delay (10 ns) after the AND's (10 ns)
  const g = icBench('7408');
  const inv = { id: 'U2', type: '7404', x: 0, y: 10 };
  g.parts.push(inv);
  const ip = new Map(partPins(inv).map((q) => [q.n, [q.x, q.y]]));
  const ap = new Map(partPins(g.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  g.parts = g.parts.filter((p) => p.id !== 'S1b');
  g.wires = g.wires.filter((w) => w.id !== 'w4');
  g.wires.push({ id: 'y1', points: [[-20, -20], ip.get(14)], color: 'red' }, { id: 'y2', points: [[-20, -19], ip.get(7)], color: 'black' },
    { id: 'y3', points: [[-40, 0], ip.get(1)], color: 'green' }, { id: 'y4', points: [ip.get(2), ap.get(2)], color: 'green' });
  const gm = normalizeCircuit(g);
  const out = circuitNets(gm).pinNet.get('U1.3');
  const seen = [];
  const s2 = createCircuitSim(gm, { onLevel: (net, level, time) => { if (net === out) seen.push(`${time}:${level}`); } });
  s2.run();
  const t1 = s2.time;
  s2.set('S1a', true);
  s2.run();
  assert.deepEqual(seen, ['0:X', '10:0', `${t1 + 10}:1`, `${t1 + 20}:0`], 'X at power-on, then the AND\'s glitch, 10 ns wide');
  // the same with a 7486 (12 ns): the 10 ns window is shorter than its delay, nothing gets through
  const x = normalizeCircuit({ ...gm, parts: gm.parts.map((p) => (p.id === 'U1' ? { ...p, type: '7486' } : p)) });
  const seenX = [];
  const s3 = createCircuitSim(x, { onLevel: (net, level, time) => { if (net === out) seenX.push(`${time}:${level}`); } });
  s3.run();
  s3.set('S1a', true);
  s3.run();
  assert.deepEqual(seenX, ['0:X', '22:1'], 'only its first value, once its inverter\'s input is known');
});

// a gated ring oscillator: a 7400's NAND (1A the switch en, 1B the loop) and two 7404 inverters, 2Y back to 1B, on an LED
function ring() {
  const m = newCircuit('ring', 'vhdl', { breadboard: false });
  const nand = { id: 'U1', type: '7400', x: 0, y: 0 }, inv = { id: 'U2', type: '7404', x: 0, y: 10 };
  m.parts.push(nand, inv, { id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'S1', type: 'logic-switch', x: -30, y: 0, label: 'en' }, { id: 'D1', type: 'led', x: 20, y: 20, label: 'blink' });
  const a = new Map(partPins(nand).map((q) => [q.n, [q.x, q.y]])), b = new Map(partPins(inv).map((q) => [q.n, [q.x, q.y]]));
  const W = (...points) => m.wires.push({ id: `w${m.wires.length + 1}`, points, color: 'green' });
  W([-20, -20], a.get(14)); W([-20, -19], a.get(7)); W([-20, -20], b.get(14)); W([-20, -19], b.get(7));
  W([-30, 0], a.get(1)); W(a.get(3), b.get(1)); W(b.get(2), b.get(3)); W(b.get(4), [8, 5], a.get(2)); W(b.get(4), [20, 20]); W([21, 20], [-20, -19]);
  return normalizeCircuit(m);
}

test('a ring oscillator: three inverting gates in a loop oscillate once enabled, said in the console; at power-on, X', () => {
  const m = ring();
  assert.deepEqual(checkCircuit(m), []);
  const sim = createCircuitSim(m);
  assert.equal(sim.run().quiet, true, 'disabled: the NAND\'s 1, the loop at rest');
  assert.equal(sim.outputs().blink, '1');
  const blink = circuitNets(m).pinNet.get('D1.1');
  const t = [];
  const s2 = createCircuitSim(m, { onLevel: (net, level, time) => { if (net === blink) t.push(time); } });
  s2.run();
  const t0 = s2.time;
  s2.set('S1', true);
  const r = s2.run();
  assert.equal(r.quiet, false);
  assert.equal(r.time, t0 + 1000);
  // a half period of three delays (10 + 10 + 10 ns)
  const edges = t.filter((x) => x > t0);
  assert.equal(edges[0] - t0, 30);
  assert.deepEqual(edges.slice(1, 5).map((x, i) => x - edges[i]), [30, 30, 30, 30]);
  assert.deepEqual(r.oscillating.length, 3, 'the loop\'s three nets');
  const msg = runMessages(s2, r);
  assert.equal(msg.length, 1);
  assert.match(msg[0], new RegExp(`^WARNING: The circuit oscillates: still changing 1000 ns after ${t0} ns \\(.*U2 pin 4 \\(2Y\\).*\\)$`));
  // three inverters with no gate: they start unknown (as the generated HDL), and stay so
  const x = createCircuitSim(chain({ loop: true }));
  assert.equal(x.run().quiet, true);
  assert.equal(x.pin('U1.2'), 'X');
});

test('an unpowered IC drives nothing; a floating 74LS input reads high; a button to GND; a short while a button is pressed', () => {
  // no supply wired: its outputs float, the LEDs stay off; its errors
  const off = icBench('7404', { power: false });
  const sim = createCircuitSim(off);
  sim.run();
  assert.equal(sim.powered('U1'), false);
  assert.equal(sim.pin('U1.2'), 'Z');
  assert.deepEqual(Object.values(sim.outputs()), ['0', '0', '0', '0', '0', '0']);
  assert.deepEqual(checkCircuit(off).filter((d) => d.severity === 'error').map((d) => d.message), ['U1 (7404) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −']);
  // 1A left floating: 1Y is 0 (it reads high), warned
  const fl = icBench('7404');
  fl.parts = fl.parts.filter((p) => p.id !== 'S1a');
  fl.wires = fl.wires.filter((w) => w.id !== 'w3');
  const f = normalizeCircuit(fl);
  assert.deepEqual(checkCircuit(f), [{ severity: 'warning', message: 'U1 pin 1 (1A) is floating: a 74LS input reads high', ref: { kind: 'part', id: 'U1' } }]);
  const fs = createCircuitSim(f);
  fs.run();
  assert.equal(fs.outputs().g1y, '0');
  // a button from 1A to GND: released, 1A floats (high, 1Y 0); pressed, 1A is 0 (1Y 1)
  const pins = new Map(partPins(f.parts[0]).map((q) => [q.n, [q.x, q.y]]));
  const b = normalizeCircuit({ ...f, parts: [...f.parts, { id: 'B1', type: 'button', x: -10, y: 0, label: 'go' }],
    wires: [...f.wires, { id: 'v1', points: [[-10, 0], pins.get(1)], color: 'green' }, { id: 'v2', points: [[-7, 0], [-20, -19]], color: 'black' }] });
  assert.deepEqual(checkCircuit(b).map((d) => d.message), ['U1 pin 1 (1A) floats while the button B1 is released: a 74LS input reads high']);
  assert.deepEqual(circuitPorts(b).inputs.map((x) => x.name), ['g2a', 'g3a', 'g4a', 'g5a', 'g6a', 'go']);
  const bs = createCircuitSim(b);
  bs.run();
  assert.equal(bs.outputs().g1y, '0');
  bs.set('B1', true); bs.run();
  assert.equal(bs.outputs().g1y, '1');
  assert.deepEqual(bs.inputs().B1, true);
  bs.set('B1', false); bs.run();
  assert.equal(bs.outputs().g1y, '0');
  // a button across the supply: an error; pressed, the short in the console
  const sh = normalizeCircuit({ ...f, parts: [...f.parts, { id: 'B1', type: 'button', x: -30, y: -20 }],
    wires: [...f.wires, { id: 'v1', points: [[-30, -20], [-20, -20]], color: 'red' }, { id: 'v2', points: [[-27, -20], [-27, -19], [-20, -19]], color: 'black' }] });
  assert.deepEqual(checkCircuit(sh).filter((d) => d.severity === 'error').map((d) => d.message), ['Short circuit while B1 is pressed: it joins the supply\'s + and −']);
  const ss = createCircuitSim(sh);
  ss.run();
  ss.set('B1', true);
  const r = ss.run();
  assert.equal(ss.shorts().length, 2, 'the two nets the button joins');
  assert.equal(ss.powered('U1'), false, 'its VCC and GND are X');
  assert.match(runMessages(ss, r)[0], /^ERROR: Short circuit at \d+ ns: .*P1 -.* driven to 0 and 1 at once$/);
});

test('the check\'s errors and warnings, exactly, each with its part or wire', () => {
  const base = halfAdder();
  const msgs = (m) => checkCircuit(normalizeCircuit(m)).map((d) => `${d.severity}: ${d.message} [${d.ref?.id ?? ''}]`);
  // two outputs on one net (the XOR's and the AND's 1Y), a switch on the + rail, two LEDs' leads in one hole
  assert.deepEqual(msgs({ ...base, wires: [...base.wires, { id: 'wx', points: [[6, 8], [15, 8]], color: 'red' }] }),
    ['error: Short circuit: U1 1Y and U2 1Y drive one net (a short whenever they differ) [U2]']);
  assert.deepEqual(msgs({ ...base, wires: [...base.wires, { id: 'wx', points: [[-6, 9], [1, -4]], color: 'red' }] }),
    ['error: Short circuit: S1 out, U1 1A, U2 1A drive the supply\'s + rail [S1]'].map((s) => s.replace('S1 out, U1 1A, U2 1A drive', 'S1 out drives')));
  assert.deepEqual(msgs({ ...base, parts: [...base.parts, { id: 'D3', type: 'led', x: 24, y: 2 }] }),
    ['error: D1 A and D3 A are on the same hole (y25) (24,2)'.replace('(y25)', '(c25)') + ' [D3]', 'error: D1 K and D3 K are on the same hole (c26) (25,2) [D3]']);
  // the supply's + and − joined; an IC powered the wrong way round; a label twice, a label not a name
  assert.deepEqual(msgs({ ...base, wires: [...base.wires, { id: 'wx', points: [[2, -4], [2, -3]], color: 'red' }] })[0],
    'error: Short circuit: the supply\'s + and − are joined (U1 pin 14 (VCC), U1 pin 7 (GND), U2 pin 14 (VCC), U2 pin 7 (GND), …) [P1]');
  const flip = { ...base, wires: base.wires.map((w) => (w.id === 'wv1' ? { ...w, points: [[4, 3], [4, -3]] } : w.id === 'wg1' ? { ...w, points: [[10, 9], [10, -4]] } : w)) };
  assert.deepEqual(msgs(flip), ['error: U1 (7486) is powered the wrong way round: its VCC (pin 14) on the supply\'s − and its GND (pin 7) on its + [U1]']);
  assert.deepEqual(msgs({ ...base, parts: base.parts.map((p) => (p.id === 'S2' ? { ...p, label: 'a' } : p.id === 'D2' ? { ...p, label: '2c' } : p)) }),
    ['error: S2: its label \'a\' is S1\'s too [S2]', 'error: D2: its label \'2c\' is not a valid HDL name [D2]']);
  assert.deepEqual(msgs({ ...base, parts: base.parts.map((p) => (p.id === 'D2' ? { ...p, label: 'signal' } : p.id === 'D1' ? { ...p, label: 'half_adder' } : p)) }),
    ['error: D1: its label \'half_adder\' is the circuit\'s name [D1]', 'error: D2: its label \'signal\' is not a valid HDL name [D2]']);
  assert.deepEqual(msgs({ ...base, name: 'entity' })[0], 'error: The circuit\'s name \'entity\' is not a valid HDL name []');
  assert.deepEqual(msgs({ ...base, parts: [...base.parts, { id: 'U1', type: '7404', x: 40, y: 40 }, { id: 'U9', type: '74999', x: 50, y: 50 }] }).filter((s) => s.startsWith('error')).slice(0, 2),
    ['error: Two parts are named U1 [U1]', 'error: U9: no part \'74999\' in the library [U9]']);
  // an LED the wrong way round, one with its leads joined, a part and a wire's end that join nothing
  const D = (p) => ({ ...base, parts: [...base.parts, ...p.parts], wires: [...base.wires, ...p.wires] });
  assert.deepEqual(msgs(D({ parts: [{ id: 'D3', type: 'led', x: 40, y: 0 }], wires: [{ id: 'wx', points: [[40, 0], [-4, -3]], color: 'red' }, { id: 'wy', points: [[41, 0], [-4, -4]], color: 'red' }] })),
    ['warning: D3 never lights: it is the wrong way round (its anode on the supply\'s −, its cathode on the supply\'s +) [D3]']);
  assert.deepEqual(msgs(D({ parts: [{ id: 'D3', type: 'led', x: 40, y: 0 }], wires: [{ id: 'wx', points: [[40, 0], [41, 0]], color: 'red' }] })),
    ['warning: D3 never lights: its anode and its cathode are joined [D3]']);
  assert.deepEqual(msgs(D({ parts: [{ id: 'S3', type: 'logic-switch', x: 40, y: 0 }], wires: [{ id: 'wx', points: [[50, 0], [60, 0]], color: 'red' }] })),
    ['warning: S3 (Logic switch) joins nothing [S3]', 'warning: The wire wx\'s start (50,0) joins nothing [wx]', 'warning: The wire wx\'s end (60,0) joins nothing [wx]']);
  assert.deepEqual(msgs({ ...base, wires: [...base.wires, { id: 'U1', points: [[50, 0], [-6, 9]], color: 'red' }] }).slice(0, 1), ['error: A wire and a part are both named U1 [U1]']);
});

test('the edits: a part added on a hole or by its pin, moved, turned, deleted; a wire between places; properties; their messages', () => {
  let m = newCircuit('e');
  assert.deepEqual(pointOf(m, 'BB1.f5'), [4, 7]);
  assert.deepEqual(pointOf(m, 'bb1.TP3'), [2, -4]);
  assert.deepEqual(pointOf(m, 'P1.-'), [-4, -3]);
  assert.deepEqual(pointOf(m, [3, 4]), [3, 4]);
  assert.deepEqual(pointOf(m, 'BB1.k5'), { error: '\'BB1.k5\': BB1 has no hole k5 (a1 to j30, its rails tp, tn, bn, bp 1 to 30)' });
  assert.deepEqual(pointOf(m, 'X9.1'), { error: '\'X9.1\': no part X9 in the circuit' });
  assert.deepEqual(pointOf(m, 'f5'), { error: '\'f5\': a place is a grid point [x, y], a breadboard\'s hole (BB1.f10) or a part\'s pin (U1.3, S1.out)' });
  let r = addPart(m, { type: '7400', at: 'BB1.f5' });
  assert.equal(r.id, 'U1');
  m = r.model;
  assert.deepEqual(m.parts.at(-1), { id: 'U1', type: '7400', x: 4, y: 7 });
  assert.deepEqual(pointOf(m, 'U1.14'), [4, 4]);
  assert.deepEqual(pointOf(m, 'U1.VCC'), [4, 4]);
  assert.deepEqual(pointOf(m, 'U1.15').error, '\'U1.15\': U1 (7400) has no pin 15 (its pins: 1 1A, 2 1B, 3 1Y, 4 2A, 5 2B, 6 2Y, 7 GND, 8 3Y, 9 3A, 10 3B, 11 4Y, 12 4A, 13 4B, 14 VCC)');
  assert.deepEqual(addPart(m, { type: 'resistor' }), { error: 'no part \'resistor\' in the library' });
  assert.deepEqual(addPart(m, { type: 'led', id: 'U1' }), { error: 'U1: the circuit has a part or a wire named so' });
  assert.deepEqual(addPart(m, { type: 'breadboard-half', rot: 1 }), { error: 'a breadboard is not turned' });
  r = addWire(m, { from: 'U1.14', to: 'BB1.tp5', color: 'red' });
  assert.equal(r.id, 'w3');
  m = r.model;
  assert.deepEqual(m.wires.at(-1), { id: 'w3', points: [[4, 4], [4, -4]], color: 'red' });
  assert.deepEqual(addWire(m, { from: 'U1.1', to: 'U1.1' }), { error: 'a wire joins two different places' });
  assert.deepEqual(addWire(m, { from: 'U1.1', to: 'U1.2', color: 'pink' }), { error: 'color: one of red, black, blue, green, yellow, orange, white, purple' });
  assert.deepEqual(addWire(m, { from: 'U1.1', to: 'U1.2', via: [[1]] }), { error: 'via: the bends, a list of grid points [[x, y], …]' });
  m = movePart(m, 'U1', 'BB1.f10').model;
  assert.deepEqual(m.parts.at(-1), { id: 'U1', type: '7400', x: 9, y: 7 });
  m = rotatePart(m, 'U1').model;
  assert.equal(m.parts.at(-1).rot, 1);
  assert.equal(rotatePart(m, 'U1', 3).model.parts.at(-1).rot, undefined, 'four quarters: unturned');
  assert.deepEqual(rotatePart(m, 'BB1'), { error: 'a breadboard is not turned' });
  assert.deepEqual(movePart(m, 'U7', [0, 0]), { error: 'no part U7 in the circuit' });
  m = addPart(m, { type: 'logic-switch', at: [-8, 0] }).model;
  m = setPartProps(m, 'S1', { label: 'go', on: true }).model;
  assert.deepEqual(m.parts.at(-1), { id: 'S1', type: 'logic-switch', x: -8, y: 0, label: 'go', on: true });
  assert.deepEqual(setPartProps(m, 'S1', { color: 'red' }), { error: 'S1 (logic-switch) has no property \'color\' (label, on)' });
  m = addPart(m, { type: 'led', at: [30, 0], label: 'y' }).model;
  assert.deepEqual(setPartProps(m, 'D1', { color: 'pink' }), { error: 'color: one of red, green, yellow, blue, white' });
  assert.equal(setPartProps(m, 'D1', { color: 'green' }).model.parts.at(-1).color, 'green');
  m = deleteItem(m, 'U1').model;
  assert.equal(m.parts.some((p) => p.id === 'U1'), false);
  assert.equal(m.wires.some((w) => w.id === 'w3'), true, 'its wire stays');
  assert.deepEqual(deleteItem(m, 'U1'), { error: 'no part or wire U1 in the circuit' });
});

test('a circuit normalized: whole steps, the unknown fields dropped, a switch\'s position, an LED\'s colour', () => {
  assert.deepEqual(normalizeCircuit({ name: '9x', lang: 'vhdl', extra: 1, parts: [{ id: 'S1', type: 'logic-switch', x: 1.4, y: '2', rot: 5, on: 1 }, { id: 'D1', type: 'led', color: 'pink' }, null],
    wires: [{ id: 'w1', points: [[0, 0]] }, { id: 'w2', points: [[0, 0], [1.6, 2]], color: 'cyan' }] }),
  { format: 'silinx-circuit', version: 1, name: 'circuit', lang: 'vhdl', parts: [{ id: 'S1', type: 'logic-switch', x: 1, y: 2, rot: 1, on: true }, { id: 'D1', type: 'led', x: 0, y: 0, color: 'red' }],
    wires: [{ id: 'w2', points: [[0, 0], [2, 2]], color: 'blue' }] });
  assert.deepEqual(newCircuit('n', 'verilog', { breadboard: false }), { format: 'silinx-circuit', version: 1, name: 'n', lang: 'verilog', parts: [], wires: [] });
  // the new circuit's supply is on the top rails: no errors, no warnings
  assert.deepEqual(checkCircuit(newCircuit('n')), []);
});

// The analog solver (core/analog-mna.js, #5382): its DC operating points against circuits computed by hand (a divider,
// a Wheatstone bridge, a current source, a source with its output resistance, an ideal source's current), its time steps
// against the closed forms of an RC's charge and discharge and of two RCs in a ladder (their eigenvalues), its diodes
// against Shockley's equation solved independently (bisection), a node joined to nothing, and the values in SI
// (core/circuit-analog-parts.js parseSi, formatSi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMna, gauss } from '../core/analog-mna.js';
import { parseSi, formatSi, sig3 } from '../core/circuit-analog-parts.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

test('DC: a divider, a Wheatstone bridge, a current source, a source through its resistance, an ideal source\'s current', () => {
  // 10 V over 1 kΩ and 4 kΩ: 8 V, 2 mA
  const V = { kind: 'V', a: 0, b: -1, volts: 10 };
  let s = createMna(2, [V, { kind: 'R', a: 0, b: 1, ohms: 1000 }, { kind: 'R', a: 1, b: -1, ohms: 4000 }]).dc();
  near(s.voltage(1), 8, 1e-6, 'divider');
  near(s.current(V), -0.002, 1e-9, 'the source delivers 2 mA (its current from + through it to −: −2 mA)');
  // a bridge: 12 V; 1 k / 2 k on one side (8 V), 3 k / 3 k on the other (6 V), 5 kΩ between them: by hand (Thevenin:
  // 2 V over 666.7 + 1500 + 5000 Ω) 279.07 µA
  const Rm = { kind: 'R', a: 1, b: 2, ohms: 5000 };
  s = createMna(3, [{ kind: 'V', a: 0, b: -1, volts: 12 }, { kind: 'R', a: 0, b: 1, ohms: 1000 }, { kind: 'R', a: 1, b: -1, ohms: 2000 },
    { kind: 'R', a: 0, b: 2, ohms: 3000 }, { kind: 'R', a: 2, b: -1, ohms: 3000 }, Rm]).dc();
  near(s.current(Rm), 2 / (2000 / 3 + 1500 + 5000), 1e-9, 'the bridge\'s middle current');
  // 1 mA into 2 kΩ ∥ 2 kΩ: 1 V
  s = createMna(1, [{ kind: 'I', a: -1, b: 0, amps: 1e-3 }, { kind: 'R', a: 0, b: -1, ohms: 2000 }, { kind: 'R', a: 0, b: -1, ohms: 2000 }]).dc();
  near(s.voltage(0), 1, 1e-9, 'a current source');
  // a 5 V source through 50 Ω into 450 Ω: 4.5 V; off (ohms Infinity): nothing
  const src = { kind: 'VR', a: 0, b: -1, volts: 5, ohms: 50 };
  s = createMna(1, [src, { kind: 'R', a: 0, b: -1, ohms: 450 }]).dc();
  near(s.voltage(0), 4.5, 1e-6, 'a source through its resistance');
  near(s.current(src), -0.01, 1e-9, 'its current');
  src.ohms = Infinity;
  near(s.dc().voltage(0), 0, 1e-9, 'off');
  // (a node joined to nothing: 0 V, its GMIN to the ground)
  near(createMna(2, [{ kind: 'V', a: 0, b: -1, volts: 3 }]).dc().voltage(1), 0, 1e-12, 'a node joined to nothing');
});

test('in time: an RC\'s charge and discharge against V(1 − e^(−t/RC)), two RCs in a ladder against their closed form', () => {
  const C = { kind: 'C', a: 1, b: -1, farads: 1e-6 }, src = { kind: 'VR', a: 0, b: -1, volts: 5, ohms: 0 };
  const s = createMna(2, [src, { kind: 'R', a: 0, b: 1, ohms: 1000 }, C]);
  const tau = 1e-3, dt = 1e-5;
  let t = 0, worst = 0;
  for (let k = 0; k < 500; k++) { s.step(dt); t += dt; worst = Math.max(worst, Math.abs(s.voltage(1) - 5 * (1 - Math.exp(-t / tau)))); }
  assert.ok(worst < 0.02, `charge: ${worst} V at worst (its first step backward Euler's)`);
  // then discharged from where it is: V0 e^(−t/RC), the source at 0 V
  const v0 = s.voltage(1);
  src.volts = 0;
  s.changed();
  t = 0; worst = 0;
  for (let k = 0; k < 500; k++) { s.step(dt); t += dt; worst = Math.max(worst, Math.abs(s.voltage(1) - v0 * Math.exp(-t / tau))); }
  assert.ok(worst < 0.02, `discharge: ${worst} V at worst`);
  near(C.vc, s.voltage(1), 1e-12, 'its state its voltage');
  // a ladder (R C R C, 1 kΩ and 1 µF each, a step of 1 V): v2(t) = 1 − a e^(λ1 t) − b e^(λ2 t), λ the eigenvalues of
  // [[−2, 1], [1, −1]] / RC: (−3 ± √5) / 2, a and b from v2(0) = 0 and v2'(0) = 0
  const l1 = (-3 + Math.sqrt(5)) / 2 / tau, l2 = (-3 - Math.sqrt(5)) / 2 / tau, b = l1 / (l1 - l2), a = 1 - b;
  const L = createMna(3, [{ kind: 'VR', a: 0, b: -1, volts: 1, ohms: 0 }, { kind: 'R', a: 0, b: 1, ohms: 1000 }, { kind: 'C', a: 1, b: -1, farads: 1e-6 },
    { kind: 'R', a: 1, b: 2, ohms: 1000 }, { kind: 'C', a: 2, b: -1, farads: 1e-6 }]);
  t = 0; worst = 0;
  for (let k = 0; k < 1000; k++) { L.step(dt); t += dt; worst = Math.max(worst, Math.abs(L.voltage(2) - (1 - a * Math.exp(l1 * t) - b * Math.exp(l2 * t)))); }
  assert.ok(worst < 2e-3, `ladder: ${worst} V at worst`);
  // (settle: the capacitors held, the nodes at once; dc: the capacitors open)
  src.volts = 5;
  s.settle();
  near(s.voltage(1), C.vc, 1e-6, 'settled: the capacitor holds its voltage');
  near(s.dc().voltage(1), 5, 1e-6, 'DC: the capacitor open, its voltage the source\'s');
});

test('a diode against Shockley\'s equation solved by bisection; reversed, nothing; Newton from far', () => {
  const is = 2.52e-9, n = 1.752, vt = 0.025852;
  const ref = (V, R) => {   // (the diode's voltage x with (V − x) / R = is (e^(x / n vt) − 1), by bisection)
    let lo = 0, hi = V;
    for (let k = 0; k < 200; k++) { const x = (lo + hi) / 2; if ((V - x) / R > is * (Math.exp(x / (n * vt)) - 1)) lo = x; else hi = x; }
    return lo;
  };
  for (const [V, R] of [[5, 1000], [3.3, 220], [12, 10], [1, 1e5]]) {
    const D = { kind: 'D', a: 1, b: -1, is, n };
    const s = createMna(2, [{ kind: 'V', a: 0, b: -1, volts: V }, { kind: 'R', a: 0, b: 1, ohms: R }, D]).dc();
    near(s.voltage(1), ref(V, R), 1e-6, `${V} V through ${R} Ω`);
    near(s.current(D), (V - s.voltage(1)) / R, 1e-8, 'its current the resistor\'s');
  }
  const D = { kind: 'D', a: -1, b: 1, is, n };
  const s = createMna(2, [{ kind: 'V', a: 0, b: -1, volts: 5 }, { kind: 'R', a: 0, b: 1, ohms: 1000 }, D]).dc();
  near(s.voltage(1), 5, 1e-3, 'reversed: no current, the node at the source');
});

test('gauss: a system solved; a singular one null', () => {
  const x = gauss([Float64Array.from([2, 1]), Float64Array.from([1, 3])], Float64Array.from([5, 10]));
  near(x[0], 1, 1e-12, 'x'); near(x[1], 3, 1e-12, 'y');
  assert.equal(gauss([Float64Array.from([1, 2]), Float64Array.from([2, 4])], Float64Array.from([1, 2])), null);
  assert.throws(() => createMna(1, [{ kind: 'L', a: 0, b: -1 }]).dc(), /^Error: no analog element 'L'$/);
});

test('values in SI: read as written ("4k7", "100n", "2.2u", "1M", "220Ω"), said with their prefix, three digits', () => {
  for (const [s, v] of [['4k7', 4700], ['4.7k', 4700], ['100n', 1e-7], ['2.2u', 2.2e-6], ['2.2µF', 2.2e-6], ['1M', 1e6], ['220Ω', 220], ['220 ohms', 220], [' 10 k ', 10e3], ['1e-6', 1e-6], [330, 330]]) near(parseSi(s), v, Math.abs(v) * 1e-12, String(s));
  for (const s of ['', 'k', 'abc', '4k7k', '12x', null]) assert.ok(Number.isNaN(parseSi(s)), String(s));
  assert.deepEqual([4700, 1e-7, 2.2e-6, 1e6, 220, 0, 1.25, 0.0123, 1e-12].map((v) => formatSi(v, 'Ω')), ['4.7 kΩ', '100 nΩ', '2.2 µΩ', '1 MΩ', '220 Ω', '0 Ω', '1.25 Ω', '12.3 mΩ', '1 pΩ']);
  assert.equal(formatSi(NaN, 'V'), '– V');
  assert.deepEqual([sig3(4712), sig3(0.0000012345)], [4710, 0.00000123]);
});

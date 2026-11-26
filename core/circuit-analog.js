// A circuit's analog side (#5382, the analog and digital roadmap #5387): a circuit with an analog part (a resistor, a
// capacitor, a potentiometer, an LDR, a thermistor, a diode: core/circuit-analog-parts.js) is solved as a circuit
// (core/analog-mna.js) on its analog nodes, the nets an analog part or an LED touches (joined by the closed contacts, as
// core/circuit-sim.js's nodes). The boundary at the pins: each digital driver of such a node (the supply, an output, a
// switch, a pull-up, a board's pin) is a source of its levels' volts through its output resistance, a 74LS input
// sources its current, and the node's level is its voltage read against its inputs' thresholds (a Schmitt trigger's
// with its hysteresis); a node no source reaches floats (Z). An LED is a diode of its colour: lit by its current (its
// brightness), and more than an LED takes (30 mA) is said once: a current-limiting resistor missing. In time, the
// capacitors charge between the digital events: core/circuit-sim.js steps it with wake-ups while it is still moving.
// Isomorphic module.
import { createMna } from './analog-mna.js';
import { partDef, onStep } from './circuit-parts.js';
import { partLamps } from './circuit-io.js';
import { generatorOf, generatorVolts, generatorEdge, GENERATOR_OHMS } from './circuit-analog-devices.js';
import { OUTPUT_SPEC, INPUT_SPEC, ledModel, LED_LIT, LED_MAX, LED_RATED, DIODE_MODEL, ldrOhms, ntcOhms, readVolts, formatSi } from './circuit-analog-parts.js';

const DT_MIN = 1e-9, DT_MAX = 1e-2, DT_FIRST = 1e-8;   // (s) the time steps while the capacitors move
const DV_STEP = 0.05;                                   // (V) the change a step aims at
const SETTLED = 1e-3;                                   // (V/s) slower than this, the circuit is still

/** Whether a circuit is solved as a circuit too: it has an analog part. */
export const isAnalogCircuit = (m) => m.parts.some((p) => partDef(p.type)?.kind === 'analog');

/**
 * The analog side of a circuit's simulation: m, nets (circuitNets), byNet (the digital drivers on each net: { value,
 * strength, elec }). Returns { regroup(nodeOf), at(seconds), has(node), resolve(node, prev), volts(net), lamp(part,
 * index), lampCurrents(), dynamic, dtNext, warnings(), senses(id, prop), sensed(id, prop), setSensed(id, prop, v) }.
 */
export function createCircuitAnalog(m, nets, { byNet }) {
  const netOf = (id, n) => nets.pinNet.get(`${id}.${n}`);
  // ---- the parts' elements, on nets (an LED's an inner node between its diode and its series resistance)
  const parts = [];      // [{ part, def, els: [{ kind, na, nb, … }] }] (na, nb: a net, or 'in:<k>' an inner node)
  const lamps = [];      // [{ part, index, d, color }]
  const inner = [];      // the inner nodes' names
  const values = new Map();   // part id → its sensed values now
  const gens = [], sources = new Map(), watch = [];   // (#5384: the generators; the sources a device sets, '<id>:<k>'; the comparators' inputs)
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    const at = (n) => netOf(p.id, n);
    const els = [];
    if (d.type === 'resistor') els.push({ kind: 'R', na: at(1), nb: at(2), ohms: p.ohms ?? 1000 });
    else if (d.type === 'capacitor') els.push({ kind: 'C', na: at(1), nb: at(2), farads: p.farads ?? 1e-6 });
    else if (d.type === 'potentiometer') { els.push({ kind: 'R', na: at(1), nb: at(2), ohms: 1, pot: 'a' }, { kind: 'R', na: at(2), nb: at(3), ohms: 1, pot: 'b' }); values.set(p.id, { pos: p.pos ?? 50, total: p.ohms ?? 10e3 }); }
    else if (d.type === 'ldr') { els.push({ kind: 'R', na: at(1), nb: at(2), ohms: 1, ldr: true }); values.set(p.id, { lux: p.lux ?? 100 }); }
    else if (d.type === 'thermistor') { els.push({ kind: 'R', na: at(1), nb: at(2), ohms: 1, ntc: true }); values.set(p.id, { temp: p.temp ?? 25 }); }
    else if (d.type === 'diode') { const k = `in:${inner.push(`${p.id}.j`) - 1}`; els.push({ kind: 'D', na: at(1), nb: k, is: DIODE_MODEL.is, n: DIODE_MODEL.n }, { kind: 'R', na: k, nb: at(2), ohms: DIODE_MODEL.rs }); }
    else if (d.lamps) {
      for (const x of partLamps(p)) {
        const led = ledModel(p.color), k = `in:${inner.push(`${p.id}.${x.index}`) - 1}`;
        const dd = { kind: 'D', na: netOf(p.id, x.a), nb: k, is: led.is, n: led.n };
        els.push(dd, { kind: 'R', na: k, nb: netOf(p.id, x.k), ohms: led.rs });
        lamps.push({ part: p.id, index: x.index, d: dd, vf: led.vf, q: 0, qt: 0 });
      }
    } else if (d.type === 'function-generator') {   // (#5384: its wave through 50 Ω)
      const e = { kind: 'VR', na: at(1), nb: at(2), volts: 0, ohms: GENERATOR_OHMS, part: p.id };
      const set = generatorOf(p);
      els.push(e); gens.push({ e, set }); values.set(p.id, set);
    } else if (d.type === 'pmod-da2') {   // (#5384: its two outputs, set by its DACs)
      for (const [k, n] of [[0, 7], [1, 8]]) { const e = { kind: 'VR', na: at(n), nb: at(9), volts: 0, ohms: 1 }; els.push(e); sources.set(`${p.id}:${k}`, e); }
    } else if (d.comparators) {   // (#5384: its inputs' difference watched, a crossing found within a millivolt)
      for (const c of d.comparators) watch.push([at(c.plus), at(c.minus)]);
    } else if (d.kind === 'ic' && d.family === 'ttl') {
      // (a 74LS input sources its current: open, it floats high)
      for (const q of d.pins.filter((x) => x.dir === 'in')) els.push({ kind: 'VR', na: at(q.n), nb: null, volts: INPUT_SPEC.ttl.src.volts, ohms: INPUT_SPEC.ttl.src.ohms, input: true });
    }
    if (els.length) parts.push({ part: p, def: d, els });
  }
  // the nets an analog part or an LED touches (a 74LS input does not make its net analog)
  const analogNet = new Set(parts.flatMap((x) => x.els.filter((e) => !e.input).flatMap((e) => [e.na, e.nb])).filter((n) => typeof n === 'number'));
  // each input pin on a net: how it reads (its family, a Schmitt trigger)
  const readersOf = new Map();
  for (const p of m.parts) {
    const d = partDef(p.type);
    for (const q of d?.pins ?? []) {
      if (q.dir !== 'in' || d.kind === 'output' || d.lamps) continue;
      const net = netOf(p.id, q.n);
      if (!analogNet.has(net)) continue;
      if (!readersOf.has(net)) readersOf.set(net, []);
      readersOf.get(net).push({ spec: INPUT_SPEC[d.family] ?? INPUT_SPEC.default, schmitt: !!d.schmitt });
    }
  }
  const sensedOhms = (x, e) => {
    const s = values.get(x.part.id);
    if (e.pot) { const f = Math.min(1, Math.max(0, s.pos / 100)); return Math.max(0.5, s.total * (e.pot === 'a' ? f : 1 - f)); }
    if (e.ldr) return ldrOhms(s.lux);
    if (e.ntc) return ntcOhms(s.temp);
    return e.ohms;
  };

  // ---- the nodes: the analog nets' digital nodes (regroup), then the inner ones
  let mna = null, nodeIndex = new Map(), els = [], drv = [], readSpec = new Map(), nodeNetsOf = new Map(), floating = new Set(), unknown = new Set();
  let tNow = 0, dynamic = false, dtNext = DT_FIRST, lastV = null, watchNodes = [];
  const warned = new Set(), said = [];

  function regroup(nodeOf) {
    nodeIndex = new Map(); nodeNetsOf = new Map();
    for (const net of analogNet) {
      const k = nodeOf[net];
      if (!nodeIndex.has(k)) { nodeIndex.set(k, nodeIndex.size); nodeNetsOf.set(k, []); }
      nodeNetsOf.get(k).push(net);
    }
    const base = nodeIndex.size;
    const node = (n) => (typeof n === 'number' ? nodeIndex.get(nodeOf[n]) ?? -2 : n == null ? -1 : base + Number(n.slice(3)));
    els = [];
    for (const x of parts) {
      for (const e of x.els) {
        e.a = node(e.na); e.b = node(e.nb);
        if (e.input && e.a === -2) continue;   // (a 74LS input on a net that is not analog)
        if (e.a === -2 || e.b === -2) continue;
        if (e.ldr || e.ntc || e.pot) e.ohms = sensedOhms(x, e);
        els.push(e);
      }
    }
    // the digital drivers of the analog nodes: each a source through its resistance
    drv = [];
    for (const [k, list] of nodeNetsOf) for (const net of list) for (const d of byNet[net]) drv.push({ d, e: { kind: 'VR', a: nodeIndex.get(k), b: -1, volts: 0, ohms: Infinity } });
    els.push(...drv.map((x) => x.e));
    // how each node reads: a Schmitt trigger's input first, else its first input's family, else 74LS's thresholds
    readSpec = new Map();
    for (const [k, list] of nodeNetsOf) {
      const rs = list.flatMap((net) => readersOf.get(net) ?? []);
      readSpec.set(k, rs.find((r) => r.schmitt) ?? rs[0] ?? { spec: INPUT_SPEC.default, schmitt: false });
    }
    watchNodes = watch.map(([a, b]) => [node(a), node(b)].map((i) => (i === -1 ? null : i))).filter(([a, b]) => a != null && b != null && a >= 0 && b >= 0);
    mna = createMna(base + inner.length, els);
    for (const g of gens) g.e.volts = generatorVolts(g.set, tNow);
    refresh(true);
  }

  // the drivers' sources from their values now; the floating nodes; the circuit solved at this instant if one changed
  function refresh(force = false) {
    let changed = force;
    for (const x of drv) {
      const s = x.d.elec ?? (x.d.strength === 'w' ? OUTPUT_SPEC.weak : OUTPUT_SPEC.default);
      const v = x.d.value;
      const volts = v === '1' ? s.voh : v === '0' ? s.vol : (s.voh + s.vol) / 2;
      const ohms = v === 'Z' ? Infinity : x.d.strength === 'w' ? s.rw ?? OUTPUT_SPEC.weak.rh : v === '1' ? s.rh : s.rl;
      if (x.e.volts !== volts || x.e.ohms !== ohms) { x.e.volts = volts; x.e.ohms = ohms; changed = true; }
    }
    if (!changed) return;
    unknown = new Set(drv.filter((x) => x.d.value === 'X' && x.d.strength === 's').map((x) => x.e.a));
    // (floating: no source reaches it through the parts)
    const N = mna.size, parent = Array.from({ length: N + 1 }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const idx = (a) => (a < 0 ? N : a);
    for (const e of els) if (e.kind !== 'VR' && e.kind !== 'V') parent[find(idx(e.a))] = find(idx(e.b));
    const fed = new Set(els.filter((e) => e.kind === 'VR' && !e.input && Number.isFinite(e.ohms)).map((e) => find(idx(e.a))));
    floating = new Set([...nodeIndex.values()].filter((i) => !fed.has(find(i))));
    mna.changed();
    mna.settle();
    dynamic = els.some((e) => e.kind === 'C') || gens.length > 0;
    dtNext = DT_FIRST;
    lastV = snapshot();
    checkLamps();
  }
  const snapshot = () => Float64Array.from({ length: mna.size }, (_, i) => mna.voltage(i));

  // the circuit `seconds` on (the drivers as they were), in steps: each aiming at DV_STEP, still once slower than SETTLED
  function integrate(seconds) {
    let left = seconds, n = 0, t = tNow;
    while (left > 1e-15 && dynamic && n++ < 20000) {
      let dt = Math.min(left, dtNext);
      // (a generator's: a square wave's edge ends a step, its level the step's before it; a sine's at the step's end)
      const edge = Math.min(Infinity, ...gens.map((g) => generatorEdge(g.set, t)));
      if (edge - t < dt) dt = Math.max(edge - t, 1e-12);
      for (const g of gens) g.e.volts = generatorVolts(g.set, g.set.wave === 'square' ? t + dt / 2 : t + dt);
      mna.step(dt);
      left -= dt; t += dt;
      const jumped = Math.abs(t - edge) < 1e-12;
      if (jumped) { for (const g of gens) g.e.volts = generatorVolts(g.set, t + 1e-12); mna.changed(); }
      for (const x of lamps) { x.q += Math.max(0, mna.current(x.d)) * dt; x.qt += dt; }   // (each LED's charge: its mean current, #5384)
      const v = snapshot(), prev = lastV;
      let dv = 0;
      for (let i = 0; i < v.length; i++) dv = Math.max(dv, Math.abs(v[i] - lastV[i]));
      lastV = v;
      if (dv / dt < SETTLED && dt >= DT_FIRST && !gens.length) dynamic = false;
      // (the next step: twice as long at most, half at least; a step cut short by the time asked for keeps the size)
      const f = Math.min(2, Math.max(0.5, dv ? DV_STEP / dv : 2));
      // (after a square wave's edge, small steps again)
      dtNext = jumped ? DT_FIRST : Math.min(DT_MAX, Math.max(DT_MIN, dt < dtNext ? Math.min(dtNext, dtNext * f) : dt * f, 0), toThreshold(v, prev, dt), ...gens.map((g) => (g.set.wave === 'square' ? Infinity : 1 / g.set.hz / 50)));
    }
    // (a long wait: the circuit settled; with a generator, the time it could not follow skipped)
    if (left > 1e-15 && dynamic && !gens.length) { mna.dc(); dynamic = false; }
    // (the next wake-up on a square wave's next edge)
    if (gens.length) dtNext = Math.max(DT_MIN, Math.min(dtNext, Math.min(...gens.map((g) => generatorEdge(g.set, t))) - t));
    checkLamps();
  }

  // the time to the nearest threshold a node is moving to (half of it, the step's at most: a crossing found within a
  // millivolt), each node's thresholds its inputs'
  function toThreshold(v, prev, dt) {
    let t = Infinity;
    for (const [k, i] of nodeIndex) {
      const slope = (v[i] - prev[i]) / dt;
      if (!slope) continue;
      const r = readSpec.get(k), th = r.schmitt && r.spec.schmitt ? [r.spec.schmitt.vtp, r.spec.schmitt.vtn] : [r.spec.vil, r.spec.vih];
      for (const x of th) {
        const d = (x - v[i]) / slope;
        if (d > 0) t = Math.min(t, Math.max(d / 2, 1e-3 / Math.abs(slope)));
      }
    }
    // (a comparator's inputs: the time their difference reaches 0)
    for (const [i, j] of watchNodes) {
      const d = v[i] - v[j], slope = (d - (prev[i] - prev[j])) / dt;
      if (slope && -d / slope > 0) t = Math.min(t, Math.max(-d / slope / 2, 1e-3 / Math.abs(slope)));
    }
    return t;
  }

  // an LED with more current than it takes: said once (a current-limiting resistor missing)
  function checkLamps() {
    for (const x of lamps) {
      const i = mna.current(x.d), key = `${x.part}.${x.index}`;
      if (i > LED_MAX && !warned.has(key)) {
        warned.add(key);
        const r = Math.round((5 - x.vf) / (LED_RATED * 0.75) / 10) * 10;
        said.push(`${x.part}${lamps.filter((y) => y.part === x.part).length > 1 ? ` (its LED ${x.index + 1})` : ''}: ${Math.round(i * 1000)} mA through it, more than an LED takes (${LED_RATED * 1000} mA): a current-limiting resistor is missing in series (about ${r} Ω from 5 V)`);
      }
    }
  }

  return {
    regroup,
    /** the circuit at `seconds` (the time of the digital simulation): its capacitors moved on, its drivers read again */
    at(seconds) {
      if (seconds > tNow) integrate(seconds - tNow);
      tNow = Math.max(tNow, seconds);
      refresh();
    },
    has: (k) => nodeIndex.has(k),
    /** a node's level: its voltage read by its inputs' thresholds; Z floating, X a driver's X */
    resolve(k, prev) {
      const i = nodeIndex.get(k);
      if (unknown.has(i)) return 'X';
      if (floating.has(i)) return 'Z';
      const r = readSpec.get(k);
      return readVolts(mna.voltage(i), r.spec, r.schmitt, prev);
    },
    /** a net's voltage (an analog net's), or null */
    volts(net, nodeOf) { const i = nodeIndex.get(nodeOf[net]); return i == null || floating.has(i) ? (i == null ? null : NaN) : mna.voltage(i); },
    /** an LED's current (A) */
    lamp: (part, index) => { const x = lamps.find((y) => y.part === part && y.index === index); return x ? Math.max(0, mna.current(x.d)) : null; },
    lit: (i) => i >= LED_LIT,
    /** an LED's mean current (A) since this was last asked (its own now if no time passed): what the eye sees of a PWM */
    lampMean(part, index) {
      const x = lamps.find((y) => y.part === part && y.index === index);
      if (!x) return null;
      const i = x.qt > 0 ? x.q / x.qt : Math.max(0, mna.current(x.d));
      x.q = 0; x.qt = 0;
      return i;
    },
    get dynamic() { return dynamic; },
    /** the next step (ns) while the capacitors move */
    get dtNs() { return Math.max(1, Math.round(dtNext * 1e9)); },
    warnings: () => said,
    /** a device's output set (#5384: a DAC's, '<id>:<k>'): its volts through its ohms (Infinity: off) */
    setSource(key, { volts, ohms }) {
      const e = sources.get(key);
      if (!e || (e.volts === volts && e.ohms === ohms)) return;
      e.volts = volts; e.ohms = ohms;
      refresh(true);
    },
    /** a generator's settings now (#5384) */
    generator: (id) => gens.find((g) => g.e.part === id)?.set ?? null,
    senses: (id, prop) => values.has(id) && prop in values.get(id) && !['total', 'wave', 'hz', 'vhigh', 'vlow'].includes(prop),
    sensed: (id, prop) => values.get(id)[prop],
    setSensed(id, prop, v) {
      values.get(id)[prop] = v;
      for (const x of parts.filter((y) => y.part.id === id)) for (const e of x.els) if (e.ldr || e.ntc || e.pot) e.ohms = sensedOhms(x, e);
      refresh(true);
    },
    /** a part's values as said: a potentiometer's two sides, an LDR's or a thermistor's resistance */
    ohmsText(id) { const x = parts.find((y) => y.part.id === id); return x ? x.els.filter((e) => e.kind === 'R' && (e.ldr || e.ntc || e.pot)).map((e) => formatSi(e.ohms, 'Ω')).join(' + ') : ''; },
  };
}

/**
 * The simulation's views of its analog side (#5382, moved from core/circuit-sim.js's createCircuitSim): `an` (or null: a
 * circuit with no analog part), `views` the devices' (deviceViews), the simulation's nets, netOfPin(id, n), lit (the
 * parts with lamps), level(net), nodeDrivers(net) (the drivers of its node), nodeOf() and update().
 */
export function analogViews(m, an, views, { nets, netOfPin, lit, level, nodeDrivers, nodeOf, update }) {
  // a net's voltage: an analog net's solved, another's its level's, its strongest driver's volts (a 74LS's 1 at 3.4 V);
  // NaN floating or unknown
  const volts = (net) => {
    const v = an?.volts(net, nodeOf());
    if (v != null) return v;
    const lv = level(net);
    if (lv !== '0' && lv !== '1') return NaN;
    const ds = nodeDrivers(net).filter((d) => d.value === lv), d = ds.find((x) => x.strength === 's') ?? ds[0];
    const e = d?.elec ?? OUTPUT_SPEC.default;
    return lv === '1' ? e.voh : e.vol;
  };
  const meters = m.parts.filter((p) => p.type === 'voltmeter');
  return {
    // (an analog part's sensed value: a potentiometer's position, an LDR's light, a thermistor's temperature)
    sensed: (id, prop) => (an?.senses(id, prop) ? an.sensed(id, prop) : views.sensed(id, prop)),
    setSensed(id, prop, v) {
      if (!an?.senses(id, prop)) return views.setSensed(id, prop, v);
      const s = partDef(m.parts.find((p) => p.id === id).type).sense.find((x) => x.prop === prop), n = Number(v);
      if (!Number.isFinite(n) || n < s.min || n > s.max) throw new Error(`${id}'s ${prop}: from ${s.min} to ${s.max} ${s.unit}`);
      an.setSensed(id, prop, onStep(n, s.step));
      update();
    },
    // (the devices' warnings, once each; an LED with too much current)
    servoWarnings: () => [...views.servoWarnings(), ...(an?.warnings() ?? [])],
    /** whether the circuit is solved as a circuit too (it has an analog part) */
    analog: !!an,
    /** a net's voltage (V; NaN floating or unknown) */
    volts,
    /** a pin's voltage ('U1.3', or a part id and a pin number) */
    pinVolts: (ref, n) => volts(n == null ? nets.pinNet.get(ref) : netOfPin(ref, n)),
    /** each voltmeter's reading: its + against its COM (V; NaN: a lead on nothing driven) */
    meters: () => Object.fromEntries(meters.map((p) => [p.id, volts(netOfPin(p.id, 1)) - volts(netOfPin(p.id, 2))])),
    /** each LED's current (mA), an analog circuit's: a part's, or its list (a display's, a bar's) */
    lampCurrents: () => (an ? Object.fromEntries(lit.map((p) => { const s = partLamps(p).map((x) => an.lamp(x.part, x.index) * 1000); return [p.id, s.length === 1 ? s[0] : s]; })) : {}),
    /** each LED's mean current (mA) since last asked (#5384: a PWM's dimming, as the eye sees it) */
    lampMeans: () => (an ? Object.fromEntries(lit.map((p) => { const s = partLamps(p).map((x) => an.lampMean(x.part, x.index) * 1000); return [p.id, s.length === 1 ? s[0] : s]; })) : {}),
    /** a part's resistance as set now (an LDR's, a thermistor's, a potentiometer's two sides), said */
    ohmsText: (id) => an?.ohmsText(id) ?? '',
  };
}

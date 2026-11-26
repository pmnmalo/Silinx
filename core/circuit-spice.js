// A circuit's analog side through ngspice (#5386, the analog and digital roadmap #5387): a run of the circuit's own
// simulation (core/circuit-analog.js's record(), recorded()) written as a SPICE netlist, ngspice's transient analysis of it
// read back as each net's waveform. One way: the digital outputs, as the circuit's simulation computed them (its own
// solver, #5382, in the loop), go into the netlist as sources of their volts through their conductance, piecewise linear
// in time; what ngspice computes changes nothing of the digital side. Its own solver stays the default; ngspice is a
// second opinion on the analog waveforms (an RC's charge, an LED's current, a comparator's inputs).
//
// Isomorphic ES module (browser + Node), no DOM. The engine itself (eecircuit-engine's WebAssembly ngspice, downloaded on
// first use) is server/ngspice.js's and web/js/ngspice-browser.js's.

import { generatorVolts } from './circuit-analog-devices.js';

/** (s) a digital edge's rise in the netlist's piecewise linear sources */
export const SPICE_EDGE = 1e-9;
/** the most points the netlist's piecewise linear sources may have in all (a longer run: an error, shorten it) */
export const SPICE_MAX_POINTS = 200000;
const SINE_POINTS = 64;   // (points a period of a sine)

const num = (v) => (v === 0 ? '0' : Number(v).toPrecision(9).replace(/\.?0+(e|$)/, '$1'));
const conductance = (ohms) => (Number.isFinite(ohms) ? 1 / Math.max(ohms, 1e-9) : 0);

/** A list of values as they changed, [{ t, v }] (t: s from the run's start), as a PWL's points: each change a step of
 *  SPICE_EDGE; f(v) a value's number. */
export function stepPoints(series, t0, t1, f = (v) => v) {
  const pts = [];
  for (const [i, x] of series.entries()) {
    const t = Math.max(0, x.t - t0), y = f(x.v);
    if (i === 0) pts.push([0, y]);
    else { pts.push([t, f(series[i - 1].v)], [t + SPICE_EDGE, y]); }
  }
  pts.push([Math.max(t1 - t0, pts[pts.length - 1][0] + SPICE_EDGE), f(series[series.length - 1].v)]);
  return increasing(pts);
}
// (a PWL's times strictly increasing: two changes closer than an edge kept a tenth of an edge apart)
const increasing = (pts) => { for (let i = 1; i < pts.length; i++) pts[i][0] = Math.max(pts[i][0], pts[i - 1][0] + SPICE_EDGE / 10); return pts; };
// (a voltage between two nodes in a behavioural source's expression, the ground's left out)
const vd = (a, b) => (a === '0' ? `(-V(${b}))` : b === '0' ? `V(${a})` : `V(${a},${b})`);

/** A function generator's settings as they changed ([{ t, v: { wave, hz, vlow, vhigh, duty } }]) as a PWL's points from
 *  t0 to t1: a square wave's edges (SPICE_EDGE each), a triangle's corners, a sine's SINE_POINTS a period. */
export function generatorPoints(series, t0, t1) {
  const pts = [];
  const at = (t, v) => { const r = t - t0; if (!pts.length || r > pts[pts.length - 1][0]) pts.push([r, v]); };
  for (const [i, x] of series.entries()) {
    const g = x.v, a = Math.max(t0, x.t), b = i + 1 < series.length ? Math.max(a, series[i + 1].t) : t1, T = 1 / g.hz;
    // (from the settings before: their value held to this change, the new one an edge later)
    if (i > 0) at(a, generatorVolts(series[i - 1].v, a - 1e-12));
    at(i > 0 ? a + SPICE_EDGE : a, generatorVolts(g, a));
    if (g.wave === 'sine') {
      for (let k = Math.ceil(a / T * SINE_POINTS); k / SINE_POINTS * T <= b && pts.length <= SPICE_MAX_POINTS; k++) at(k / SINE_POINTS * T, generatorVolts(g, k / SINE_POINTS * T));
    } else if (g.wave === 'triangle') {
      for (let k = Math.ceil(a / T * 2); k / 2 * T <= b && pts.length <= SPICE_MAX_POINTS; k++) at(k / 2 * T, k % 2 ? g.vhigh : g.vlow);
    } else {
      for (let k = Math.floor(a / T); k * T <= b && pts.length <= SPICE_MAX_POINTS; k++) {
        for (const [e, from, to] of [[k * T, g.vlow, g.vhigh], [(k + g.duty / 100) * T, g.vhigh, g.vlow]]) {
          if (e <= a || e >= b) continue;
          at(e, from); at(e + SPICE_EDGE, to);
        }
      }
    }
    if (pts.length > SPICE_MAX_POINTS) break;
  }
  if (!pts.length) pts.push([0, 0]);
  return increasing(pts);
}

const pwl = (pts) => `PWL(${pts.map(([t, v]) => `${num(t)} ${num(v)}`).join(' ')})`;

/**
 * The netlist of a recorded run (core/circuit-analog.js's recorded()): { text, nodes ([{ name, nets }], a node's SPICE
 * name and the circuit's nets on it), tstop (s), points (the PWL sources' in all), warnings }. Throws when the run is too
 * long for its sources (SPICE_MAX_POINTS) or nothing was recorded.
 */
export function spiceNetlist(rec, { title = 'Silinx circuit' } = {}) {
  if (!rec) throw new Error('nothing recorded: the circuit has no analog part, or its run was not recorded');
  const tstop = rec.t - rec.t0;
  if (!(tstop > 0)) throw new Error('nothing recorded: run the circuit for a while first');
  const base = rec.nodes.length, warnings = [];
  const node = (i) => (i < 0 ? '0' : i < base ? `n${i}` : `j${i - base}`);
  const lines = [`* ${title.replace(/[\r\n]+/g, ' ')}`, '* written by Silinx (#5386): the digital outputs as piecewise linear sources, one way'];
  const models = new Map();
  let points = 0, k = 0;
  const gensOf = new Map(rec.gens.map((g) => [g.e, g]));
  const seriesOf = (key, now) => rec.series.get(key) ?? [{ t: rec.t0, v: now }];
  for (const e of rec.els) {
    const a = node(e.a), b = node(e.b), id = k++;
    if (gensOf.has(e)) {   // (a function generator: its wave, through its 50 Ω)
      const pts = generatorPoints(seriesOf(gensOf.get(e), gensOf.get(e).set), rec.t0, rec.t);
      points += pts.length;
      lines.push(`VG${id} g${id} ${b} ${pwl(pts)}`, `RG${id} g${id} ${a} ${num(e.ohms)}`);
    } else if (e.kind === 'R') {
      const s = seriesOf(e, e.ohms);
      if (s.length === 1) lines.push(`R${id} ${a} ${b} ${num(s[0].v)}`);
      else {   // (a potentiometer turned while running: its conductance in time)
        const pts = stepPoints(s, rec.t0, rec.t, conductance);
        points += pts.length;
        lines.push(`VC${id} c${id} 0 ${pwl(pts)}`, `B${id} ${a} ${b} I=${vd(a, b)}*V(c${id})`);
      }
    } else if (e.kind === 'C') lines.push(`C${id} ${a} ${b} ${num(e.farads)}`);
    else if (e.kind === 'D') {
      const key = `${num(e.is)} ${num(e.n)}`;
      if (!models.has(key)) models.set(key, `D${models.size}`);
      lines.push(`D${id} ${a} ${b} ${models.get(key)}`);
    } else if (e.kind === 'V') lines.push(`V${id} ${a} ${b} DC ${num(e.volts)}`);
    else if (e.kind === 'I') lines.push(`I${id} ${a} ${b} DC ${num(e.amps)}`);
    else if (e.kind === 'VR') {   // (a source through its resistance: a digital output, a DAC's, a 74LS input's)
      const s = seriesOf(e, [e.volts, e.ohms]);
      if (s.length === 1) {
        const [v, ohms] = s[0].v;
        if (!Number.isFinite(ohms)) continue;   // (off all along)
        lines.push(`V${id} s${id} ${b} DC ${num(v)}`, `R${id} s${id} ${a} ${num(Math.max(ohms, 1e-9))}`);
      } else {
        const pv = stepPoints(s, rec.t0, rec.t, ([v]) => v), pg = stepPoints(s, rec.t0, rec.t, ([, ohms]) => conductance(ohms));
        points += pv.length + pg.length;
        lines.push(`VS${id} s${id} 0 ${pwl(pv)}`, `VC${id} c${id} 0 ${pwl(pg)}`, `B${id} ${a} ${b} I=(${vd(a, b)}-V(s${id}))*V(c${id})`);
      }
    }
    if (points > SPICE_MAX_POINTS) throw new Error(`the run is too long for ngspice's sources (more than ${SPICE_MAX_POINTS} points): record a shorter one`);
  }
  for (const [key, name] of models) { const [is, n] = key.split(' '); lines.push(`.model ${name} D(IS=${is} N=${n})`); }
  // (steps: a thousandth of the run, at most a digital edge apart where the sources change; ngspice's own control)
  lines.push(`.tran ${num(tstop / 1000)} ${num(tstop)}`, '.end');
  if (rec.regrouped != null) warnings.push(`the circuit's connections changed at ${num((rec.regrouped - rec.t0) * 1e3)} ms (a switch, a wire): ngspice ran on them as they are now`);
  return { text: lines.join('\n') + '\n', nodes: rec.nodes.map((nets, i) => ({ name: `n${i}`, nets })), tstop, points, warnings };
}

/**
 * ngspice's result (eecircuit-engine's runSim(): { dataType, data: [{ name, values }] }) read as each net's waveform:
 * { t (s, from the run's start), byNet: Map(net → its volts at each t) }. Throws on a result with no time or no node.
 */
export function readSpiceResult(result, nodes) {
  if (result?.dataType !== 'real') throw new Error('ngspice gave no transient analysis');
  const find = (name) => result.data.find((d) => d.name.toLowerCase() === name || d.name.toLowerCase() === `v(${name})`);
  const time = find('time');
  if (!time) throw new Error('ngspice gave no time');
  const byNet = new Map();
  for (const n of nodes) {
    const d = find(n.name);
    if (!d) throw new Error(`ngspice gave no voltage of ${n.name}`);
    const values = Float64Array.from(d.values);
    for (const net of n.nets) byNet.set(net, values);
  }
  return { t: Float64Array.from(time.values), byNet };
}

/** A waveform's value at `t` (s), linear between its points (its first before them, its last after). */
export function waveAt({ t }, values, at) {
  if (!t.length) return NaN;
  if (at <= t[0]) return values[0];
  let lo = 0, hi = t.length - 1;
  if (at >= t[hi]) return values[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= at) lo = m; else hi = m; }
  return values[lo] + (values[hi] - values[lo]) * (at - t[lo]) / (t[hi] - t[lo]);
}

/** The one-way co-simulation, said in the console when ngspice runs (#5386). */
export const SPICE_NOTE = 'ngspice: one way — the digital outputs, as Silinx simulated them, drive ngspice\'s analog circuit; ngspice\'s waveforms change nothing of the digital side';

// A circuit's parts as the student plays them and as the HDL's ports (#3897, #3899, docs/CIRCUITS.md): each part's
// inputs (a switch's level, a button, a DIP switch's levers, a clock) and its lamps (an LED, a display's segments, an
// LED bar's lights), named after its label: the part's own name for one, <name>_<k> for each of several. The parts'
// descriptions: core/circuit-parts.js. Isomorphic module.
import { partDef } from './circuit-parts.js';

/** A part's name as the HDL and the messages say it: its label, else its id. */
export const portName = (p) => p.label || p.id;
const portOf = (p, k) => (k == null ? portName(p) : `${portName(p)}_${k}`);

/** A part's inputs: [{ port, part, index, kind: 'level' | 'momentary' | 'clock' }]. */
export const partInputs = (p) => (partDef(p.type)?.inputs || []).map((x, index) => ({ port: portOf(p, x.k), part: p.id, index, kind: x.kind }));
/** A part's lamps: [{ port, part, index, a, k }] (its anode's and cathode's pin numbers). */
export const partLamps = (p) => (partDef(p.type)?.lamps || []).map((x, index) => ({ port: portOf(p, x.name), part: p.id, index, a: x.a, k: x.k }));

/** A part's inputs as saved: a switch's levels (its `on`, a DIP switch's list), a button released, a clock at 0. */
export function savedInputs(p) {
  const d = partDef(p.type);
  return (d?.inputs || []).map((x, i) => (x.kind === 'level' ? !!(Array.isArray(p.on) ? p.on[i] : p.on) : false));
}

// ------------------------------------------------------------------ buses (#3901)
// a single port's label `name[k]` is bit k of the vector port `name` (a board's LEDs, switches, buttons: led[0]…)
const BUS_RE = /^([A-Za-z][A-Za-z0-9_]*)\[(\d+)\]$/;
/** A port's name split: { base, bit } of a bus's bit, else { base: name, bit: null }. */
export function busOf(name) { const m = BUS_RE.exec(String(name)); return m ? { base: m[1], bit: Number(m[2]) } : { base: String(name), bit: null }; }
/** A port in an expression of the HDL: a bus's bit `led(0)` (VHDL) / `led[0]` (Verilog), else its name. */
export function portRef(name, vhdl) { const b = busOf(name); return b.bit == null ? b.base : vhdl ? `${b.base}(${b.bit})` : `${b.base}[${b.bit}]`; }
/** The module's ports declared: [{ name, dir: 'in' | 'out', width }] (width: a bus's, null a scalar), the buses once, in order. */
export function portDecls(ports) {
  const out = [], seen = new Map();
  for (const [dir, list] of [['in', ports.inputs], ['out', ports.outputs]]) {
    for (const x of list) {
      const b = busOf(x.name);
      if (b.bit == null) { out.push({ name: b.base, dir, width: null }); continue; }
      if (!seen.has(b.base)) { const d = { name: b.base, dir, width: 0 }; seen.set(b.base, d); out.push(d); }
      seen.get(b.base).width = Math.max(seen.get(b.base).width, b.bit + 1);
    }
  }
  return out;
}

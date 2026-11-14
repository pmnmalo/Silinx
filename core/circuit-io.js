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

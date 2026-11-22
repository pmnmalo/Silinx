// Usability tests (#5148): a digital circuit's invariants (a breadboard's parts and wires, docs/CIRCUITS.md), checked after
// every step of a scenario, as the schematic's (lib/sch-invariants.js): each check gives the list of what is wrong, as
// sentences that say where; [] when it holds. Built on core's own functions (circuitNets, checkCircuit, generateCircuit,
// compile, elaborate).
import { circuitNets } from '../../../core/circuit-net.js';
import { checkCircuit } from '../../../core/circuit-check.js';
import { generateCircuit } from '../../../core/circuit-hdl.js';
import { normalizeCircuit } from '../../../core/circuit.js';
import { compile, elaborate } from '../../../core/compile.js';

const pt = (p) => `(${p[0]}, ${p[1]})`;

/** Where each wire's end is: 'pin', 'hole' or 'wire' (another wire's end on its point), or 'free'. Map(id → [a, b]). */
function endsOf(m) {
  const { at } = circuitNets(m);
  const out = new Map();
  for (const w of m.wires) {
    out.set(w.id, [w.points[0], w.points.at(-1)].map((p) => {
      const s = at.get(`${p[0]},${p[1]}`);
      return s?.pins.length ? 'pin' : s?.holes.length ? 'hole' : s?.ends.some((e) => e.wire !== w.id) ? 'wire' : 'free';
    }));
  }
  return out;
}

/** The wires' ends on nothing (no pin, no hole, no other wire's end): [{ wire, end, at, text }]. */
export function circDangling(m) {
  const out = [];
  for (const [id, ends] of endsOf(normalizeCircuit(m))) {
    const w = m.wires.find((x) => x.id === id);
    ends.forEach((e, i) => { if (e === 'free') { const p = i ? w.points.at(-1) : w.points[0]; out.push({ wire: id, end: i, at: p, text: `wire ${id}'s end ${pt(p)} on nothing` }); } });
  }
  return out;
}

/** The wires' ends on a pin, a hole or a wire before a step and on nothing after it (`except`: those it may free). */
export function circDetached(before, after, { except = [] } = {}) {
  const [b, a] = [endsOf(normalizeCircuit(before)), endsOf(normalizeCircuit(after))];
  const out = [];
  for (const [id, ends] of a) {
    if (except.includes(id) || !b.has(id)) continue;
    ends.forEach((e, i) => { if (e === 'free' && b.get(id)[i] !== 'free') out.push(`wire ${id}'s ${i ? 'last' : 'first'} end came off its ${b.get(id)[i]}`); });
  }
  return out;
}

/** The nets as the pins on each ('U1.3'), sorted (the nets with a pin): what a move must not change. */
export function circNets(m) {
  return circuitNets(normalizeCircuit(m)).nets.filter((n) => n.pins.length).map((n) => n.pins.map((q) => `${q.part}.${q.n}`).sort().join(' ')).sort();
}

/** The circuit's check (its Check's, the console's): its messages ('warning: …'). */
export function circDiagnostics(m) {
  return checkCircuit(normalizeCircuit(m)).map((d) => `${d.severity}: ${d.message}`);
}

/** The HDL made from the circuit, in VHDL and in Verilog, compiled and elaborated: the errors ([] when none). */
export function circHdlErrors(m) {
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    let g;
    try { g = generateCircuit(m, lang); } catch (e) { out.push(`${lang}: generated: ${e.message}`); continue; }
    if (g instanceof Error) { out.push(`${lang}: generated: ${g.message}`); continue; }
    const lib = compile([{ path: g.filename, lang, text: g.code }]);
    const errs = lib.errors.filter((x) => x.severity === 'error');
    for (const e of errs) out.push(`${lang}: compile: ${e.message}`);
    if (errs.length) continue;
    for (const e of elaborate(lib, g.module).diags.filter((x) => x.severity === 'error')) out.push(`${lang}: elaborate: ${e.message}`);
  }
  return out;
}

/** The circuit's invariants (but its loose wire ends, which the session checks for new wires): its check's errors (two
 *  leads in one hole, a short circuit…), wires of fewer than two points. */
export function circInvariants(m) {
  const res = {
    'errors': circDiagnostics(m).filter((x) => x.startsWith('error')),
    'bad wires': m.wires.filter((w) => w.points.length < 2).map((w) => `wire ${w.id} has ${w.points.length} point`),
  };
  return Object.fromEntries(Object.entries(res).filter(([, v]) => v.length));
}

/** The circuit's kit for a session (lib/session.js). */
export const CIRC_CHECKS = {
  invariants: (m) => circInvariants(m),
  hdlErrors: (m) => circHdlErrors(m),
  detached: (b, a, o) => circDetached(b, a, o),
  dangling: (m) => circDangling(m),
};

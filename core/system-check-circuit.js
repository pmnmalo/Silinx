// Silinx - a System's circuit nodes checked (#5215, core/system-check.js's, docs/SYSTEMS.md): a circuit node's own fields
// (its circuit, a .circ.json of the project; no interfaces), and, its circuit read, its boards (each a node of the
// System of that board, by its label) and their pins (an FPGA's on a port of its module, not an inout one; a 5 V
// Arduino's pin and a 3.3 V FPGA's input on one net; a node's pin both a link's and the circuit's). Isomorphic module.
import { circuitNodePins } from './system-circuit.js';

const node = (id) => ({ kind: 'node', id });
const up = (s) => String(s).toUpperCase();

/** A circuit node's fields: its circuit given, a .circ.json, in the project (`files`; null: not checked); no interfaces. */
export function checkCircuitFields(n, { files }, { err }) {
  const ref = node(n.id);
  if (!n.circuit) err(`${n.id}: a circuit node with no circuit (a .circ.json of the project)`, ref);
  else if (!/\.circ\.json$/i.test(n.circuit)) err(`${n.id}: its circuit ${n.circuit} is not a .circ.json`, ref);
  else if (files && !files.includes(n.circuit)) err(`${n.id}: no circuit ${n.circuit} in the project`, ref);
  if (n.interfaces.length) err(`${n.id}: a circuit node has no interfaces: its boards' pins it wires are its links`, ref);
}

/**
 * The circuit nodes whose circuits are read (`circuits`: { path: its circuit, normalized }; null: not checked): their
 * boards and pins, said; a node's pin also a link's (`wires`, analyzeSystem's) an error. Returns the nodes they reach
 * (their ids, lower case, the circuit nodes' too).
 */
export function checkCircuitNodes(sys, { circuits, modules }, wires, { err, warn }) {
  const used = new Set();
  for (const n of sys.nodes.filter((x) => x.kind === 'circuit' && x.circuit && circuits?.[x.circuit])) {
    const r = circuitNodePins(sys, n, circuits[n.circuit], { ports: modules });
    for (const p of r.problems) (p.severity === 'error' ? err : warn)(p.message, node(n.id));
    if (r.boards.length) used.add(n.id.toLowerCase());
    for (const b of r.boards) used.add(b.node.toLowerCase());
    for (const q of r.pins) {
      const mine = q.port ?? q.nodePin;
      const w = wires.find((x) => [x.from, x.to].some((e) => e.node === q.node && up(e.pin) === up(mine)));
      if (w) err(`${n.id}: ${q.node}'s ${mine} is both the link ${w.link}'s and the circuit's (${q.part} ${q.pin})`, node(n.id));
    }
  }
  return used;
}

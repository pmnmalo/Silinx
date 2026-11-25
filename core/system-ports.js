// Silinx - a System node's typed ports (#5485, roadmap #5479, docs/SYSTEMS.md "The node contract"): each port of a
// node with its direction, its kind (what crosses it: a pin's levels, a bus's transactions, a memory-mapped bus's reads
// and writes, an analog voltage, a network's messages) and its electrical level (3.3 V or 5 V: the check compares them,
// #5498, whatever the nodes are). The link kinds that join them: core/system-links.js; the node contract:
// core/system-contract.js. Isomorphic module (browser + Node).
//
//   port({ name: 'tx', dir: 'out', kind: 'pin', volts: 3.3 })
//   port({ name: 'Serial', dir: 'inout', kind: 'transaction', protocol: 'uart', role: 'peer', volts: 5 })

/** What crosses a port: a pin's levels (events), a transaction bus's bytes and transactions, a memory-mapped bus's
 *  reads and writes, an analog voltage, a network's messages. */
export const PORT_KINDS = ['pin', 'transaction', 'memory', 'analog', 'message'];
/** A port's direction: an input, an output, both (a pad driven or released, a bus). */
export const PORT_DIRS = ['in', 'out', 'inout'];
/** The I/O levels the check compares (V): a 5 V output on a 3.3 V input (#5498). An FPGA's bank may be at another
 *  (2.5 V, 1.8 V: its I/O standard's); null: not known. */
export const LEVELS = [3.3, 5];

/** The roles a port may have on its link: a transaction bus's master and peripheral (a UART's ends peers), a
 *  memory-mapped bus's manager and subordinate, a network's client and broker. */
export const PORT_ROLES = ['master', 'peripheral', 'peer', 'manager', 'subordinate', 'client', 'broker'];

/** Why `p` is no typed port ({ name, dir, kind, volts, width, protocol, role }), or null. */
export function portProblem(p) {
  if (!p || typeof p !== 'object') return 'a port is an object { name, dir, kind }';
  if (!p.name || typeof p.name !== 'string') return 'a port with no name';
  if (!PORT_DIRS.includes(p.dir)) return `${p.name}: its direction '${p.dir ?? ''}' is not ${PORT_DIRS.join(', ')}`;
  if (!PORT_KINDS.includes(p.kind)) return `${p.name}: no port kind '${p.kind ?? ''}' (the kinds: ${PORT_KINDS.join(', ')})`;
  if (p.volts != null && !(typeof p.volts === 'number' && p.volts > 0)) return `${p.name}: its level '${p.volts}' is not a voltage (V)`;
  if (!(Number.isInteger(p.width) && p.width >= 1)) return `${p.name}: its width '${p.width}' is not 1 or more`;
  if (p.role != null && !PORT_ROLES.includes(p.role)) return `${p.name}: no role '${p.role}' (the roles: ${PORT_ROLES.join(', ')})`;
  if (p.kind === 'pin' && p.protocol != null) return `${p.name}: a pin has no protocol (a transaction bus's port has)`;
  return null;
}

/** A typed port, frozen: { name, dir, kind ('pin' by default), volts (null: not known), width (1), protocol (a bus's:
 *  'uart', 'spi'…; null), role (null) }. Throws on a field that is wrong. */
export function port({ name, dir, kind = 'pin', volts = null, width = 1, protocol = null, role = null }) {
  const p = { name, dir, kind, volts, width, protocol, role };
  const why = portProblem(p);
  if (why) throw new Error(why);
  return Object.freeze(p);
}

/** Whether a port can drive a link (an output, or both ways). */
export const drives = p => p.dir === 'out' || p.dir === 'inout';
/** Whether a port can be driven (an input, or both ways). */
export const reads = p => p.dir === 'in' || p.dir === 'inout';

/** A node's ports checked: [text] (each port's problem; two ports of one name), empty when they are all right. */
export function portsProblems(ports) {
  if (!Array.isArray(ports)) return ['the ports are a list'];
  const out = [], seen = new Set();
  for (const p of ports) {
    const why = portProblem(p);
    if (why) { out.push(why); continue; }
    if (seen.has(p.name)) out.push(`two ports are named ${p.name}`);
    seen.add(p.name);
  }
  return out;
}

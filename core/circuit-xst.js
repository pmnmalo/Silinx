// XST's warnings on a digital circuit's chips left out of an ISE run (#4020, docs/CIRCUITS.md): a chip's output nothing
// reads is normal on a breadboard (the real chip has the pin anyway), but the circuit's digital model (core/circuit-digital.js)
// instances the chip's digital architecture with that output open, and XST warns on the open port (Xst:753) and on
// the flip-flops behind it it trims (Xst:2677), in the chip's block and in the top. Only those two messages, and only
// on a circuit's chip instances (named from its generated HDL): an instance elsewhere still warns. Isomorphic module.

// (the header core/circuit-hdl.js writes, its module's name; the digital model's instances, d_<part> of <circuit>_<chip>)
const GENERATOR = /^(?:--|\/\/) Generator {3}: Silinx circuit editor/m;
const MODULE = /^(?:--|\/\/) (?:Entity|Module) {6}: (\w+)$/m;
const VHDL_INST = /^ {2}(d_\w+) : entity work\.(\w+) port map \(/gm;
const VERILOG_INST = /^ {2}(\w+) (d_\w+) \(\./gm;

/** A circuit's names in its generated HDL: { module, entities, instances } (lower case), or null for any other file. */
export function circuitXstNames(text) {
  const t = String(text ?? '');
  const m = MODULE.exec(t);
  if (!GENERATOR.test(t) || !m) return null;
  const module = m[1].toLowerCase(), entities = new Set(), instances = new Set();
  const chip = (inst, ent) => { if (ent.toLowerCase().startsWith(`${module}_`)) { instances.add(inst.toLowerCase()); entities.add(ent.toLowerCase()); } };
  for (const [, inst, ent] of t.matchAll(VHDL_INST)) chip(inst, ent);
  for (const [, ent, inst] of t.matchAll(VERILOG_INST)) chip(inst, ent);
  return { module, entities, instances };
}

const PORT = /^WARNING:Xst:753 - .*Unconnected output port '\w+' of component '(\w+)'\./;
const NODE = /^WARNING:Xst:2677 - Node <([^>]+)> of sequential type is unconnected in block <([^>]+)>\./;

/** Whether an ISE log line is one of XST's warnings on a circuit's chip (circuits: circuitXstNames' of the design). */
export function isCircuitXstWarning(line, circuits) {
  const l = String(line), cs = (circuits || []).filter(Boolean);
  if (!cs.length) return false;
  const p = PORT.exec(l);
  if (p) return cs.some((c) => c.entities.has(p[1].toLowerCase()));
  const n = NODE.exec(l);
  if (!n) return false;
  const node = n[1].toLowerCase().split('/'), block = n[2].toLowerCase();
  // (in the chip's own block; in the circuit's, under one of its chips; in a block above it, under one of its chips)
  return cs.some((c) => c.entities.has(block) || (block === c.module ? node.length > 1 && c.instances.has(node[0]) : node.slice(1, -1).some((s) => c.instances.has(s))));
}

/** The console's note on the warnings left out (none: null). */
export const circuitXstNote = (n) => (n ? `INFO:Silinx - ${n} warning(s) of XST left out: a circuit's chip output nothing reads (Xst:753) and the flip-flops behind it (Xst:2677), normal on a breadboard (#4020).` : null);

// A KiCad part modelled by a module of the project (#4283, #4278, docs/CIRCUITS.md): its symbol's property Silinx.HDL
// names a VHDL entity or a Verilog module of the project, whose ports are the part's pins: by their names (A → a,
// ~{EN} → en_n), or as Silinx.Ports maps them ("1=a, 2=y"). The circuit's generated HDL instantiates that module for the
// part, in its simulation's model and in its digital one (core/circuit-hdl.js, core/circuit-digital.js), so that the
// circuit's HDL simulates and synthesizes with it; Try it does not run it yet (#4284): its check says so. The part's
// pins are in its footprint's places (core/circuit-kicad.js pinPlaces); its supply pins are no ports. The checks against
// the project's modules (a module missing, a port without a pin, a pin without a port, their directions): checkModels.
// Isomorphic module.
import { pinText } from './kicad-sym.js';

const NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED = new Set(['in', 'out', 'inout', 'input', 'output', 'wire', 'reg', 'signal', 'entity', 'module', 'begin', 'end', 'is', 'of', 'port', 'map', 'not', 'and', 'or', 'xor', 'open']);
// (a KiCad pin's type as a module's port: in, out; a supply or no-connect pin none)
const PORT_DIR = { input: 'in', output: 'out', tri_state: 'out', open_collector: 'out', open_emitter: 'out' };

/** The ports Silinx.Ports maps: Map(pin number → port name); throws on a text that is not "1=a, 2=y". */
export function portsProperty(text) {
  const out = new Map();
  for (const item of String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=\s]+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)$/.exec(item);
    if (!m) throw new Error(`its Silinx.Ports '${text}' is not a list of pin=port (1=a, 2=y)`);
    out.set(m[1], m[2].toLowerCase());
  }
  return out;
}

/**
 * A symbol (`pins`: its pins, core/circuit-kicad.js symbolPins; `props`: its properties) modelled by the module of its
 * Silinx.HDL, its pins at `places` (Map(number → { dx, dy })): { pins, module } or { error }. A pin's port is its name
 * in lower case (an overlined one's with _n), or Silinx.Ports'; a bidirectional or passive pin is refused (a port is in or
 * out), as a name that is no HDL name and two pins of one port.
 */
export function modelPins(pins, props, places) {
  const module = String(props['Silinx.HDL']).trim();
  if (!NAME.test(module.toLowerCase())) return { error: `its Silinx.HDL '${module}' is not an HDL name` };
  let mapped;
  try { mapped = portsProperty(props['Silinx.Ports']); } catch (e) { return { error: e.message } ; }
  const out = [], seen = new Map();
  for (const p of pins) {
    const t = pinText(p.name), at = places.get(p.number);
    const base = { n: Number.isInteger(Number(p.number)) ? Number(p.number) : p.number, name: t.text || p.number, kicadType: p.type, ...at };
    if (p.type === 'power_in' || p.type === 'power_out' || p.type === 'no_connect') { out.push({ ...base, dir: 'none' }); continue; }
    const dir = PORT_DIR[p.type];
    if (!dir) return { error: `its pin ${p.number} (${t.text || 'no name'}) is ${p.type}: a module's port is an input or an output` };
    const port = mapped.get(p.number) ?? `${t.text.toLowerCase()}${t.low ? '_n' : ''}`;
    if (!NAME.test(port) || RESERVED.has(port) || /__|_$/.test(port)) return { error: `its pin ${p.number}'s name '${t.text}' is not an HDL name: give it one in Silinx.Ports (${p.number}=a)` };
    if (seen.has(port)) return { error: `its pins ${seen.get(port)} and ${p.number} are both the port ${port}` };
    seen.set(port, p.number);
    out.push({ ...base, dir, port });
  }
  if (!seen.size) return { error: 'it has no pin that is an input or an output: no port for its module' };
  return { pins: out, module };
}

/**
 * The checks of a circuit's parts modelled by a module, against the project's modules (`modules`: { name: { ports: [{
 * name, dir }] } }, core/schdoc-from-hdl.js modulesFromLibrary's): their errors through `err`, each part's warning (Try it
 * does not run it) through `warn`. `modules` null: the warning only (the project's modules not at hand).
 */
export function checkModels(parts, defOf, modules, { err, warn }, ref) {
  const byName = modules && new Map(Object.entries(modules).map(([k, v]) => [k.toLowerCase(), v]));
  for (const p of parts) {
    const d = defOf(p.type);
    if (d?.kind !== 'model') continue;
    const who = `${p.id} (${d.kicad.value})`;
    warn(`${who} is simulated by its module ${d.module} in the HDL only: Try it does not run it`, ref(p.id));
    if (!byName) continue;
    const mod = byName.get(d.module.toLowerCase());
    if (!mod) { err(`${who}: no module '${d.module}' in the project`, ref(p.id)); continue; }
    const ports = new Map((mod.ports || []).map((x) => [x.name.toLowerCase(), x]));
    for (const q of d.pins.filter((x) => x.port)) {
      const x = ports.get(q.port);
      if (!x) err(`${who}: its module ${d.module} has no port ${q.port} (its pin ${q.n})`, ref(p.id));
      else if (x.dir !== q.dir) err(`${who}: its pin ${q.n} (${q.name}) is an ${q.dir === 'in' ? 'input' : 'output'}, its module ${d.module}'s port ${q.port} ${x.dir === 'in' ? 'an input' : x.dir === 'out' ? 'an output' : x.dir}`, ref(p.id));
      else if ((x.width ?? 1) !== 1) err(`${who}: its module ${d.module}'s port ${q.port} is ${x.width} bits wide, a pin one`, ref(p.id));
    }
    for (const x of ports.values()) if (!d.pins.some((q) => q.port === x.name.toLowerCase())) err(`${who}: its module ${d.module}'s port ${x.name} has no pin`, ref(p.id));
  }
}

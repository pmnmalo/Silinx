// A circuit's schematic (#4069, docs/CIRCUITS.md): generated from it, read-only, a badge of its row in the Design pane (as
// a Boolean algebra's, #694) and the MCP's related_view: the circuit's HDL in its logic form (core/circuit-hdl.js, its
// digital model, what synthesis reads: core/translate-off.js) drawn as a schematic (core/schdoc-from-hdl.js: the gate
// ICs' gates as gates, the other ICs as blocks of their own modules, the switches and LEDs as its I/O markers). Not a
// file of the project. Isomorphic module.
import { normalizeCircuit } from './circuit.js';
import { generateCircuit } from './circuit-hdl.js';
import { synthesisText } from './translate-off.js';
import { compile, elaborate } from './compile.js';
import { schematicFromHdl, modulesFromLibrary } from './schdoc.js';

/** The circuit `model`'s schematic: { doc, modules } (modules: its blocks' own, for the schematic's module symbols), or
 *  { errors: [message] } when the circuit has errors. `layout`: an ELK-style layout function (optional). */
export async function circuitSchematic(model, { layout } = {}) {
  const m = normalizeCircuit(model);
  let g;
  try { g = generateCircuit(m, m.lang, { source: `${m.name}.circ.json` }); } catch (e) { return { errors: (e.diagnostics || [e]).map((d) => d.message) }; }
  const path = `${m.name}.${m.lang === 'verilog' ? 'v' : 'vhd'}`, text = synthesisText(g.code), sources = { [path]: text };
  const lib = compile([{ path, text }]);
  const errs = lib.errors.filter((e) => e.severity === 'error');
  if (errs.length) return { errors: errs.map((e) => e.message) };
  const d = elaborate(lib, g.module);
  if (!d.top) return { errors: (d.diags || []).map((e) => e.message) };
  const modules = modulesFromLibrary(lib, { sources });
  const doc = await schematicFromHdl(d.top, { sources, modules, layout, lang: m.lang, name: m.name });
  return { doc, modules };
}

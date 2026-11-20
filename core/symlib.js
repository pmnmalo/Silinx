// The palette's compositions (#4806): a high-level symbol of the schematic palette as a hierarchy of drawings down to
// the gates (ADD8: two ADD4; ADD4: four FA1; FA1: two XOR, two AND and an OR), generated from the symbol's parameters,
// for a student to open and push into level by level. They are views: the HDL Silinx generates for a symbol is its
// own, unchanged (its synthesis and simulation as they are, #4806's measurements), each composition proved equivalent
// to it by the tests (test/symlib.test.js). Each level is an ordinary schematic (core/symlib-draw.js). Isomorphic.
import { defaultParams, generateHdl, int, symbolTypeName } from './schdoc.js';
import { library } from './symlib-draw.js';
import { addTop, subTop } from './symlib-add.js';

// the families composed so far, each a function (library, parameters) → its top module
const FAMILIES = { add: addTop, sub: subTop };
// (wiring, not parts: left out of a level's list)
const WIRING = new Set(['slice', 'busjoin']);

/** Whether symbols of `type` have a composition. */
export const hasComposition = type => Object.hasOwn(FAMILIES, type);

/**
 * The composition of a symbol of `type` with `params` (the defaults for the ones left out), or null when it has none:
 * { symbol: its name (ADD8), top: its top module's name, modules: [{ name, ports, doc }] the top first, then each level
 * below in the order they are reached }.
 */
export function composition(type, params = {}) {
  if (!hasComposition(type)) return null;
  const p = { ...defaultParams(type), ...params };
  p.width = Math.max(1, int(p.width, 1));
  const lib = library();
  const top = FAMILIES[type](lib, p);
  // (the modules in the order of a walk from the top: a level before the ones it holds)
  const order = [], seen = new Set(), walk = name => {
    if (seen.has(name)) return;
    seen.add(name);
    const m = lib.modules.get(name);
    order.push(m);
    for (const s of m.doc.symbols) if (s.type === 'module') walk(s.params.module);
  };
  walk(top.name);
  return { symbol: symbolTypeName({ type, params: p }), top: top.name, modules: order };
}

/** The parts of a level: [{ name, count, module }] (a module of the composition, or a gate / constant by its title). */
export function levelParts(level) {
  const counts = new Map();
  for (const s of level.doc.symbols) {
    if (WIRING.has(s.type)) continue;
    const name = s.type === 'module' ? s.params.module : symbolTypeName(s);
    const k = counts.get(name) || { name, count: 0, module: s.type === 'module' };
    k.count++;
    counts.set(name, k);
  }
  return [...counts.values()];
}

/** A level's parts as a line: "ADD8 = 2 × ADD4". */
export const levelLine = level => `${level.name} = ${levelParts(level).map(p => (p.count > 1 ? `${p.count} × ${p.name}` : p.name)).join(' + ')}`;

/**
 * The HDL of a composition in `lang` (vhdl / verilog): every level's, the lowest first, as generateHdl writes a
 * schematic's; { code, diagnostics } (each diagnostic with its module).
 */
export function compositionHdl(comp, lang) {
  const modules = Object.fromEntries(comp.modules.map(m => [m.name, { name: m.name, ports: m.ports.map(({ side, ...q }) => q), symbol: m.symbol }]));
  const parts = [], diagnostics = [];
  for (const m of [...comp.modules].reverse()) {
    const r = generateHdl(m.doc, { lang, modules });
    parts.push(r.code);
    for (const d of r.diagnostics) diagnostics.push({ ...d, module: m.name });
  }
  return { code: parts.join('\n'), diagnostics };
}

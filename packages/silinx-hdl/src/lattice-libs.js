// Silinx - which Lattice primitives' library a compilation needs (#2299), for unisim.js primitiveSources: the iCE40's
// (ice40-prims.js) for a design that instantiates one of its cells (a Verilog instance: Yosys's synth_ice40 netlist, or a
// user's) or uses its VHDL library (`library sb_ice40_components_syn;`).
import { ICE40_SOURCE, ICE40_CELLS, usesIce40 } from './ice40-prims.js';

const isVerilog = (s) => (s.lang ? s.lang === 'verilog' : /\.(v|vh|sv)$/i.test(String(s.path || '')));
const strip = (t) => String(t || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
// an instance: its module's name (an instance's name may be escaped, as Yosys writes it: \dec.q2_DFF_Q)
const INSTANCE = /(?:^|[;\s)])([A-Za-z][A-Za-z0-9_]*)(?![\w$])\s*(?:#\s*\(|(?:[A-Za-z_][\w$]*|\\\S+)\s*(?:\[[^\]]*\]\s*)?\()/g;

// the libraries: their source, cells, and VHDL library test
const LIBS = [{ source: ICE40_SOURCE, cells: ICE40_CELLS, vhdl: usesIce40 }];

/** True if a Verilog source instantiates one of `cells` not one of `defined` (upper case). */
function vlogUses(text, cells, defined) {
  for (const m of strip(text).matchAll(INSTANCE)) if (cells.has(m[1]) && !defined.has(m[1].toUpperCase())) return true;
  return false;
}

/** The Lattice libraries' sources `sources` need (none twice, none already among them). */
export function latticeSources(sources) {
  const list = sources || [];
  const defined = new Set();
  for (const s of list) {
    const t = isVerilog(s) ? strip(s.text) : String(s.text || '');
    for (const m of t.matchAll(isVerilog(s) ? /\b(?:module|macromodule|primitive)\s+([A-Za-z_]\w*)/g : /\bentity\s+([A-Za-z_]\w*)\s+is\b/gi)) defined.add(m[1].toUpperCase());
  }
  const have = new Set(list.map((s) => s.path));
  return LIBS.filter((l) => !have.has(l.source.path) && list.some((s) => (isVerilog(s) ? vlogUses(s.text, l.cells, defined) : l.vhdl(s.text))))
    .map((l) => l.source);
}

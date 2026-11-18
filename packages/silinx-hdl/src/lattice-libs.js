// Silinx - which Lattice primitives' library a compilation needs (#2299), for unisim.js primitiveSources: the iCE40's
// (ice40-prims.js) or the ECP5's (ecp5-prims.js) for a design that instantiates one of its cells (a Verilog instance: Yosys's
// synth_ice40 / synth_ecp5 netlist, or a user's) or uses its VHDL library (`library sb_ice40_components_syn;`, `library
// ecp5u;`), and the GateMate's (gatemate-prims.js, #2431: Cologne Chip's) the same way. The ECP5's LUT4, LUT2, INV and GSR are UNISIM's or Gowin's names too: one of them is the ECP5's by its pins (Z,
// GSR's GSR).
import { ICE40_SOURCE, ICE40_CELLS, usesIce40 } from './ice40-prims.js';
import { ECP5_SOURCE, ECP5_CELLS, usesEcp5 } from './ecp5-prims.js';
import { GATEMATE_SOURCE, GATEMATE_CELLS, usesGatemate } from './gatemate-prims.js';

const isVerilog = (s) => (s.lang ? s.lang === 'verilog' : /\.(v|vh|sv)$/i.test(String(s.path || '')));
const strip = (t) => String(t || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
// an instance: its module's name (an instance's name may be escaped, as Yosys writes it: \dec.q2_DFF_Q)
const INSTANCE = /(?:^|[;\s)])([A-Za-z][A-Za-z0-9_]*)(?![\w$])\s*(?:#\s*\(|(?:[A-Za-z_][\w$]*|\\\S+)\s*(?:\[[^\]]*\]\s*)?\()/g;

const ECP5_SHARED = new Set(['LUT4', 'LUT2', 'INV', 'GSR']);
// an instance of one of them with a pin of the ECP5's
const ECP5_PINS = /(?:^|[;\s)])(LUT4|LUT2|INV|GSR)\s*(?:#\s*\([^;]*?\)\s*)?(?:[A-Za-z_][\w$]*|\\\S+)\s*(?:\[[^\]]*\]\s*)?\([^;]*?\.(?:Z|GSR)\s*\(/g;

// the libraries: their source, cells (none of another library's names), and VHDL library test; pins: the instances of the
// names they share
const LIBS = [{ source: ICE40_SOURCE, cells: ICE40_CELLS, vhdl: usesIce40 },
  { source: ECP5_SOURCE, cells: new Set([...ECP5_CELLS].filter((n) => !ECP5_SHARED.has(n))), vhdl: usesEcp5, pins: ECP5_PINS },
  // (the GateMate's, #2431: Cologne Chip's, not Lattice's, picked the same way; its names all CC_…, no other library's)
  { source: GATEMATE_SOURCE, cells: GATEMATE_CELLS, vhdl: usesGatemate }];

/** True if a Verilog source instantiates one of a library's cells not one of `defined` (upper case). */
function vlogUses(text, lib, defined) {
  const t = strip(text);
  for (const m of t.matchAll(INSTANCE)) if (lib.cells.has(m[1]) && !defined.has(m[1].toUpperCase())) return true;
  if (lib.pins) for (const m of t.matchAll(lib.pins)) if (!defined.has(m[1])) return true;
  return false;
}

/** The names a Lattice library `sources` need (latticeSources' result) shares with UNISIM's and Gowin's: theirs no more. */
export const latticeShared = (libs) => (libs.includes(ECP5_SOURCE) ? ECP5_SHARED : new Set());

/** The Lattice libraries' sources `sources` need (none twice, none already among them). */
export function latticeSources(sources) {
  const list = sources || [];
  const defined = new Set();
  for (const s of list) {
    const t = isVerilog(s) ? strip(s.text) : String(s.text || '');
    for (const m of t.matchAll(isVerilog(s) ? /\b(?:module|macromodule|primitive)\s+([A-Za-z_]\w*)/g : /\bentity\s+([A-Za-z_]\w*)\s+is\b/gi)) defined.add(m[1].toUpperCase());
  }
  const have = new Set(list.map((s) => s.path));
  return LIBS.filter((l) => !have.has(l.source.path) && list.some((s) => (isVerilog(s) ? vlogUses(s.text, l, defined) : l.vhdl(s.text))))
    .map((l) => l.source);
}

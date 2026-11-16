// A digital circuit's part modules (#4216): its generated HDL (core/circuit-hdl.js) holds the circuit's own module and,
// before it, an entity or module of each of its ICs (core/circuit-hdl-ics.js: <circuit>_sn74ls47…), which only the
// circuit instantiates. Those are the circuit's, not modules of the project: no row of the Design pane, no entry of a
// module picker (Instantiate module, a test bench's module to test, the schematic's symbols; the MCP's test_bench_wizard,
// rename_module, convert_module); synthesis and simulation compile the file as it is. A circuit's HDL is known by its
// header (its first lines: its module, its description, the circuit editor its generator). Isomorphic module.

const HEADER = /^(?:--|\/\/)=+\r?\n(?:--|\/\/) (?:Entity|Module) +: ([A-Za-z][A-Za-z0-9_]*)\r?\n(?:--|\/\/) Description : the digital circuit [^\n]*\r?\n(?:--|\/\/) Generator +: Silinx circuit editor\b/;

/** The circuit's module a generated HDL text is of (its header's), or null for any other text. */
export function circuitModuleOf(text) {
  const r = HEADER.exec(String(text ?? ''));
  return r ? r[1] : null;
}

/** The part modules of the circuits' HDL among `sources` ([{ path, text }]) in the compiled `lib`: a Set of their names
 *  in lower case (every module of such a file but the circuit's own). */
export function circuitPartModules(lib, sources) {
  const own = new Map();
  for (const s of sources || []) { const top = circuitModuleOf(s.text); if (top) own.set(s.path, top.toLowerCase()); }
  const out = new Set();
  if (!own.size) return out;
  for (const m of lib?.modules?.values() || []) {
    const top = own.get(m.file);
    if (top && m.kind !== 'package' && m.name.toLowerCase() !== top) out.add(m.name.toLowerCase());
  }
  return out;
}

/** The modules of `lib` that are the project's: without the circuits' part modules (circuitPartModules). */
export function projectModulesOf(lib, sources) {
  const parts = circuitPartModules(lib, sources);
  return [...(lib?.modules?.values() || [])].filter((m) => !parts.has(m.name.toLowerCase()));
}

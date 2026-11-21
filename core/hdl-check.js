// The check of an HDL file (#4773): its project's sources compiled with the file's text as the editor has it, each
// of its modules elaborated, their design checks (core/lint.js) and the modules named with a reserved word: the
// diagnostics Check Syntax lists. Run in a Web Worker as one types (web/js/hdl-check-worker.js, its parses kept
// there from one check to the next: core/compile.js), and in the page (web/js/processes.js hdlDiagnostics).
import { compile, elaborate } from './compile.js';
import { reservedModuleDiags } from './reserved.js';
import { designChecks } from './lint.js';

/** path: the file checked; sources: the project's [{ path, text, lang, role }] in view (the primitives' models with
 *  them, the file's text as checked); lint: the design checks' warnings too; clean: its modules elaborated only when
 *  it reads without an error (a check as one types: no elaboration of a half-typed file); keep: the parses kept from
 *  one check to the next (the worker's: core/compile.js).
 *  -> { diags: the diagnostics (as found, duplicates too), info: the elaboration's lines (Check Syntax's log) } */
export function hdlCheck({ path, sources, lint = true, clean = false, keep = false }) {
  const lib = compile(sources, { keep });
  const units = (lib.parsed.find(p => p.file === path)?.units || []).filter(u => u.kind === 'module');
  // (+ its modules named with a reserved word, #679)
  const diags = [...lib.errors, ...reservedModuleDiags(units.map(u => ({ name: u.name, file: path, line: u.loc?.line })))];
  const info = [];
  if (clean && lib.errors.some(d => d.file === path && d.severity === 'error')) return { diags, info };
  for (const u of units) {
    let design;
    try { design = elaborate(lib, u.name); } catch (e) { diags.push({ file: path, line: u.loc?.line || 1, col: 1, severity: 'error', message: e.message }); continue; }
    let checks = [];
    try { checks = designChecks(lib, design, { lint }); } catch { /* none */ }
    diags.push(...design.diags, ...checks);
    if (design.top) info.push(`Elaborating module <${u.name}>: ${design.signals.length} signals, ${design.procs.length} processes.`);
  }
  return { diags, info };
}

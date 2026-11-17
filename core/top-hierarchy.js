// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The top's hierarchy and the files it needs (#4421): the flows that run on a top (Synthesize, Implement Design, Generate
// Programming File in every toolchain, the Board Emulator, a test bench's simulation) check and compile only them, as
// ISE does: a file with errors outside the hierarchy (a half-finished module, an old version) is left out, a warning
// saying so, and does not stop the run; one inside still does. Check Syntax (of a file, of a module, Check Design) still
// says every file's errors. Isomorphic module (browser + Node): web/js/processes.js, web/js/viewers.js,
// web/js/open-flow-browser.js, server/ise.js generateBuild, server/mcp-util.js elaborateView.
//
//   topFiles(lib, top)                       { files, modules, packages, unresolved } of the top's hierarchy
//   leftOut(lib, top, errorFiles, owners)    the files of errorFiles the hierarchy does not need: [path]
//   hierarchySources(sources, top, { headers })   { sources, left: [{ path, errors }] }: the sources without those
//   leftOutDiag(path, top), leftOutWarning(l, top)   the warning of a file left out (a diagnostic, a log line)
//   hierarchyDiags(diags, lib, top, owners)  a check's diagnostics with those of the files left out replaced by it
import { compile } from './compile.js';
import { findModule } from './elaborate.js';
import { primitiveSources } from './unisim.js';
import { walkItems } from './util.js';

const lc = s => String(s || '').toLowerCase();
const isError = d => (d.severity || 'error') === 'error';
// a file only `include'd (a header): never left out, a file of the hierarchy reading it
const HEADER = /\.(vh|svh|h|inc|vinc)$/i;

/** The top's hierarchy in the compiled library `lib`: the files declaring its modules (entity and architecture) and
 *  packages, the names (lower case) of the modules it instantiates and of the packages they use, and those of them the
 *  library has not (`unresolved`: a module of a file that does not read, a missing one). */
export function topFiles(lib, top) {
  const files = new Set(), modules = new Set(), packages = new Set(), unresolved = new Set();
  const svPackages = [...lib.packages.values()].filter(p => p.lang === 'verilog');
  const pkg = name => {
    if (packages.has(lc(name))) return;
    packages.add(lc(name));
    const p = lib.packages.get(name) || [...lib.packages.values()].find(x => lc(x.name) === lc(name));
    if (!p) { unresolved.add(lc(name)); return; }
    files.add(p.file);
    for (const u of p.uses || []) pkg(u);
  };
  const queue = [top];
  while (queue.length) {
    const name = queue.pop();
    if (modules.has(lc(name))) continue;
    modules.add(lc(name));
    const m = findModule(lib, name);
    if (!m) { unresolved.add(lc(name)); continue; }
    files.add(m.file);
    if (m.archFile) files.add(m.archFile);
    for (const u of m.uses || []) pkg(u);
    // (a SystemVerilog module reads any package by its scoped names, p::W: every one)
    if (m.lang === 'verilog' || /\.(v|sv)$/i.test(m.file || '')) for (const p of svPackages) pkg(p.name);
    walkItems(m.items, it => { if (it.kind === 'instance' && it.module) queue.push(it.module); });
  }
  return { files, modules, packages, unresolved };
}

// the names a file declares: its units' (an architecture: its entity's), else, a file read with no unit, by its text
function declared(pf) {
  const names = pf.units.map(u => lc(u.kind === 'architecture' ? u.entity : u.name)).filter(Boolean);
  if (names.length) return names;
  return [...String(pf.text || '').matchAll(/\b(?:entity|module|package|macromodule)\s+(?:body\s+)?([A-Za-z_]\w*)/gi)].map(m => lc(m[1]));
}

/** The files of `errorFiles` (paths with errors) the top's hierarchy does not need: not a file of its modules or
 *  packages, declaring no name it instantiates and the library has not, not `include'd by one of its files, not a header;
 *  owners: [{ file, module }] of the files that are no HDL of the library (a C source whose HDL cannot be made): left out
 *  when their module is none of the hierarchy's. */
export function leftOut(lib, top, errorFiles, owners = []) {
  const bad = new Set(errorFiles);
  if (!bad.size || !top || !findModule(lib, top)) return [];
  const h = topFiles(lib, top);
  const parsed = lib.parsed || [];
  const needed = new Set(h.files);
  // (the files a file of the hierarchy includes: by their names)
  const included = new Set(parsed.filter(pf => needed.has(pf.file)).flatMap(pf => [...String(pf.text || '').matchAll(/`include\s+"([^"]+)"/g)].map(m => lc(m[1].split(/[\\/]/).pop()))));
  const out = [];
  for (const pf of parsed) {
    if (!bad.has(pf.file) || needed.has(pf.file) || HEADER.test(pf.file) || included.has(lc(String(pf.file).split(/[\\/]/).pop()))) continue;
    const names = declared(pf);
    // (a file that reads as nothing: perhaps the module the hierarchy misses, kept)
    if (!names.length && h.unresolved.size) continue;
    if (names.some(n => h.unresolved.has(n))) continue;
    out.push(pf.file);
  }
  for (const o of owners) if (bad.has(o.file) && o.module && !h.modules.has(lc(o.module)) && !out.includes(o.file)) out.push(o.file);
  return out;
}

/** The sources ([{ path, lang, text, … }]) the top's hierarchy needs: those with errors it does not need left out
 *  (`left`: [{ path, errors: ['line: message'] }]); every source when none has errors. lib: their compiled library
 *  (with the primitives), when it is at hand; headers: the files the sources may `include ([{ path, text }]: the
 *  project's .vh, which the build copies), compiled with them, never returned. */
export function hierarchySources(sources, top, { lib, headers = [] } = {}) {
  lib ||= compile([...primitiveSources(sources), ...sources, ...headers.filter(h => !sources.some(s => s.path === h.path))]);
  const errs = lib.errors.filter(isError);
  if (!errs.length) return { sources, left: [] };
  const paths = leftOut(lib, top, errs.map(e => e.file));
  if (!paths.length) return { sources, left: [] };
  const drop = new Set(paths);
  return { sources: sources.filter(s => !drop.has(s.path)), left: paths.map(path => ({ path, errors: errs.filter(e => e.file === path).map(e => `${e.line}: ${e.message}`) })) };
}

const count = n => `${n} error${n === 1 ? '' : 's'}`;
/** The message of a file left out (a diagnostic's: its file said before it). */
const leftOutMessage = (top, n) => `not in the hierarchy of the top module '${top}': left out${n ? `, its ${count(n)} not checked (Check Syntax shows them)` : ''}`;
/** The warning of a file left out, as a log line's text (a flow's: "WARNING: " before it). */
export const leftOutWarning = ({ path, errors = [] }, top) => `${path} is ${leftOutMessage(top, errors.length)}`;
/** The warning of a file left out, as a check's diagnostic (its file said, no line). */
export const leftOutDiag = (file, top, n) => ({ severity: 'warning', file, line: 0, col: 0, tool: 'Silinx', drawn: true, message: leftOutMessage(top, n) });

/** A check's diagnostics (`diags`) for a run of the top: those of the files with errors its hierarchy does not need
 *  (leftOut) replaced by the warning that they are left out; `lib` the checked sources' library. */
export function hierarchyDiags(diags, lib, top, owners = []) {
  const files = [...new Set(diags.filter(isError).map(d => d.file).filter(Boolean))];
  const out = new Set(leftOut(lib, top, files, owners));
  if (!out.size) return diags;
  return [...diags.filter(d => !out.has(d.file)), ...[...out].map(f => leftOutDiag(f, top, diags.filter(d => d.file === f && isError(d)).length))];
}

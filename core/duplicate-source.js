// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Duplicate of a source or a file (#5862) over a project store `P` (the interface's page store, web/js/page-store.js;
// the server's projects.js), the Design pane's and the Files pages' Duplicate and the MCP's rename_file copy: a copy under
// a new name (name_copy, name_copy2…, or the one given), in the project with the original's role, never its top. A
// module's copy is renamed inside (core/rename.js: every module its file declares, their instances in it), so that the
// project never has two modules of the same name: an HDL file's text, a drawing's module (its name; the drawing copied as
// a drawing, its HDL made again for the new name, core/drawing-sync.js), its symbol file (<module>.sym.json) with it. A
// test bench's copy is its own module renamed: its unit under test stays the one it instantiates. A plain file
// (constraints, C, data) is copied as it is. Isomorphic module (browser + Node).
import { compile } from './compile.js';
import { projectModulesOf } from './circuit-modules.js';
import { renameModuleInSource } from './rename.js';
import { reservedError } from './reserved.js';
import { syncDrawing, adoptDrawing } from './drawing-sync.js';
import { isName } from './ident.js';
import { isSymbolFile, renameSymbolFile } from './symbol-layout.js';
import { addToProject } from './project-entries.js';

const VIEW = /\.(sch|asm|tt|bool|fsm|pn|circ|regs)\.json$/i;
// (not copied: what is not text)
const BINARY = /\.(png|jpe?g|gif|bmp|ico|webp|pdf|zip|gz|bit|bin|mcs|rbf|fs|elf|hex|wav|mp3|mp4|xlsx?|docx?|pptx?)$/i;
const extOf = p => (VIEW.exec(p) || /\.[^./]+$/.exec(p) || [''])[0];
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '/') : '');
const baseOf = p => p.slice(dirOf(p).length, p.length - extOf(p).length);
const lc = s => String(s || '').toLowerCase();
const eq = (a, b) => lc(a) === lc(b);
const indent = p => (/\.(asm|tt|bool|fsm|regs)\.json$/i.test(p) ? 2 : 1);
const fail = message => Object.assign(new Error(message), { duplicate: true });

/** The suffix of the n-th copy: _copy, _copy2, _copy3… */
export const copySuffix = n => (n > 1 ? `_copy${n}` : '_copy');

// the project's HDL: its modules (with the file declaring each; `taken`: every name, a circuit's ICs' modules too)
async function hdlOf(P, name) {
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  try {
    const lib = compile(hdl);
    return { mods: projectModulesOf(lib, hdl), packages: [...(lib.packages?.values() || [])], taken: [...lib.modules.values()].map(m => m.name) };
  } catch { return { mods: [], packages: [], taken: [] }; }
}

/**
 * Duplicate `path` (a file of the project; a drawing's HDL file: its drawing) of the project `name`: `to`, the copy's
 * path, and `module`, its module's name (a file declaring one module), are made when not given. `hidden(path)`: the
 * files the message does not name (a design project's HDL, #3891); `dry`: checked, nothing written. Errors: Error with `duplicate: true`, nothing written.
 * Returns { from, to, files: [the paths written], modules: [[old, new]], message, hdl: [the drawing's HDL messages] }.
 */
export async function duplicateSource(P, name, path, { to = null, module = null, hidden = null, dry = false } = {}) {
  if (typeof path !== 'string' || !path) throw fail('Choose a file to duplicate.');
  if (/^build(\/|$)/i.test(path)) throw fail(`${path} is written by Silinx itself: it is not duplicated.`);
  const tree = await P.fileTree(name);
  let src = tree.find(f => f === path) || tree.find(f => eq(f, path));
  if (!src) throw fail(`no file '${path}' in the project`);
  const views = {};
  for (const f of tree.filter(f => VIEW.test(f))) { try { views[f] = JSON.parse(await P.readFile(name, f)); } catch { /* skip */ } }
  // a drawing's HDL file: the drawing is its base, duplicated instead (its HDL made for the copy); a drawing made from its
  // HDL (base 'hdl') is a view of it: its HDL file is the one duplicated
  const drawingOf = Object.keys(views).find(f => views[f]?.generatedFile === src && views[f].base !== 'hdl');
  if (drawingOf) src = drawingOf;
  else if (views[src]?.base === 'hdl' && views[src].generatedFile && tree.includes(views[src].generatedFile)) src = views[src].generatedFile;
  if (BINARY.test(src)) throw fail(`${src} is not a text file: it is not duplicated.`);
  const drawing = VIEW.test(src) ? views[src] : null;
  if (VIEW.test(src) && !drawing) throw fail(`${src} cannot be read: it is not duplicated.`);
  const hdl = drawing ? drawing.generatedFile && tree.includes(drawing.generatedFile) ? drawing.generatedFile : null : src;
  const { mods, packages, taken } = await hdlOf(P, name);
  const declared = hdl ? mods.filter(m => m.file === hdl && m.kind !== 'package') : [];
  const pkg = hdl && packages.find(m => m.file === hdl);
  if (pkg) throw fail(`${hdl} declares the package '${pkg.name}': a copy would declare it twice.`);
  // the modules renamed in the copy: a drawing's own (its name), else every one its file declares
  const olds = drawing ? [drawing.name || declared[0]?.name || baseOf(src)].filter(Boolean) : declared.map(m => m.name);
  if (module != null && olds.length !== 1) throw fail(`${src} declares ${olds.length ? 'several modules' : 'no module'}: only its file's name is chosen.`);
  if (to != null && (typeof to !== 'string' || !to.trim() || to.startsWith('/') || to.split('/').includes('..'))) throw fail('Enter a file path inside the project.');
  if (to && /^build(\/|$)/i.test(to)) throw fail('build/ is written by Silinx itself.');
  if (to && extOf(to).toLowerCase() !== extOf(src).toLowerCase()) throw fail(`The copy keeps the file's kind: its name ends in ${extOf(src)}.`);
  const exists = p => tree.some(f => eq(f, p));
  const free = n => !taken.some(m => eq(m, n));
  const syms = {};
  for (const f of tree.filter(isSymbolFile)) { try { syms[f] = await P.readFile(name, f); } catch { /* skip */ } }
  // the copy's names for a suffix (null: by `to` / `module`)
  const plan = suffix => {
    const one = olds.length === 1;
    const named = module || (one && to ? baseOf(to) : null);
    const ren = new Map(olds.map(o => [o, named || o + suffix]));
    const nu = one ? ren.get(olds[0]) : null;
    // its file: named after its module when it was, else its name with the suffix (or the module's, when chosen)
    const path = to || (one && eq(baseOf(src), olds[0]) ? dirOf(src) + nu + extOf(src) : dirOf(src) + (module ? nu : baseOf(src) + suffix) + extOf(src));
    const hdlTo = drawing && hdl ? (eq(baseOf(hdl), olds[0]) ? dirOf(hdl) + nu + extOf(hdl) : dirOf(hdl) + baseOf(path) + extOf(hdl)) : null;
    const sym = one ? renameSymbolFile(syms, hdl || src, olds[0], nu) : null;
    return { ren, path, hdlTo, sym: sym && sym.to !== sym.from ? sym : null };
  };
  let p;
  // (a name given: its copy's; a file of several modules given its path: their names still with a suffix)
  if (module || (to && olds.length <= 1)) p = plan('');
  else {
    for (let n = 1; n < 1000 && !p; n++) {
      const q = plan(copySuffix(n));
      if ([...q.ren.values()].every(free) && ![to ? null : q.path, q.hdlTo, q.sym?.to].filter(Boolean).some(exists)) p = q;
    }
    if (!p) throw fail(`no free name for a copy of ${src}`);
  }
  // the checks of a name given (Rename's)
  for (const nu of p.ren.values()) {
    if (!isName(nu)) throw fail('The module name must start with a letter and contain only letters, digits and _.');
    const r = reservedError(nu);
    if (r) throw fail(`${r}: choose another name.`);
    if (!free(nu)) throw fail(`A module named '${nu}' already exists.`);
  }
  for (const q of [p.path, p.hdlTo, p.sym?.to].filter(Boolean)) if (exists(q)) throw fail(`${q} already exists.`);
  // (`dry`: the copy's names only, nothing written: the interface's window prefilled with them)
  if (dry) return { from: src, to: p.path, files: [], modules: [...p.ren], message: '', hdl: [] };
  // the copies' texts
  const written = [];
  const rename = (text, lang) => { for (const [o, n] of p.ren) text = renameModuleInSource(text, lang, o, n); return text; };
  const langOf = f => (/\.s?v$/i.test(f) ? 'verilog' : 'vhdl');
  if (drawing) {
    const d = { ...structuredClone(drawing), name: p.ren.get(olds[0]) };
    if (p.hdlTo) d.generatedFile = p.hdlTo; else delete d.generatedFile;
    if (p.hdlTo) { await P.writeFile(name, p.hdlTo, rename(await P.readFile(name, hdl), langOf(hdl))); written.push(p.hdlTo); }
    await P.writeFile(name, p.path, JSON.stringify(d, null, indent(p.path)));
    written.push(p.path);
  } else {
    const text = await P.readFile(name, src);
    if (typeof text !== 'string') throw fail(`${src} cannot be read: it is not duplicated.`);
    await P.writeFile(name, p.path, declared.length ? rename(text, langOf(src)) : text);
    written.push(p.path);
  }
  if (p.sym) { await P.writeFile(name, p.sym.to, p.sym.text); written.push(p.sym.to); }
  // in the project, with the original's role (a test bench a simulation source), never the top
  const orig = hdl || src;
  await P.updateProject(name, pj => {
    for (const f of written) addToProject(pj, f);
    const entry = (pj.files || []).find(f => f.path === orig);
    const copy = p.hdlTo || p.path;
    if (entry) pj.files = pj.files.map(f => (f.path === copy ? { ...entry, path: copy } : f));
    // a drawing's own language (Source Properties), a module's stimuli (Try it's) copied with it
    if (pj.sourceLanguage?.[src]) pj.sourceLanguage = { ...pj.sourceLanguage, [p.path]: pj.sourceLanguage[src] };
    for (const [o, n] of p.ren) if (pj.stimuli?.[o]) pj.stimuli = { ...pj.stimuli, [n]: structuredClone(pj.stimuli[o]) };
    return pj;
  });
  // the drawing's HDL made again for its new name (its header, its generator's names)
  const msgs = [];
  if (drawing) {
    // (its HDL copied and renamed here: not an edit of the user's, #5872)
    const r = p.hdlTo ? await syncDrawing(P, name, p.path, null, { own: true }) : await adoptDrawing(P, name, p.path);
    if (r?.messages?.length) msgs.push(...r.messages);
    if (r?.written && !written.includes(r.written)) written.push(r.written);
  }
  const shown = f => !hidden?.(f);
  const files = written.filter(shown);
  const pairs = [...p.ren];
  const message = pairs.length
    ? `Duplicate: ${src} → ${p.path}${pairs.map(([o, n]) => `; module '${o}' copied as '${n}'`).join('')}${files.length > 1 ? ` (${files.filter(f => f !== p.path).join(', ')} with it)` : ''}.`
    : `Duplicate: ${src} → ${p.path}.`;
  return { from: src, to: p.path, files: written, modules: pairs, message, hdl: msgs };
}

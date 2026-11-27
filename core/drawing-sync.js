// A drawing's HDL file kept in sync with it on the server (#2674), as the interface's editors keep it (web/js/drawings.js
// syncHdlFromAsm / Fsm / Schematic, drawings-tt.js syncHdlFromTt): a drawing (schematic, ASM chart, state diagram,
// truth table, Petri net) is the base of its HDL file (its generatedFile, in the project), which is made from it
// again (core/view-hdl.js viewHdl, the editors' generators) when it changes; a drawing with errors leaves its file as
// it was, stale (#303), and Check Syntax stops on it. A drawing in another language than its file's gets its HDL file
// in that language and the other one removed (drawings.js drawnHdlLanguage); the project's Preferred Language and a
// drawing's own (Source Properties) put the drawings in it (drawings-lang.js, #1477, #2254). A drawing made from its
// HDL (base 'hdl') is a view of it, not its base: none of this.
import { compile } from './compile.js';
import { circuitPartModules } from './circuit-modules.js';
import { attachSymbols, isSymbolFile, modulesFromLibrary } from './schdoc.js';
import { VIEW_RE, definesModule, drawingInLanguage, drawnHdlClash, drawnHdlPath, modelLanguage, viewHdl } from './view-hdl.js';
import { isDesignOnly } from './project-kind.js';
import { useProjectParts } from './circuit-kicad.js';
import { modelRunners } from './circuit-live-model.js';
import { syncNodeMain } from './node-main-sync.js';
import { codeName, cpuDrawingRefusal, drawingC, drawingNode, isCodeFile, isCpuLang, nodeCodeOpts } from './drawing-code.js';
import { cacheState, drawingHash, readStamp, stampHdl } from './hdl-cache.js';

const kindOf = path => VIEW_RE.exec(path)?.[1].toLowerCase();
const indent = path => (kindOf(path) === 'sch' ? 1 : 2);
const isVerilog = file => /\.s?v$/i.test(file);
// (a design project's messages name its drawings, never their HDL: none when it is made, its module when it is not, as
// the interface's, #3891)
const designProject = async (P, name) => isDesignOnly(await Promise.resolve(P.readProject?.(name)).catch(() => null));

/** The project's modules from its HDL sources (the schematics' module symbols), as the editors read them, with their
 *  symbols of their own (<module>.sym.json, #3755). */
export async function projectModules(P, name) {
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let mods;
  let lib;
  try { lib = compile(hdl); mods = modulesFromLibrary(lib, { sources: Object.fromEntries(hdl.map(s => [s.path, s.text])) }); } catch { return {}; }
  // (a circuit's ICs' modules are the circuit's, not the project's, #4216: as the interface's palette)
  for (const n of circuitPartModules(lib, hdl)) for (const k of Object.keys(mods)) if (k.toLowerCase() === n) delete mods[k];
  return attachSymbols(mods, await symbolFiles(P, name));
}

/** The project's HDL as a circuit's KiCad parts modelled by its modules read it (#4283, #4284): { modules (their ports,
 *  projectModules'), runner (their live models, core/circuit-live-model.js modelRunners) }; {} with no HDL compiled. */
export async function projectHdl(P, name) {
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let lib;
  try { lib = compile(hdl); } catch { return {}; }
  return { modules: await projectModules(P, name), runner: modelRunners(lib) };
}

/** The project's symbol files: { path: text }. */
async function symbolFiles(P, name) {
  const out = {};
  for (const f of (await P.fileTree(name)).filter(isSymbolFile)) { try { out[f] = await P.readFile(name, f); } catch { /* unreadable */ } }
  return out;
}

// the drawing's model and its HDL file in the project (null: none, or not the drawing's base)
async function linkOf(P, name, path) {
  if (!kindOf(path)) return null;
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!m || typeof m !== 'object' || m.base === 'hdl' || !m.generatedFile) return null;
  const pj = await P.readProject(name);
  const tree = await P.fileTree(name);
  const target = m.generatedFile;
  // (a drawing's C, #5486: a file of the project folder, not an HDL source of its list)
  if (!tree.includes(target) || !(isCodeFile(target) || (pj.files || []).some(f => f.path === target)) || (pj.excluded || []).includes(path)) return null;
  // (a circuit's parts: the project's KiCad parts too, #4280)
  if (kindOf(path) === 'circ') await useProjectParts(P, name);
  return { m, target, tree };
}

/** A drawing's node in its project's System (core/drawing-code.js drawingNode: { node, lang }), or null. */
export async function nodeOfDrawing(P, name, path) {
  const tree = await P.fileTree(name);
  const texts = {};
  for (const f of tree.filter(f => /\.sys\.json$/i.test(f))) { try { texts[f] = await P.readFile(name, f); } catch { /* unreadable: no System */ } }
  return drawingNode(await P.readProject(name), path, { files: tree, texts });
}

/** A drawing's HDL file made again from it (its C in a CPU node, #5486): { target, written, removed, stale: its errors'
 *  text or null, messages } (null: a drawing with no HDL file in the project, or not a drawing). Its HDL file is a cache
 *  of it (#5872, core/hdl-cache.js): written with its silinx-sync line; one changed outside Silinx (its text not the
 *  line's) or of before that line, not the drawing's, kept in a version first (kept: its number; a warning for the
 *  first); its text the drawing's but its line not (a file of before): written, stamped (nothing said); the drawing's layout
 *  changed alone (the same HDL): left as it is. fast: nothing made for a file made from the drawing as it is and not
 *  changed since (a check's); outside: the drawing changed outside Silinx, said; own: its HDL file changed by Silinx
 *  itself (a rename's), not kept. */
export async function syncDrawing(P, name, path, modules = null, { fast = false, outside = false, own = false } = {}) {
  const link = await linkOf(P, name, path);
  if (!link) return null;
  const at = await nodeOfDrawing(P, name, path);
  if (isCpuLang(at?.lang)) return syncCode(P, name, path, link, at);
  const { m, target, tree } = link;
  const modsOf = async () => modules || (kindOf(path) === 'sch' ? await projectModules(P, name) : {});
  // in another language than its file's: its HDL file in that language, the other one removed
  if (m.lang && isVerilog(target) !== (m.lang === 'verilog')) {
    const r = drawingInLanguage(path, JSON.stringify(m), m.lang, { modules: await modsOf() });
    const L = m.lang === 'verilog' ? 'Verilog' : 'VHDL';
    if (!r.hdl || r.errors.length) return { target, written: null, removed: null, stale: r.errors.map(e => e.replace(`${path}: `, '')).join('; '), messages: [`WARNING: ${target} not made in ${L} yet: ${path} has errors: ${r.errors.map(e => e.replace(`${path}: `, '')).join('; ')}`] };
    if (tree.includes(r.target)) return { target, written: null, removed: null, stale: null, messages: [`WARNING: the HDL of ${path} is not made in ${L}: ${r.target} exists already`] };
    await P.deleteFile(name, target);
    await P.writeFile(name, r.target, await stampHdl(r.hdl, await drawingHash(r.text), m.lang));
    await P.writeFile(name, path, r.text);
    return { target: r.target, written: r.target, removed: target, stale: null, messages: [`${path}: its HDL is now in ${L}, ${r.target} (${target} removed)`] };
  }
  const had = await P.readFile(name, target).catch(() => null);
  // (own: its HDL file changed by Silinx itself, a rename's: not an edit of the user's)
  const read = had === null ? null : await cacheState(had, m);
  const state = own && (read === 'edited' || read === 'unknown') ? 'drawing' : read;
  const unchanged = { target, written: null, removed: null, stale: null, messages: [] };
  const dh = await drawingHash(m);
  const seen = `${name}\0${target}`, sig = `${dh}:${had}`;
  // (a check's, #5872: made from the drawing as it is and not changed since, or found the drawing's already, nothing)
  if (fast && (state === 'fresh' || (state === 'drawing' && verified.get(seen) === sig))) return unchanged;
  const r = viewHdl(path, JSON.stringify(m), { modules: await modsOf(), linked: () => false });
  if (r.errors.length) {
    const why = r.errors.map(e => e.replace(`${path}: `, '')).join('; ');
    return { target, written: null, removed: null, stale: why, messages: [await designProject(P, name) ? `WARNING: ${path}: its module is not made again: ${why}` : `WARNING: ${target} not updated: ${path} has errors: ${why}`] };
  }
  const want = await stampHdl(r.text, dh, isVerilog(target) ? 'verilog' : 'vhdl');
  if (had === want) return unchanged;
  const body = had === null || readStamp(had).body !== readStamp(want).body;
  // (the drawing's layout changed, its HDL the same: the file left as it is, no change in git; its check remembered)
  if (!body && state === 'drawing') { remember(seen, sig); return unchanged; }
  const design = await designProject(P, name);
  // (its text changed outside Silinx, or a file of before #5872 not the drawing's: kept in a version, then the drawing's)
  const kept = had !== null && body && (state === 'edited' || state === 'unknown') ? await keepVersion(P, name, editedLabel(target, path, design)) : null;
  await P.writeFile(name, target, want);
  // (only its line new: a file of before #5872, or its line changed by hand, its text the drawing's)
  if (!body) return { ...unchanged, written: target, stamped: target };
  const done = { target, written: target, removed: null, stale: null, ...(kept ? { kept: kept.id ?? null } : {}) };
  if (state === 'edited') return { ...done, messages: [editedWarning(target, path, kept, design)] };
  const before = kept ? ` (${kept.id ? `its text before, from a file with no silinx-sync line, is kept in version ${kept.id}` : `its text before could not be kept in a version: ${kept.error}`})` : '';
  const why = outside && state === 'drawing' ? ' (the drawing was changed outside Silinx)' : '';
  return { ...done, messages: design ? [] : [`${target} updated from ${path}${why}${before}`] };
}

/** Every drawing of the project checked against its HDL file (#5872), as the project is opened, the project's folder
 *  changes or before a flow runs: one made from the drawing as it is and not changed since left as it is (its
 *  silinx-sync line's hashes), the others made again (syncDrawing's: an HDL file changed outside Silinx kept in a
 *  version, the drawing winning; a drawing with errors leaves its file, stale, and the flows stop on it). A drawing with
 *  no HDL file in the project is left as it is (adoptDrawing's, as the interface's opening). only: these drawings. The schematics last (the modules they use made
 *  first). { results: [{ path, ...syncDrawing's }] (those that did or said something), written: [the
 *  files written], messages }. */
export async function checkDrawings(P, name, { only = null } = {}) {
  const drawings = (await P.fileTree(name)).filter(f => kindOf(f) && (!only || only.includes(f)))
    .sort((a, b) => (kindOf(a) === 'sch') - (kindOf(b) === 'sch') || a.localeCompare(b));
  const out = { results: [], written: [], messages: [] };
  for (const f of drawings) {
    const r = await syncDrawing(P, name, f, null, { fast: true, outside: true });
    if (!r || (!r.written && !r.removed && !r.messages.length)) continue;
    out.results.push({ path: f, ...r });
    for (const w of [r.written, r.removed]) if (w && !out.written.includes(w)) out.written.push(w);
    out.messages.push(...r.messages);
  }
  return out;
}

// the HDL files found to be their drawing's as it is, their line's drawing hash an older one (its layout changed since):
// `project\0file` -> `drawing hash:file's text`, a check's fast way past them (a few hundred at most)
const verified = new Map();
function remember(key, sig) {
  verified.delete(key);
  verified.set(key, sig);
  if (verified.size > 500) verified.delete(verified.keys().next().value);
}

// the label of the version kept before an HDL file changed outside Silinx is made again from its drawing (#5872; a
// design project's names its drawing, never its HDL, #3891)
const editedLabel = (target, path, design = false) => (design ? `${path}: its module changed outside Silinx` : `${target} changed outside Silinx`);

// a version of the project as it is (the HDL file changed outside Silinx in it), before its drawing's HDL replaces it:
// { id } or { error } (a store with no versions: none kept)
async function keepVersion(P, name, label) {
  if (!P.saveVersion) return { error: 'no versions here' };
  try { return { id: (await P.saveVersion(name, { reason: 'before-regenerate', label, author: 'Silinx' })).version.id }; } catch (e) { return { error: e.message }; }
}

// the warning of an HDL file changed outside Silinx, made again from its drawing (#5872)
function editedWarning(target, path, kept, design) {
  const where = kept.id ? `the changed file is kept in version ${kept.id} ("${editedLabel(target, path, design)}")` : `the changed file could not be kept in a version: ${kept.error}`;
  return design ? `WARNING: ${path}: its module was changed outside Silinx: made again from the drawing; ${where}.`
    : `WARNING: ${target} was changed outside Silinx: made again from ${path}, the drawing being its source; ${where}.`;
}

// a drawing's code made again (its file the C or the MicroPython, or its HDL from before its node's language was C,
// or its other language's code: its node's language's instead)
async function syncCode(P, name, path, link, at) {
  return withMain(P, name, at, await codeAgain(P, name, path, link, at));
}

// the result's messages followed by the node's sketch's, made again when the drawing's C was written (#5486)
async function withMain(P, name, at, r) {
  if (!r?.written) return r;
  const s = await syncNodeMain(P, name, at.node, at.lang);
  return s ? { ...r, main: s.written || s.removed, messages: [...r.messages, ...s.messages] } : r;
}

async function codeAgain(P, name, path, { m, target, tree }, at) {
  const r = drawingC(path, JSON.stringify(m), { lang: at.lang, ...nodeCodeOpts(at.node) });
  const ext = f => /\.(\w+)$/.exec(f)?.[1].toLowerCase();
  const warn = r.warnings.map(w => `WARNING: ${w}`);
  if (r.errors.length) {
    const why = r.errors.map(e => e.replace(`${path}: `, '')).join('; ');
    return { target, written: null, removed: null, stale: why, messages: [`WARNING: ${target} not updated: ${path} has errors: ${why}`] };
  }
  if (!isCodeFile(target) || ext(target) !== ext(r.target)) {
    if (tree.includes(r.target)) return { target, written: null, removed: null, stale: null, messages: [`WARNING: the ${codeName(at.lang)} of ${path} is not made: ${r.target} exists already`] };
    await P.writeFile(name, r.target, r.text);
    await P.deleteFile(name, target);
    await P.writeFile(name, path, JSON.stringify({ ...m, generatedFile: r.target }, null, indent(path)));
    return { target: r.target, written: r.target, removed: target, stale: null, messages: [`${path}: its node's language is ${codeName(at.lang)}: its file is now ${r.target} (${target} removed)`, ...warn] };
  }
  if (await P.readFile(name, target) === r.text) return { target, written: null, removed: null, stale: null, messages: warn };
  await P.writeFile(name, target, r.text);
  return { target, written: target, removed: null, stale: null, messages: [`${target} updated from ${path}`, ...warn] };
}

// a drawing with no file in a CPU node gets its C or its MicroPython (adoptDrawing's): a schematic, a circuit, a register
// map refused, said
async function adoptCode(P, name, path, m, at) {
  const none = messages => ({ target: null, written: null, removed: null, stale: null, messages });
  const refusal = cpuDrawingRefusal(path, at.lang);
  if (refusal) return none([`WARNING: ${refusal}`]);
  const r = drawingC(path, JSON.stringify(m), { lang: at.lang, ...nodeCodeOpts(at.node) });
  if (r.notMade) return none(r.errors.map(e => `WARNING: ${e}`));   // (a PIC24's C, #5552)
  if (r.errors.length || !r.text) return null;
  if ((await P.fileTree(name)).includes(r.target)) return none([`WARNING: ${path} has no ${codeName(at.lang)} file: ${r.target} exists already`]);
  await P.writeFile(name, r.target, r.text);
  await P.writeFile(name, path, JSON.stringify({ ...m, generatedFile: r.target }, null, indent(path)));
  return { target: r.target, written: r.target, removed: null, stale: null, messages: [`${r.target} generated from ${path}`, ...r.warnings.map(w => `WARNING: ${w}`)] };
}

/** A drawing with no HDL file gets it (#207, #3184), as the interface's adoptDrawnHdl gives it when the project is
 *  loaded: the HDL made from it written next to it (drawnHdlPath, which registers the module in the project) and the
 *  drawing linked to it (generatedFile). Not when it has errors (a module by itself until it has none), nor for a
 *  drawing made from its HDL: null. Nor when that file is there already or another HDL file of the project defines its
 *  module (#230: resolved from its menu): said, as the interface says it (#4693), { target: null, written: null,
 *  clash: drawnHdlClash's, messages }. { target, written, removed: null, stale: null, messages } when it gets it. */
export async function adoptDrawing(P, name, path) {
  if (!kindOf(path)) return null;
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!m || typeof m !== 'object' || m.base === 'hdl') return null;
  const tree = await P.fileTree(name);
  const at = await nodeOfDrawing(P, name, path);
  if (m.generatedFile) {
    // (its HDL file gone, never made or removed from the project, is one without it, as the interface's, #231, #5764)
    const pj = await P.readProject(name);
    if (isCpuLang(at?.lang) || (tree.includes(m.generatedFile) && (isCodeFile(m.generatedFile) || (pj.files || []).some(f => f.path === m.generatedFile)))) return null;
  }
  const lost = m.generatedFile || null;
  if (isCpuLang(at?.lang)) return withMain(P, name, at, await adoptCode(P, name, path, m, at));   // (in a CPU node: its C, #5486)
  const r = viewHdl(path, JSON.stringify(m), { modules: kindOf(path) === 'sch' ? await projectModules(P, name) : {}, linked: () => false });
  if (r?.errors.length) {
    // (with errors: a module by itself until it has none, said, #5799; Check Syntax says them too)
    const why = r.errors.map(e => e.replace(`${path}: `, '')).join('; ');
    return { target: null, written: null, removed: null, stale: why, messages: [await designProject(P, name) ? `WARNING: ${path}: its module is not made: ${why}` : `WARNING: ${path} has no HDL file yet: it has errors: ${why}`] };
  }
  if (!r || !r.module || !r.text) return null;
  const target = drawnHdlPath(path, r.module, r.lang);
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  const elsewhere = hdl.find(s => s.path !== target && definesModule(s.text, r.module, s.path));
  const text = tree.includes(target) ? (hdl.find(s => s.path === target)?.text ?? await P.readFile(name, target).catch(() => null)) : null;
  const c = drawnHdlClash({ path, module: r.module, lang: r.lang, exists: p => tree.includes(p), read: p => (p === target ? text : null), definedIn: elsewhere?.path || null });
  if (c) {
    // (its module is another drawing's, that file the other drawing's HDL: not replaced, one is renamed)
    const other = c.kind === 'same' ? await drawingOfHdl(P, name, tree, c.file, path) : null;
    // (#231: that file its own HDL file, removed from the project: made again from it once the user says so)
    const clash = other ? { ...c, kind: 'drawn', other } : c.kind === 'same' && c.file === lost ? { ...c, kind: 'removed' } : c;
    return { target: null, written: null, removed: null, stale: null, clash, messages: [clashWarning(clash, await designProject(P, name))] };
  }
  await P.writeFile(name, target, await stampHdl(r.text, await drawingHash(m), r.lang));
  await P.writeFile(name, path, JSON.stringify({ ...m, generatedFile: target }, null, indent(path)));
  const why = lost ? ` (its HDL file ${lost} ${tree.includes(lost) ? 'was removed from the project' : 'is no longer in the project folder'})` : '';
  return { target, written: target, removed: null, stale: null, messages: await designProject(P, name) ? [] : [`${target} generated from ${path}${why}`] };
}

// the drawing (other than `path`) whose HDL file is `file` (its generatedFile), or null
async function drawingOfHdl(P, name, tree, file, path) {
  for (const f of tree.filter(f => f !== path && kindOf(f))) {
    try { if (JSON.parse(await P.readFile(name, f))?.generatedFile === file) return f; } catch { /* not a drawing's JSON */ }
  }
  return null;
}

/** Why a drawing has no HDL file (adoptDrawing's clash), as the interface's console says it (drawings.js
 *  drawnHdlClashes; a design project's: its module named, never its HDL file, #3891), with the assistant's way to
 *  resolve it: the drawing written with that file as its generatedFile replaces it (#4693). */
export function clashWarning(c, designOnly = false) {
  const own = `, or the drawing written with "generatedFile": "${c.file}",`;
  if (designOnly) {
    return `WARNING: ${c.path}: ${c.kind === 'same' ? `Not made: another file of the project folder defines its module ${c.module}. Make Module… (right-click)${own} replaces it with the drawing's.`
      : c.kind === 'removed' ? 'Not made: its module was removed from the project. Make Module… (right-click) makes it again from the drawing.'
      : c.kind === 'drawn' ? `Not made: its module ${c.module} is the module of ${c.other}. Rename one of them.`
        : 'Not made: another file of the project folder has its name. Make Module… (right-click) makes it under another name.'}`;
  }
  return c.kind === 'same'
    ? `WARNING: ${c.path} has no HDL file: ${c.file} exists already and defines its module ${c.module}. Generate HDL File… (its right-click menu in the Design pane)${own} replaces ${c.file} with the HDL generated from it.`
    : c.kind === 'removed'
      ? `WARNING: ${c.path} has no HDL file: its HDL file ${c.file} was removed from the project (it is still in the project folder). Generate HDL File… (its right-click menu in the Design pane) makes it again from ${c.path}; Add to Project (Files) brings it back as it is.`
    : c.kind === 'drawn'
      ? `WARNING: ${c.path} has no HDL file: its module ${c.module} is the module of ${c.other} (${c.file}). Rename one of them.`
      : `WARNING: ${c.path} has no HDL file: ${c.target} exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to ${c.free}.`;
}

/** The HDL files of the project their drawing cannot make again (errors): [{ target, from, why }] (app.js's
 *  staleHdl, read by Check Syntax). */
export async function staleDrawings(P, name) {
  const out = [];
  let mods = null;
  for (const f of (await P.fileTree(name)).filter(p => kindOf(p))) {
    const link = await linkOf(P, name, f);
    if (!link) continue;
    if (kindOf(f) === 'sch') mods ||= await projectModules(P, name);
    let r = null;
    const at = await nodeOfDrawing(P, name, f);
    try { r = isCpuLang(at?.lang) ? drawingC(f, JSON.stringify(link.m), { lang: at.lang, ...nodeCodeOpts(at.node) }) : viewHdl(f, JSON.stringify(link.m), { modules: kindOf(f) === 'sch' ? mods : {}, linked: () => false }); } catch { /* not a drawing */ }
    if (r?.errors?.length) out.push({ target: link.target, from: f, why: `it has errors: ${r.errors.map(e => e.replace(`${f}: `, '')).join('; ')}` });
  }
  return out;
}

// a drawing in that language (drawings-lang.js drawingToLanguage): the drawing written in it, its link as it is, then
// its HDL file made in it; the messages, or null when it is in that language already
async function drawingToLanguage(P, name, path, lang) {
  let r;
  try { r = drawingInLanguage(path, await P.readFile(name, path), lang); } catch { return null; }
  if (!r || r.model.base === 'hdl') return null;
  await P.writeFile(name, path, JSON.stringify({ ...r.model, generatedFile: r.from || undefined }, null, indent(path)));
  const s = r.from ? await syncDrawing(P, name, path) : null;
  return s?.messages || [];
}

/** The project's drawings in its Preferred Language `lang`, but those with a language of their own (Source Properties):
 *  { changed: [drawing], messages }. */
export async function drawingsInLanguage(P, name, lang) {
  const own = (await P.readProject(name)).sourceLanguage || {};
  const changed = [], messages = [];
  for (const f of (await P.fileTree(name)).filter(p => kindOf(p))) {
    if (own[f]) continue;
    const r = await drawingToLanguage(P, name, f, lang);
    if (r) { changed.push(f); messages.push(...r); }
  }
  return { changed, messages };
}

/** Source Properties' language of a drawing: 'vhdl' or 'verilog' (its own), or '' (the project's, following it):
 *  { changed, language, messages }. */
export async function setSourceLanguage(P, name, drawing, choice) {
  await P.updateProject(name, pj => {
    const own = { ...pj.sourceLanguage };
    if (choice) own[drawing] = choice; else delete own[drawing];
    if (Object.keys(own).length) pj.sourceLanguage = own; else delete pj.sourceLanguage;
    return pj;
  });
  const pj = await P.readProject(name);
  const lang = choice || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const messages = await drawingToLanguage(P, name, drawing, lang);
  return { changed: !!messages, language: lang, messages: messages || [] };
}

/** A drawing's language now ('vhdl' or 'verilog'), and whether it can have one (a drawing made from its HDL cannot). */
export async function drawingLanguage(P, name, path) {
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!kindOf(path) || m.base === 'hdl') return null;
  return modelLanguage(m);
}

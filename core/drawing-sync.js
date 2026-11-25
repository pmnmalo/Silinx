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
 *  text or null, messages } (null: a drawing with no HDL file in the project, or not a drawing). */
export async function syncDrawing(P, name, path, modules = null) {
  const link = await linkOf(P, name, path);
  if (!link) return null;
  const at = await nodeOfDrawing(P, name, path);
  if (isCpuLang(at?.lang)) return syncCode(P, name, path, link, at);
  const { m, target, tree } = link;
  const mods = modules || (kindOf(path) === 'sch' ? await projectModules(P, name) : {});
  // in another language than its file's: its HDL file in that language, the other one removed
  if (m.lang && isVerilog(target) !== (m.lang === 'verilog')) {
    const r = drawingInLanguage(path, JSON.stringify(m), m.lang, { modules: mods });
    const L = m.lang === 'verilog' ? 'Verilog' : 'VHDL';
    if (!r.hdl || r.errors.length) return { target, written: null, removed: null, stale: r.errors.map(e => e.replace(`${path}: `, '')).join('; '), messages: [`WARNING: ${target} not made in ${L} yet: ${path} has errors: ${r.errors.map(e => e.replace(`${path}: `, '')).join('; ')}`] };
    if (tree.includes(r.target)) return { target, written: null, removed: null, stale: null, messages: [`WARNING: the HDL of ${path} is not made in ${L}: ${r.target} exists already`] };
    await P.deleteFile(name, target);
    await P.writeFile(name, r.target, r.hdl);
    await P.writeFile(name, path, r.text);
    return { target: r.target, written: r.target, removed: target, stale: null, messages: [`${path}: its HDL is now in ${L}, ${r.target} (${target} removed)`] };
  }
  const r = viewHdl(path, JSON.stringify(m), { modules: mods, linked: () => false });
  if (r.errors.length) {
    const why = r.errors.map(e => e.replace(`${path}: `, '')).join('; ');
    return { target, written: null, removed: null, stale: why, messages: [await designProject(P, name) ? `WARNING: ${path}: its module is not made again: ${why}` : `WARNING: ${target} not updated: ${path} has errors: ${why}`] };
  }
  if (await P.readFile(name, target) === r.text) return { target, written: null, removed: null, stale: null, messages: [] };
  await P.writeFile(name, target, r.text);
  return { target, written: target, removed: null, stale: null, messages: await designProject(P, name) ? [] : [`${target} updated from ${path}`] };
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
  if (!m || typeof m !== 'object' || m.base === 'hdl' || m.generatedFile) return null;
  const at = await nodeOfDrawing(P, name, path);
  if (isCpuLang(at?.lang)) return withMain(P, name, at, await adoptCode(P, name, path, m, at));   // (in a CPU node: its C, #5486)
  const r = viewHdl(path, JSON.stringify(m), { modules: kindOf(path) === 'sch' ? await projectModules(P, name) : {}, linked: () => false });
  if (!r || r.errors.length || !r.module || !r.text) return null;
  const target = drawnHdlPath(path, r.module, r.lang);
  const tree = await P.fileTree(name);
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  const elsewhere = hdl.find(s => s.path !== target && definesModule(s.text, r.module, s.path));
  const text = tree.includes(target) ? (hdl.find(s => s.path === target)?.text ?? await P.readFile(name, target).catch(() => null)) : null;
  const c = drawnHdlClash({ path, module: r.module, lang: r.lang, exists: p => tree.includes(p), read: p => (p === target ? text : null), definedIn: elsewhere?.path || null });
  if (c) {
    // (its module is another drawing's, that file the other drawing's HDL: not replaced, one is renamed)
    const other = c.kind === 'same' ? await drawingOfHdl(P, name, tree, c.file, path) : null;
    const clash = other ? { ...c, kind: 'drawn', other } : c;
    return { target: null, written: null, removed: null, stale: null, clash, messages: [clashWarning(clash, await designProject(P, name))] };
  }
  await P.writeFile(name, target, r.text);
  await P.writeFile(name, path, JSON.stringify({ ...m, generatedFile: target }, null, indent(path)));
  return { target, written: target, removed: null, stale: null, messages: await designProject(P, name) ? [] : [`${target} generated from ${path}`] };
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
      : c.kind === 'drawn' ? `Not made: its module ${c.module} is the module of ${c.other}. Rename one of them.`
        : 'Not made: another file of the project folder has its name. Make Module… (right-click) makes it under another name.'}`;
  }
  return c.kind === 'same'
    ? `WARNING: ${c.path} has no HDL file: ${c.file} exists already and defines its module ${c.module}. Generate HDL File… (its right-click menu in the Design pane)${own} replaces ${c.file} with the HDL generated from it.`
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

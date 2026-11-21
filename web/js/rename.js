// Renaming (#405: out of app.js): Rename Symbol (F2) in an HDL editor, and renaming a source (its file and / or the
// module it defines) with everything that refers to it updated: instances, the drawings' links, the constraints.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { renameSymbolAtCursor, applyEdits } from './refactor.js';
import { S, closeDoc, compileProject, openFile } from './app.js';
import { commandError, log } from './console.js';
import { reloadProject } from './project.js';
import { markStale, saveAll } from './processes.js';
import { reservedError } from '/core/reserved.js';
import { isName } from '/core/ident.js';
import { hdlSideFile } from '/core/project-kind.js';
import { designOnly } from './design-only.js';
import { pageStore, serialDrawings } from './page-store.js';
import { filesState } from './state-files.js';
import { docsState } from './state-docs.js';
import { designState } from './state-design.js';

// ---- Rename Symbol (F2) in an HDL editor: the name under the cursor, everywhere it means the same
// object in the file; a port / generic also in the instances of its module in the other files
export function renameSymbolIn(d, lang, path) {
  if (!d.editor) return;
  const findModule = name => designState.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase());
  return renameSymbolAtCursor({
    editor: d.editor, lang, path,
    // (not the HDL generated from a drawing, with a file of its own or not: it follows the drawing, read-only, #1176)
    sources: () => designState.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && !s.view && !designState.hdlToSch?.[s.path]).map(s => ({ ...s, text: docsState.docs.find(o => o.path === s.path && o.editor)?.editor.getValue() ?? s.text })),
    drawings: () => designState.sources.filter(s => s.view || designState.hdlToSch?.[s.path]).map(s => (s.view ? s : { ...s, path: designState.hdlToSch[s.path] })),
    isModule: name => !!findModule(name),
    renameModule: name => renameDialog(findModule(name)?.file || path, findModule(name)?.name || name),
    // an open file is edited in its editor (its own Undo); the others are written
    writeSource: async (p, text, edits, name) => {
      const od = docsState.docs.find(o => o.path === p && o.editor);
      if (od) { applyEdits(od.editor, edits, name); return; }
      await api.writeFile(S.project.name, p, text);
      const src = designState.sources.find(x => x.path === p);
      if (src) src.text = text;
      compileProject();
    },
  });
}

// ---- rename a source (file and/or the module it defines), updating everything that refers to it
const extOf = p => (/\.(sch|asm|tt|bool|fsm|pn|circ)\.json$/i.exec(p) || /\.[^./]+$/.exec(p) || [''])[0];
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '/') : '');

export async function renameDialog(file, mod = null) {
  if (!S.project) return;
  if (!await saveAll()) return;
  const mods = designState.modules.filter(m => m.file === file && m.kind !== 'package').map(m => m.name);
  const modName = mod || (mods.length === 1 ? mods[0] : null);
  const base = file.slice(dirOf(file).length, file.length - extOf(file).length);
  const fIn = h('input', { type: 'text', value: file, style: { width: '100%' } });
  const mIn = modName ? h('input', { type: 'text', value: modName, style: { width: '100%' } }) : null;
  const follow = h('input', { type: 'checkbox', checked: !!modName && base.toLowerCase() === modName.toLowerCase() });
  if (mIn) mIn.addEventListener('input', () => { if (follow.checked) fIn.value = dirOf(file) + mIn.value.trim() + extOf(file); });
  const err = h('div', { class: 'hint', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  // a design project's drawn module (its HDL file): its name only, the file following it, never shown (#3891)
  const hidden = !!mIn && designOnly() && hdlSideFile(file);
  if (hidden) follow.checked = true;
  const r = await dialog({
    title: 'Rename', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' },
        ...(mIn ? [h('label', {}, !hidden && designState.modules.find(m => m.name === modName)?.lang === 'vhdl' ? 'Entity:' : 'Module:'), mIn] : []),
        ...(hidden ? [] : [h('label', {}, 'File:'), fIn]),
        ...(mIn && !hidden ? [h('span'), h('label', {}, follow, ' File name follows the module name')] : [])),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, mIn
        ? 'Renaming the module also updates its instances in the other sources, schematics, linked charts and the project top.'
        : 'References to this file in the project (synchronized schematics/charts, constraints) are updated.'),
      err),
    buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
  });
  function check() {
      const to = fIn.value.trim(), nm = mIn?.value.trim();
      if (!to || to.startsWith('/') || to.split('/').includes('..')) return 'Enter a file path inside the project.';
      if (to !== file && filesState.fileTree.some(f => f.toLowerCase() === to.toLowerCase()) && to.toLowerCase() !== file.toLowerCase()) return `${to} already exists.`;
      if (mIn) {
        if (!isName(nm)) return 'The module name must start with a letter and contain only letters, digits and _.';
        // not a reserved word of VHDL or Verilog, in any letter case (#679)
        const r = nm.toLowerCase() !== modName.toLowerCase() && reservedError(nm);
        if (r) return `${r}: choose another name.`;
        if (nm.toLowerCase() !== modName.toLowerCase() && (designState.modules.some(m => m.name.toLowerCase() === nm.toLowerCase()) || designState.partModules?.has(nm.toLowerCase()))) return `A module named '${nm}' already exists.`;
      }
      return null;
  }
  if (!r) return;
  await renameSource(file, fIn.value.trim(), modName, mIn ? mIn.value.trim() : null);
}

// close the editors of the files that move or change: the paths to reopen after, the active one first
async function closeTouched(paths, moved) {
  const reopen = [];
  for (const d of [...docsState.docs]) {
    if (d.path && (paths.has(d.path) || moved.has(d.path))) {
      if (docsState.active === d) reopen.unshift(moved.get(d.path) || d.path); else reopen.push(moved.get(d.path) || d.path);
      d.dirty = false; clearTimeout(d._autosave); await closeDoc(d);
    }
  }
  return reopen;
}

// A module (and its file): core/rename-module.js, the MCP's rename_module's (#4731): its references, its drawing (its
// HDL made again by its kind, core/drawing-sync.js), its symbol, the project's top; the files moved all or nothing.
async function renameModuleNow(from, to, oldMod, newMod) {
  const { renameModule } = await import('/core/rename-module.js');
  let reopen = [];
  try {
    // (in the drawings' queue: no drawing's HDL made again in the middle of it, #4750)
    const r = await serialDrawings(() => renameModule(pageStore(), S.project.name, oldMod, newMod, {
      to: to !== from ? to : null, hidden: designOnly() ? hdlSideFile : null,
      before: async ({ changed, moved }) => { reopen = await closeTouched(new Set(changed), new Map(moved)); },
    }));
    await reloadProject(false);
    markStale();
    log(r.message, 'ok');
    for (const m of r.hdl) log(m, /^ERROR/.test(m) ? 'err' : /^WARNING/.test(m) ? 'warn' : 'info');
    for (const p of reopen.reverse()) await openFile(p);
  } catch (e) {
    commandError('Rename', e.message);
    await reloadProject(false);
  }
}

async function renameSource(from, to, oldMod, newMod) {
  if (oldMod && newMod) return renameModuleNow(from, to, oldMod, newMod);
  // a file that defines no module, or several: the file alone, the drawings' links to it following it
  const pj = S.project;
  const changed = new Map();                      // path -> new text
  const moved = new Map();                        // old path -> new path
  try {
    if (to && to !== from) {
      moved.set(from, to);
      for (const f of filesState.fileTree.filter(f => /\.(sch|asm|tt|bool|fsm|pn|circ)\.json$/i.test(f))) {
        let d;
        try { d = JSON.parse(await api.readFile(pj.name, f)); } catch { continue; }
        if (d.generatedFile === from) { d.generatedFile = to; changed.set(f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm)\.json$/i.test(f) ? 2 : 1)); }
      }
    }
    const reopen = await closeTouched(new Set(changed.keys()), moved);
    await serialDrawings(async () => {
      for (const [a, b] of moved) await api.renameFile(pj.name, a, b);
      for (const [p, text] of changed) await api.writeFile(pj.name, p, text);
    });
    await reloadProject(false);
    markStale();
    const parts = [];
    for (const [a, b] of moved) if (!designOnly() || !hdlSideFile(a)) parts.push(`${a} → ${b}`);   // (a design project's HDL: never named, #3891)
    log(`Rename: ${parts.join('; ')}.`, 'ok');
    for (const p of reopen.reverse()) await openFile(p);
  } catch (e) {
    commandError('Rename', e.message);
    await reloadProject(false);
  }
}

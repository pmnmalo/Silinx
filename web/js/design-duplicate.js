// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Duplicate of a source or a file (#5862): the Design pane's module rows and file rows, a selection of several of them
// (#5720), the Files pages' files and the Project menu (the selected source). One source: a window with the copy's name,
// prefilled (name_copy, name_copy2…: its module's when the file declares one module, else its file's path); several:
// each one copied under its own default name. The copy is made by core/duplicate-source.js, the MCP's rename_file copy:
// a module's renamed inside, a drawing's HDL made again for it, the copy in the project, not its top. It runs as a
// command of the project history (its menu's label: Undo), in a project shared live too (through the api); the console
// says what was copied, or why not.
import { h, dialog } from './ui.js';
import { S } from './app.js';
import { appLog, commandError } from './console.js';
import { reloadProject } from './project.js';
import { markStale, saveAll } from './processes.js';
import { designOnly } from './design-only.js';
import { pageStore, serialDrawings } from './page-store.js';
import { hdlSideFile } from '/core/project-kind.js';
import { isName } from '/core/ident.js';
import { duplicateSource } from '/core/duplicate-source.js';
import { designState } from './state-design.js';

const hidden = () => (designOnly() ? hdlSideFile : null);
const say = r => {
  appLog(r.message, 'ok');
  for (const m of r.hdl) appLog(m, /^ERROR/.test(m) ? 'err' : /^WARNING/.test(m) ? 'warn' : 'info');
};

/** Duplicate… of one source (`file`: a file of the project, a module's HDL file or its drawing): its window, then the copy. */
export async function duplicateDialog(file) {
  if (!S.project || !file) return;
  if (!await saveAll()) return;
  const name = S.project.name;
  let plan;
  try { plan = await duplicateSource(pageStore(), name, file, { dry: true, hidden: hidden() }); } catch (e) { commandError('Duplicate', e.message); return; }
  const one = plan.modules.length === 1;
  const vhdl = one && designState.modules?.find(m => m.name === plan.modules[0][0])?.lang === 'vhdl' && !designOnly();
  const input = h('input', { type: 'text', value: one ? plan.modules[0][1] : plan.to, style: { width: '100%' } });
  const err = h('div', { class: 'hint', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  const check = () => {
    const v = input.value.trim();
    if (one) return isName(v) ? null : 'The module name must start with a letter and contain only letters, digits and _.';
    return v && !v.startsWith('/') && !v.split('/').includes('..') ? null : 'Enter a file path inside the project.';
  };
  const r = await dialog({
    title: 'Duplicate', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, h('label', {}, one ? (vhdl ? 'Entity:' : 'Module:') : 'File:'), input),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, one
        ? 'The copy is a module of its own, with this name, added to the project.'
        : 'The copy is added to the project.'),
      err),
    onOpen: () => { input.focus(); input.select(); },
    buttons: [{ label: 'Duplicate', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const v = input.value.trim();
  await duplicateNow([plan.from], one ? { module: v } : { to: v });
}

/** Duplicate of several sources (a selection of the Design pane): each one under its default name. */
export async function duplicateSources(files) {
  if (!S.project || !files.length) return;
  if (!await saveAll()) return;
  // (a module's drawing once, whether its row or its HDL file's was selected)
  await duplicateNow([...new Set(files.map(f => designState.hdlToSch?.[f] || f))], {});
}

async function duplicateNow(files, opts) {
  const name = S.project.name;
  let copied = 0;
  for (const f of files) {
    try {
      // (in the drawings' queue: no drawing's HDL made again in the middle of it, #4750)
      say(await serialDrawings(() => duplicateSource(pageStore(), name, f, { ...opts, hidden: hidden() })));
      copied++;
    } catch (e) { commandError('Duplicate', e.message); }
  }
  if (!copied) return;
  await reloadProject(false);
  markStale();
}

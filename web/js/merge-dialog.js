// Project ▸ Merge Contribution… and Undo Merge (#4206; the merge: core/project-merge.js, core/merge-apply.js, on the
// server or in the browser's back end): another person's copy of the project (its folder, or a .zip of it) merged into
// the open project. Its first window picks the contribution; the second lists the files that differ, what the merge
// does with each (taken, kept, removed, merged by its objects, made again from its drawing) and, for each conflict,
// Mine or Theirs (a drawing's per object, silinx.json's per field), with a file's Compare (the window closes, the
// comparison opens, and the console's line opens the window again, the choices made kept). Every message goes to the
// console (docs/UI-GUIDELINES.md): the warnings, what was merged, Undo Merge's button. The contribution's texts and
// names are someone else's: shown as text only.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log } from './console.js';
import { S } from './app.js';
import { reloadProject } from './project.js';
import { saveAll } from './processes.js';
import { field, zipFolderSelection } from './wizards.js';
import { applyChanges } from './project-watch.js';

const STATES = {
  theirs: 'Changed there: taken', added: 'Added there: taken', removed: 'Removed there: removed', mine: 'Changed here: kept',
  merged: 'Changed on both sides: merged by its objects', generated: 'Made again from its drawing', conflict: 'Changed on both sides: choose',
};
const folderName = files => (files[0]?.webkitRelativePath || '').split('/')[0];
const err = text => log(`ERROR: Merge Contribution: ${text}`, 'err');
const key = s => s.replace(/[^\w-]/g, '_');

/** Project ▸ Merge Contribution…: the contribution picked, compared, the conflicts chosen, merged. */
export async function mergeContributionDialog() {
  if (!S.project) return null;
  const fileInp = h('input', { type: 'file', accept: '.zip', 'data-field': 'file' });
  const dirInp = h('input', { type: 'file', webkitdirectory: true, multiple: true, 'data-field': 'folder' });
  fileInp.addEventListener('change', () => { dirInp.value = ''; });
  dirInp.addEventListener('change', () => { fileInp.value = ''; });
  const r = await dialog({
    title: 'Merge Contribution', width: 600,
    body: h('div', {},
      h('div', { class: 'hint' }, 'Merge another person\'s copy of this project into it: its folder, or a .zip of it (File ▸ Export Project (.zip)…, Silinx). What only one side changed is taken; for what both changed, you choose.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } }, ...field('Contribution folder:', dirInp), ...field('or .zip file:', fileInp))),
    buttons: [{ label: 'Compare', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  const dir = [...dirInp.files], zf = fileInp.files[0];
  if (!dir.length && !zf) { err('no contribution chosen (its folder or its .zip).'); return null; }
  let zip, label;
  try {
    if (dir.length) { const z = await zipFolderSelection(dir, 'silinx'); zip = z.blob; label = `the folder '${folderName(dir)}'`; } else { zip = zf; label = zf.name; }
  } catch (e) { err(e.message); return null; }
  return mergeWith(zip, label, {});
}

// the comparison's window, then the merge (choices: those made before, when the window opens again from the console)
async function mergeWith(zip, label, choices) {
  const name = S.project?.name;
  if (!name) return null;
  await saveAll();
  let p;
  try { p = await api.mergePreview(name, zip); } catch (e) { err(e.message); return null; }
  for (const w of p.warnings) log(`WARNING: Merge Contribution: ${w}.`, 'warn');
  if (!p.files.length && !p.project.length) { log(`Merge Contribution: ${label} holds nothing that differs from '${name}'.`, 'info'); return null; }
  const picked = structuredClone(choices);
  const errLine = h('div', { class: 'hint merge-error', style: { minHeight: '16px' } });
  const radio = (group, side, set, now) => h('label', { class: `merge-side merge-${side}` },
    h('input', { type: 'radio', name: key(group), value: side, checked: now === side, onchange: () => { set(side); errLine.textContent = ''; } }), ` ${side === 'mine' ? 'Mine' : 'Theirs'} `);
  let compareAsked = null, close = null;
  const rowOf = (f) => {
    const choice = [];
    if (f.state === 'conflict' && f.conflicts?.length) {
      const obj = () => (picked[f.path] && typeof picked[f.path] === 'object' ? picked[f.path] : (picked[f.path] = {}));
      choice.push(h('ul', { class: 'merge-objects', style: { paddingLeft: '16px', margin: '2px 0' } }, ...f.conflicts.map(c => h('li', { class: 'merge-object', 'data-id': c.id },
        h('span', { 'data-no-i18n': '' }, `${c.label} (mine ${c.mine}, theirs ${c.theirs})`), ' ',
        ...['mine', 'theirs'].map(s => radio(`merge-${f.path}-${c.id}`, s, v => { obj()[c.id] = v; }, picked[f.path]?.[c.id]))))));
    } else if (f.state === 'conflict') choice.push(' ', ...['mine', 'theirs'].map(s => radio(`merge-${f.path}`, s, v => { picked[f.path] = v; }, picked[f.path])));
    const compare = h('button', { type: 'button', class: 'btn merge-compare', onclick: () => { compareAsked = f.path; close?.(); } }, 'Compare');
    return h('tr', { class: `merge-file merge-${f.state}`, 'data-path': f.path },
      h('td', { 'data-no-i18n': '', style: { paddingRight: '10px', verticalAlign: 'top' } }, f.path), h('td', {}, h('span', { class: 'merge-state' }, STATES[f.state]), ...choice), h('td', { style: { verticalAlign: 'top' } }, compare));
  };
  const fields = p.project.map(c => h('tr', { class: 'merge-file merge-field', 'data-field': c.field },
    h('td', { 'data-no-i18n': '' }, `silinx.json: ${c.field}`),
    h('td', {}, h('span', { 'data-no-i18n': '' }, `mine ${JSON.stringify(c.mine)}, theirs ${JSON.stringify(c.theirs)}`), ' ',
      ...['mine', 'theirs'].map(s => radio(`merge-field-${c.field}`, s, v => { (picked['silinx.json'] ||= {})[c.field] = v; }, picked['silinx.json']?.[c.field]))), h('td', {})));
  const left = () => p.left.filter(x => {
    const v = x.field ? picked['silinx.json']?.[x.field] : x.id ? picked[x.path]?.[x.id] : picked[x.path];
    return v !== 'mine' && v !== 'theirs';
  }).length;
  const res = await dialog({
    title: 'Merge Contribution', width: 780,
    body: h('div', {},
      h('div', { class: 'hint merge-summary' }, p.threeWay
        ? `Through their common ancestor: ${p.files.length} file(s) differ, ${p.left.length} conflict(s) to choose.`
        : `With no common ancestor: each file that differs is a choice (${p.left.length}).`),
      h('div', { style: { maxHeight: '50vh', overflow: 'auto', marginTop: '8px' } }, h('table', { class: 'merge-files', style: { borderCollapse: 'collapse', width: '100%' } }, h('tbody', {}, ...p.files.map(rowOf), ...fields))),
      errLine),
    buttons: [{ label: 'Merge', primary: true, value: () => picked,
      validate: () => { const n = left(); if (!n) return true; errLine.textContent = `Choose Mine or Theirs for ${n} conflict(s) more.`; return false; } },
    { label: 'Cancel', value: null }],
    onOpen: (o) => { close = () => o.close(null); },
  });
  if (compareAsked) return compareOne(p, compareAsked, zip, label, picked);
  if (!res) return null;
  return merge(name, zip, label, res);
}

// a file's Compare, the window closed; the console's line opens it again, the choices kept
async function compareOne(p, path, zip, label, picked) {
  const f = p.files.find(x => x.path === path);
  const { openCompare } = await import('./drawing-diff-view.js');
  await openCompare(path, { label: 'This project', text: f.mine }, { label, text: f.theirs });
  log(`Merge Contribution: ${path} compared with ${label}.`, 'info', { action: { label: 'Merge Contribution…', run: () => mergeWith(zip, label, picked) } });
  return null;
}

async function merge(name, zip, label, resolve) {
  let r;
  try { r = await api.mergeContribution(name, zip, resolve, label); } catch (e) { err(e.message); return null; }
  // (the merge's line with Undo Merge's button; the project made untrusted: its line with Trust Project's, as when it opens)
  const lines = r.untrusted ? r.lines.slice(0, -1) : r.lines;
  lines.forEach((l, i) => (l.startsWith('WARNING') ? log(l, 'warn') : log(l, 'ok', i === lines.length - 1 && r.taken.length ? { action: { label: 'Undo Merge', run: () => undoMerge() } } : undefined)));
  if (r.untrusted) log(r.lines.at(-1), 'info', { action: { label: 'Trust Project', run: () => import('./project.js').then(m => m.trustProject(name)) } });
  if (S.project?.name === name) {
    const changes = [...r.written, ...r.regenerated].map(f => ({ path: f, kind: S.diskTree?.includes(f) ? 'changed' : 'added' })).concat(r.removed.map(f => ({ path: f, kind: 'removed' })));
    if (api.standalone) await applyChanges({ project: name, changes });
    await reloadProject();
  }
  return r;
}

/** Project ▸ Undo Merge: the project as it was before its last merge (refused when it changed since: said). */
export async function undoMerge() {
  if (!S.project) return null;
  const name = S.project.name;
  await saveAll();
  let r;
  try { r = await api.undoMerge(name); } catch (e) { log(`ERROR: Undo Merge: ${e.message}`, 'err'); return null; }
  log(`Undid the last merge of '${name}': ${r.restored.length} file(s) put back, ${r.removed.length} removed.`, 'ok');
  if (S.project?.name === name) {
    if (api.standalone) await applyChanges({ project: name, changes: [...r.restored.map(f => ({ path: f, kind: 'changed' })), ...r.removed.map(f => ({ path: f, kind: 'removed' }))] });
    await reloadProject();
  }
  return r;
}

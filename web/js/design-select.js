// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The Design pane's selection of several rows (#5720), as ISE's and a file manager's trees: Ctrl+click (Cmd+click on a
// Mac) adds a row to the selection or takes it out, Shift+click selects the rows from the last one clicked to this one,
// a plain click or Esc goes back to one row. The rows selected are marked (.msel) and aria-selected, the tree
// aria-multiselectable; the row clicked last is the selection's current one (.sel: the Processes pane follows it). Only
// the rows of a source take part (a module's, a drawing's, a file's: treeItem's `source`, { file, pair }). A selection's
// menu has the commands that apply to several sources (Open, Remove from Project, Duplicate: #5862), the others shown disabled; Delete
// removes the selection from the project (web/js/design-remove.js), or the row selected.
import { popupMenu, runAction } from './ui.js';
import { removal, removeSources } from './design-remove.js';

let keys = new Set(), anchor = null;
const inHier = row => !!row?.closest('#hier');
const pickable = row => !!row?.source && inHier(row);
const shown = tree => [...tree.querySelectorAll('.row')].filter(r => r.getClientRects().length);

/** A plain click's selection: the row alone (`row`, its key: the anchor of a Shift+click). */
export function selectOne(row) {
  if (!inHier(row)) return;
  keys = pickable(row) ? new Set([row.dataset.key]) : new Set();
  anchor = row.dataset.key;
}

/** Whether a click (`e`) on `row` was the selection's (Ctrl / Cmd, Shift): done then; `current(row)` makes a row the
 *  selection's current one, the selection kept. */
export function multiClick(e, row, current) {
  if (!(e.ctrlKey || e.metaKey || e.shiftKey) || !pickable(row)) return false;
  const tree = row.closest('.tree'), key = row.dataset.key, cur = tree.querySelector('.row.sel');
  if (!keys.size && pickable(cur)) keys.add(cur.dataset.key);
  if (e.shiftKey) {
    const list = shown(tree).filter(pickable);
    const b = list.indexOf(row), a = list.findIndex(r => r.dataset.key === anchor);
    const [i, j] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
    keys = new Set(list.slice(i, j + 1).map(r => r.dataset.key));
    current(row);
    return true;
  }
  anchor = key;
  if (keys.has(key) && keys.size > 1) {
    keys.delete(key);
    // (the current row taken out: the first one left the current one)
    const next = row === cur ? [...tree.querySelectorAll('.row')].find(r => keys.has(r.dataset.key)) : null;
    if (next) current(next); else paint(tree);
  } else {
    keys.add(key);
    current(row);
  }
  return true;
}

/** The marks of the Design tree's selection (after a row is selected, and when the tree is drawn again: the rows no
 *  longer there leave it). */
export function paint(tree) {
  if (!inHier(tree)) return;
  tree.setAttribute('aria-multiselectable', 'true');
  const there = new Set();
  for (const r of tree.querySelectorAll('.row')) {
    const k = r.dataset.key, on = keys.has(k);
    if (on) there.add(k);
    r.classList.toggle('msel', on && keys.size > 1);
    r.parentElement.setAttribute('aria-selected', String(on || r.classList.contains('sel')));
  }
  keys = there;
}

const selectedRows = tree => [...tree.querySelectorAll('.row')].filter(r => keys.has(r.dataset.key) && r.source);
/** Whether `row` is in a selection of several rows (its menu: the selection's). */
export const inSelection = row => inHier(row) && keys.size > 1 && keys.has(row.dataset.key);
const sourcesOf = rows => rows.map(r => removal(r.source.file, r.source.pair));

/** The menu of a selection of several rows: the commands of several sources, the others disabled. */
export function selectionMenu(e, row) {
  const rows = selectedRows(row.closest('.tree'));
  popupMenu([
    { label: 'Open', action: () => { for (const r of rows) r.openIt?.(); } },
    { label: 'Remove from Project', action: () => removeSources(sourcesOf(rows)) },
    // (each one under its own name, #5862)
    { label: 'Duplicate', action: () => import('./design-duplicate.js').then(m => m.duplicateSources(sourcesOf(rows).map(r => r.file))) },
    '-',
    { label: 'Rename…', disabled: true },
    { label: 'Set as Top Module', disabled: true },
    { label: 'Source Properties…', disabled: true },
  ], e.clientX, e.clientY);
}

/** The Design tree's keys of the selection (`cur`: the current row): Esc back to one row, Delete removes. True: done. */
export function selectionKeys(e, tree, cur) {
  if (!inHier(tree)) return false;
  if (e.key === 'Escape' && keys.size > 1) {
    keys = cur && pickable(cur) ? new Set([cur.dataset.key]) : new Set();
    anchor = cur?.dataset.key ?? null;
    paint(tree);
    return true;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const rows = keys.size > 1 ? selectedRows(tree) : pickable(cur) ? [cur] : [];
    if (rows.length) runAction('Remove from Project', () => removeSources(sourcesOf(rows)));
    return true;
  }
  return false;
}

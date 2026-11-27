// A truth table column's right-click menu (#5869, web/js/truthtable.js; a long press on touch, ui.js longPressMenu): on
// an input's or an output's header, Rename Input… / Output… (a small dialog: a name refused is said in it, which stays
// open), Duplicate Output, Insert Before / After, Delete, Move Left / Right (#5863, the headers' Alt+Shift+← / →). Each
// is core/logic-columns.js's (or logic.js moveColumn), the MCP's set_output_logic's too; one step of the document's Undo
// (not a project's command: app.js NOT_RECORDED); what is refused (the last input or output deleted, 16 inputs) goes to
// the console. A read-only table has no menu.
import { dialog, longPressMenu, message, popupMenu } from './ui.js';
import { wireColumnDrag } from './tt-col-drag.js';
import { h } from './dom.js';
import { moveColumn } from '/core/logic.js';
import { renameColumn, deleteColumn, insertColumn, duplicateOutput } from '/core/logic-columns.js';

/** The columns' headers of the table's box `host` wired (once): dragged and moved by their keys (#5863, tt-col-drag.js),
 *  their menu. `model()` the table, `set(table, out, user)` makes it the table (output `out` selected, when given; `user`:
 *  chosen in a menu or a dialog, the main toolbar's Undo's, #2505), `refuse(text)` says what is refused, in the console. */
export function wireColumns(host, { readOnly, model, set, refuse }) {
  const edit = (f, pick, user) => { let m; try { m = f(model()); } catch (e) { refuse(e.message); return; } set(m, pick?.(m), user); };
  wireColumnDrag(host, { readOnly: () => readOnly, move: (kind, from, to) => edit(m => moveColumn(m, kind, from, to)),
    refuse: () => message(`${model().name} is read only: its columns are not moved.`, 'warn') });
  wireColumnMenu(host, { readOnly: () => readOnly, model, apply: (f, pick) => edit(f, pick, true) });
}

/** The menu wired on the table's box `host` (drawn again at every change): once. `model()` the table; `apply(f, out)`
 *  makes f(table) the table (output `out` selected, when given) or refuses its error. */
function wireColumnMenu(host, { readOnly, model, apply }) {
  longPressMenu(host);
  host.addEventListener('contextmenu', e => {
    const th = e.target.closest?.('th.tt-col');
    if (!th) return;
    e.preventDefault();
    if (readOnly()) return;
    const kind = th.dataset.kind, i = Number(th.dataset.i), M = model(), name = M[kind][i], n = M[kind].length;
    const input = kind === 'inputs', what = input ? 'Input' : 'Output';
    popupMenu([
      { label: `Rename ${what}…`, action: () => rename(kind, i, name) },
      !input && { label: 'Duplicate Output', action: () => apply(m => duplicateOutput(m, i), m => m.outputs[i + 1]) },
      '-',
      { label: `Insert ${what} Before`, action: () => apply(m => insertColumn(m, kind, i)) },
      { label: `Insert ${what} After`, action: () => apply(m => insertColumn(m, kind, i + 1)) },
      { label: `Delete ${what}`, title: input ? 'The rows where it is 0 are kept' : '', action: () => apply(m => deleteColumn(m, kind, i)) },
      '-',
      { label: 'Move Left', shortcut: 'Alt+Shift+←', disabled: i === 0, action: () => apply(m => moveColumn(m, kind, i, i - 1)) },
      { label: 'Move Right', shortcut: 'Alt+Shift+→', disabled: i === n - 1, action: () => apply(m => moveColumn(m, kind, i, i + 1)) },
    ], e.clientX, e.clientY);
  });

  async function rename(kind, i, old) {
    const field = h('input', { type: 'text', value: old, spellcheck: 'false', style: { width: '100%' }, 'data-no-i18n': '' });
    const err = h('div', { class: 'hint tt-rename-err', style: { color: 'var(--error-fg)', minHeight: '16px' } });
    const check = () => { try { renameColumn(model(), kind, i, field.value); return ''; } catch (e) { return e.message; } };
    field.addEventListener('input', () => { err.textContent = check(); });
    const ok = await dialog({
      title: kind === 'inputs' ? 'Rename Input' : 'Rename Output', width: 380, className: 'tt-rename-dlg',
      body: h('div', {}, h('div', { class: 'form-grid' }, h('label', { text: 'New name:' }), field), err),
      buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { err.textContent = check(); return !err.textContent; } }, { label: 'Cancel', value: null }],
      onOpen: () => setTimeout(() => field.select(), 0),
    });
    if (ok && field.value.trim() !== old) apply(m => renameColumn(m, kind, i, field.value), m => (kind === 'outputs' ? m.outputs[i] : null));
  }
}

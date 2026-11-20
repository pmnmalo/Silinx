// The state diagram's transition table (the Tables panel, web/js/fsm-bottom.js), edited in place (#4974): a row's
// present state renamed (its first row), its condition (kept as typed), its next state (a list of the states), its
// outputs ("z=1, y=X"), a row added after it (a transition from its state) or removed, a state added below the table.
// Each change goes through core/fsm-edit.js, as the MCP's edit_fsm, set_fsm_condition and set_fsm_outputs, and is
// committed as a change of the diagram (undone, redone, the diagram and its HDL made again); a change refused is said
// in the console and the table drawn again as it was. The codes follow the encoding: read only. Locked (Try it open, a
// diagram to read) or read only: the table as text.
import { h } from './ui.js';
import { transitionTable } from '/core/fsm.js';
import { showCondText } from '/core/expr-notation.js';
import { condAsText } from '/core/cond-notation.js';
import { addState, addTransition, removeTransition, renameState, setCondition, setNextState, setRowOutputs, setStayNext } from '/core/fsm-edit.js';
import { drawBarsIn } from './overbar.js';
import { getNotation } from './notation.js';

// (the states' and the signals' names never translated, #4964)
const NAME = { 'data-no-i18n': '' }, NAME_MONO = { class: 'mono', 'data-no-i18n': '' };

/** The transition table: { table, csv } (csv: its rows for Export CSV, the conditions in the Settings' notation).
 *  ctx: M() the model, editable() whether it may be changed, commit(key), flash(text), redraw() (the panel again). */
export function transitionTableView({ M, editable, commit, flash, redraw, btn }) {
  const tt = transitionTable(M());
  // (the conditions shown in the Settings' notation, #3915; edited as typed, #4888)
  for (const r of tt.rows) { r.typed = r.stays ? '' : M().transitions.find((t) => t.id === r.transition)?.cond ?? ''; if (!r.stays) r.cond = showCondText(r.cond, getNotation()); }
  const showCode = M().encoding !== 'enum';
  const csv = [tt.columns, ...tt.rows.map((r) => [r.state, r.code, r.cond, r.next, r.nextCode, r.outputs])];
  const edit = editable();
  // a change through core/fsm-edit.js: committed, or refused (said, the table as it was)
  const apply = (key, f) => {
    const r = f(M());
    if (r.error) { flash(r.error); redraw(); return; }
    commit(key);
  };
  const text = (value, cls, key, f, ph = '') => {
    const el = h('input', { class: `asm-input mono ${cls}`, value, spellcheck: 'false', placeholder: ph });   // (its value, a name, is never translated: its placeholder is)
    el.addEventListener('change', () => apply(key, (m) => f(m, el.value)));
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { el.value = value; el.blur(); } });
    return el;
  };
  const nextList = (r) => {
    const el = h('select', { class: 'asm-select fsm-tt-next' }, ...M().states.map((s) => h('option', { value: s.id, selected: s.id === r.nextId, 'data-no-i18n': '' }, s.name)));
    el.addEventListener('change', () => apply('tt-next', (m) => (r.stays ? setStayNext(m, r.stateId, el.value) : setNextState(m, r.transition, el.value))));
    return el;
  };
  const head = h('tr', {}, h('th', {}, 'Present state'), showCode ? h('th', {}, 'Code') : null, h('th', {}, 'Input condition'), h('th', {}, 'Next state'),
    showCode ? h('th', {}, 'Next code') : null, h('th', {}, 'Outputs'), edit ? h('th', {}, '') : null);
  const rows = tt.rows.map((r, i) => {
    const first = i === 0 || tt.rows[i - 1].stateId !== r.stateId;
    const state = edit && first ? h('td', {}, text(r.state, 'fsm-tt-state', `tt-name:${r.stateId}`, (m, v) => renameState(m, r.stateId, v))) : h('td', NAME, r.state);
    const cond = r.cond === 'otherwise' ? h('td', { class: 'mono' }, h('i', {}, 'otherwise (stays)'))
      : edit && !r.stays ? h('td', {}, text(condAsText(r.typed), 'fsm-tt-cond', `tt-cond:${r.transition}`, (m, v) => setCondition(m, r.transition, v), 'empty = always'))
        : h('td', NAME_MONO, r.cond);
    const outs = edit ? h('td', {}, text(r.outputs, 'fsm-tt-outs', `tt-outs:${r.transition || r.stateId}`, (m, v) => setRowOutputs(m, r, v), 'e.g. z=1')) : h('td', NAME_MONO, r.outputs);
    const tools = edit ? h('td', { class: 'fsm-tt-tools' },
      btn('+', 'Add a row after this one: a transition from this state (to itself, always; set its condition and next state)', () => apply('tt-add', (m) => addTransition(m, r.stateId, r.stateId, '', r.transition || null)), 'asm-small fsm-tt-add'),
      r.stays ? null : btn('✕', 'Remove this row (its transition)', () => apply('tt-del', (m) => removeTransition(m, r.transition)), 'asm-small asm-danger fsm-tt-del')) : null;
    return h('tr', { class: r.stays ? 'stays' : '', 'data-trans': r.transition || null, 'data-state': r.stateId },
      state, showCode ? h('td', { class: 'mono' }, r.code) : null, cond, edit ? h('td', {}, nextList(r)) : h('td', NAME, r.next),
      showCode ? h('td', { class: 'mono' }, r.nextCode) : null, outs, tools);
  });
  const table = h('table', { class: `fsm-table fsm-ttable${edit ? ' fsm-tt-edit' : ''}` }, head, ...rows);
  drawBarsIn(table, 'td.mono');   // (the bars drawn, #4058)
  const add = edit ? h('div', { class: 'asm-row fsm-tt-more' }, btn('+ State', 'Add a state (S0, S1…), placed beside the others; rename it in its first row', () => apply('tt-state', (m) => addState(m)), 'asm-small fsm-tt-addstate')) : null;
  return { table, csv, add };
}

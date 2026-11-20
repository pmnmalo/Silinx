// UI: a state diagram edited through its transition table (#4974): a row's condition typed (kept as typed), its next
// state chosen (the otherwise row's too: a transition else), its outputs (a don't care, a value refused: said in the
// console, nothing changed), a row added after another and removed, a state added and renamed (a name used twice
// refused); each change a change of the diagram: drawn, undone and redone, its HDL made again; the console's warnings
// exactly the refusals and Check's. In Portuguese: its labels and its refusals translated.
// (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeFsm, generateFsm } from '../../core/fsm.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';
const F = 'src/cnt.fsm.json', H = 'src/cnt.vhd';

/** S0 (q=0) → S1 on up, S1 (q=1) → S0 on up; its VHDL generated from it. */
const MACHINE = normalizeFsm({
  name: 'cnt', lang: 'vhdl', encoding: 'binary', generatedFile: H,
  inputs: [{ name: 'up', width: 1 }], outputs: [{ name: 'q', width: 2, default: '0' }],
  states: [{ id: 's1', name: 'S0', x: 120, y: 160, outputs: { q: '0' } }, { id: 's2', name: 'S1', x: 360, y: 160, outputs: { q: '1' } }],
  transitions: [{ id: 't1', from: 's1', to: 's2', cond: 'up' }, { id: 't2', from: 's2', to: 's1', cond: 'up' }],
  initial: 's1',
});
const files = () => ({ [F]: JSON.stringify(MACHINE, null, 2), [H]: generateFsm(MACHINE, 'vhdl').code });
const model = async (pj) => JSON.parse(await readWs(env, pj, F));
/** The table's rows as text: each cell's field's value (a list: its choice) or its text. */
const rows = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-ttable tr`)].slice(1).map((r) => [...r.children].slice(0, -1)
  .map((c) => { const f = c.querySelector('input, select'); return f ? (f.tagName === 'SELECT' ? f.selectedOptions[0].textContent : f.value) : c.textContent; }).join('|')), ED);
/** Type `text` in the field `sel` of the row `row` (a transition's id, or a state's for its first row), then Enter. */
async function typeIn(page, row, sel, text) {
  await page.eval((ed, r, s) => { const f = document.querySelector(`${ed} .fsm-ttable tr[data-trans="${r}"] ${s}, ${ed} .fsm-ttable tr[data-state="${r}"]:not([data-trans]) ${s}`) || document.querySelector(`${ed} .fsm-ttable tr[data-state="${r}"] ${s}`); f.focus(); f.select(); }, ED, row, sel);
  await page.type(text);
  await page.key('Enter');
}
/** The next state `name` chosen in the row `sel` (a CSS selector of its tr). */
const choose = (page, sel, name) => page.eval((ed, s, n) => {
  const l = document.querySelector(`${ed} .fsm-ttable ${s} .fsm-tt-next`);
  l.value = [...l.options].find((o) => o.textContent === n).value;
  l.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, sel, name);
const consoleRows = (page) => page.eval(() => ['console-errors', 'console-warnings'].map((id) => [...document.querySelectorAll(`#${id} .diag`)].map((r) => r.textContent)));
const open = async (page, pj) => {
  await makeProject(env, { name: pj, files: files() });
  await page.openProject(pj);
  await page.eval((f) => window.SilinxApp.openFsm(f), F);
  await page.waitFor((ed, f) => window.Silinx.active?.id === `fsm:${f}` && document.querySelector(ed), [ED, F], { what: 'the state diagram' });
};
const undo = (page) => page.click('#toolbar [data-cmd=undo]');
const redo = (page) => page.click('#toolbar [data-cmd=redo]');

uiTest('#4974 the transition table edited in place: condition, next state, outputs, a row and a state added, removed, renamed; undo; HDL', E, async (page) => {
  await open(page, 'TtEdit');
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-tt-edit`);
  // (the tests' notation: an overbar as /, #4417)
  assert.deepEqual(await rows(page), ['S0|0|up|S1|1|q=0', 'S0|0|otherwise (stays)|S0|0|q=0', 'S1|1|up|S0|0|q=1', 'S1|1|otherwise (stays)|S1|1|q=1']);
  // ---- a condition, kept as typed
  await typeIn(page, 't1', '.fsm-tt-cond', 'up and !up');
  await page.waitFor((ed) => window.Silinx.active.fsmEditor && document.querySelector(`${ed} [data-trans=t1] .fsm-label`)?.textContent.includes('up and !up'), [ED], { what: 'the arc drawn with the condition typed' });
  await typeIn(page, 't1', '.fsm-tt-cond', 'up');
  // ---- S1's otherwise: to S0 (a transition else of its own)
  await choose(page, 'tr.stays[data-state=s2]', 'S0');
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable tr[data-trans=t3]`), [ED], { what: 'S1\'s else' });
  // ---- S1's outputs: a don't care, then a value that does not fit: refused, said, nothing changed
  await typeIn(page, 't2', '.fsm-tt-outs', 'q=X');
  await typeIn(page, 't2', '.fsm-tt-outs', 'q=7');
  await page.waitFor(() => [...document.querySelectorAll('#console-warnings .diag')].some((r) => /does not fit/.test(r.textContent)), [], { what: 'the refusal in the console' });
  assert.deepEqual(await rows(page), ['S0|0|up|S1|1|q=0', 'S0|0|otherwise (stays)|S0|0|q=0', 'S1|1|up|S0|0|q=X', 'S1|1|else|S0|0|q=X']);
  let m;
  for (let i = 0; i < 50; i++) { m = await model('TtEdit'); if (m.transitions.length === 3 && m.states[1].outputs.q === 'X') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.deepEqual(m.transitions.map((t) => [t.id, t.from, t.to, t.cond]), [['t1', 's1', 's2', 'up'], ['t2', 's2', 's1', 'up'], ['t3', 's2', 's1', 'else']]);
  assert.deepEqual(m.states.map((s) => s.outputs), [{ q: '0' }, { q: 'X' }]);
  // ---- a row added after S0's first, then removed
  await page.click(`${ED} .fsm-ttable tr[data-trans=t1] .fsm-tt-add`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable tr[data-trans=t4]`), [ED], { what: 'the row added' });
  assert.deepEqual((await rows(page)).slice(0, 3), ['S0|0|up|S1|1|q=0', 'S0|0||S0|0|q=0', 'S1|1|up|S0|0|q=X']);   // (empty: always, S0 stays no more)
  await page.click(`${ED} .fsm-ttable tr[data-trans=t4] .fsm-tt-del`);
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-ttable tr[data-trans=t4]`), [ED], { what: 'the row removed' });
  // ---- a state added (S2), renamed Wait; s0 refused (S0's name, whatever its case)
  await page.click(`${ED} .fsm-tt-addstate`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable tr[data-state=s3]`), [ED], { what: 'S2 added' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-state=s3] .fsm-circle`).length, ED), 1);   // (drawn)
  await typeIn(page, 's3', '.fsm-tt-state', 'Wait');
  await typeIn(page, 's3', '.fsm-tt-state', 's0');
  await page.waitFor(() => [...document.querySelectorAll('#console-warnings .diag')].some((r) => /used twice/.test(r.textContent)), [], { what: 'the name refused' });
  assert.equal((await rows(page)).at(-1), 'Wait|10|1|Wait|10|');
  // ---- undo: Wait back to S2; redo
  await undo(page);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable tr[data-state=s3] .fsm-tt-state`)?.value === 'S2', [ED], { what: 'undone' });
  await redo(page);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable tr[data-state=s3] .fsm-tt-state`)?.value === 'Wait', [ED], { what: 'redone' });
  // ---- the HDL made again from the diagram
  for (let i = 0; i < 80; i++) { m = await model('TtEdit'); if (m.states.length === 3 && (await readWs(env, 'TtEdit', H)) === generateFsm(m, 'vhdl').code) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(await readWs(env, 'TtEdit', H), generateFsm(m, 'vhdl').code);
  assert.match(await readWs(env, 'TtEdit', H), /S_WAIT/i);
  // ---- the console: the refusals, and Check's warnings of the machine (Wait not reached, no exit)
  assert.deepEqual(await consoleRows(page), [[], [
    `WARNING:Silinx - ${F}: State S1: the value 7 of q does not fit in 2 bit(s) (not applied)`,
    `WARNING:Silinx - ${F}: State Wait: The name 's0' is used twice (letter case does not count) (not applied)`,
    `WARNING:FSM - "${F}": State Wait cannot be reached from the initial state S0`,
    `WARNING:FSM - "${F}": State Wait has no exit: once there, the machine stays in it until a reset`,
  ]]);
});

uiTest('#4974 the transition table edited in place, in Portuguese: its labels and tips translated, its fields the names as they are', E, async (page) => {
  await open(page, 'TtEditPt');
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-tt-edit`);
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval((ed) => window.__uiTexts(document.querySelector(`${ed} .fsm-tables`)), ED);
  const en = await texts();
  await setLang('pt');
  try {
    const pt = await texts();
    assert.deepEqual(untranslated(en, pt, [/^(S0|S1|up|q=\d)$/]), []);
    assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .fsm-tt-addstate`).textContent, document.querySelector(`${ed} .fsm-tt-cond`).placeholder,
      document.querySelector(`${ed} .fsm-tt-del`).title], ED), ['+ Estado', 'vazia = sempre', 'Remover esta linha (a sua transição)']);
    // the fields: the names and the conditions as they are (up, not 'crescente')
    assert.deepEqual(await rows(page), ['S0|0|up|S1|1|q=0', 'S0|0|caso contrário (fica)|S0|0|q=0', 'S1|1|up|S0|0|q=1', 'S1|1|caso contrário (fica)|S1|1|q=1']);
  } finally { await setLang('en'); }
  assert.deepEqual(await consoleRows(page), [[], []]);   // (no warnings)
});

uiTest('#4974 a read-only state diagram\'s transition table: text, no field to edit', E, async (page) => {
  const r = await page.eval(async (m) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px';
    document.body.append(host);
    const ed = (await import('/js/fsm-editor.js')).mountFsmEditor(host, { model: m, readOnly: true });
    [...host.querySelectorAll('.fsm-tab-btn')].find((b) => b.textContent === 'Tables').click();
    const out = { table: !!host.querySelector('.fsm-ttable'), fields: host.querySelectorAll('.fsm-ttable input, .fsm-ttable select, .fsm-tt-addstate').length };
    ed.destroy?.(); host.remove();
    return out;
  }, MACHINE);
  assert.deepEqual(r, { table: true, fields: 0 });
});

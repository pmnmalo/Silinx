// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: a state's otherwise transition (#4489, StateCAD's @ELSE): the transition's Properties' Else (every other case) box
// ticked writes else and disables the condition, unticked empties it (the field enabled); StateCAD's @ELSE typed is
// ticked too; the arcs of the otherwise transitions labelled else in italics whatever their spelling (an empty condition
// when its state has another transition), and in the state's list; saved, its HDL compiled and elaborated with no
// warnings, no problem in the console; the box's label and title in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A --t1--> B, A --t2--> C, B --t3--> A, B --t4--> C, C --t5--> A
const machine = (conds) => normalizeFsm({
  name: 'el', lang: 'vhdl', inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 100, y: 300 }, { id: 'b', name: 'B', x: 500, y: 60, outputs: { z: '1' } }, { id: 'c', name: 'C', x: 500, y: 540 }],
  transitions: [['a', 'b'], ['a', 'c'], ['b', 'a'], ['b', 'c'], ['c', 'a']].map(([from, to], i) => ({ id: `t${i + 1}`, from, to, cond: conds[i] })),
  initial: 'a',
});

uiTest('#4489 FSM: the Else (every other case) box, StateCAD\'s @ELSE, the otherwise drawn as else in italics; in Portuguese', E, async (page) => {
  const pj = 'FsmElse';
  await makeProject(env, { name: pj, files: { 'src/el.fsm.json': JSON.stringify(machine(['a', '!a', 'b', '!b', '1']), null, 2) } });
  await page.openProject(pj);
  await page.eval(() => window.SilinxApp.openFsm('src/el.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/el.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
  const conds = () => page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions.map((t) => t.cond));
  const select = async (id) => {
    await page.click(`${ED} [data-trans=${id}] .fsm-label`);
    await page.waitFor((ed, t) => document.querySelector(`${ed} [data-trans=${t}].sel`) && document.querySelector(`${ed} .fsm-else-box`), [ED, id], { what: `${id} selected` });
  };
  const box = () => page.eval((ed) => { const b = document.querySelector(`${ed} .fsm-else-box`), c = document.querySelector(`${ed} .fsm-cond`); return { checked: b.checked, cond: c.value, disabled: c.disabled }; }, ED);
  // (each arc's label, and whether it has an italic else)
  const labels = () => page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans] .fsm-label`)].map((l) => {
    const e = l.querySelector('.fsm-else');
    return e ? `${l.textContent} [${getComputedStyle(e).fontStyle}]` : l.textContent;
  }), ED);
  const problems = () => page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent));
  assert.deepEqual(await labels(), ['a', '/a', 'b', '/b', '1']);

  // ---- ticked: else, the condition disabled; drawn else in italics
  await select('t2');
  assert.deepEqual(await box(), { checked: false, cond: '!a', disabled: false });
  await page.click(`${ED} .fsm-else-box`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-else-box`)?.checked && document.querySelector(`${ed} .fsm-cond`).disabled, [ED], { what: 'the box ticked' });
  assert.deepEqual(await box(), { checked: true, cond: 'else', disabled: true });
  assert.deepEqual(await conds(), ['a', 'else', 'b', '!b', '1']);
  // ---- StateCAD's @ELSE typed: the box ticked when selected again; drawn else
  await select('t4');
  await page.fill(`${ED} .fsm-cond`, '@ELSE');
  await select('t1');
  await select('t4');
  assert.deepEqual(await box(), { checked: true, cond: '@ELSE', disabled: true });
  assert.deepEqual(await labels(), ['a', 'else [italic]', 'b', 'else [italic]', '1']);
  // (B's list of transitions: the otherwise last, as else)
  await page.click(`${ED} [data-state=b] .fsm-circle`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-tlist`), [ED], { what: 'B selected' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-tlist li`)].map((l) => l.textContent), ED), ['b → A', 'else → C']);

  // ---- unticked: empty, the field enabled; an empty condition with another transition in B: drawn else too
  await select('t4');
  await page.click(`${ED} .fsm-else-box`);
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-cond`)?.disabled, [ED], { what: 'the box unticked' });
  assert.deepEqual(await box(), { checked: false, cond: '', disabled: false });
  assert.deepEqual(await labels(), ['a', 'else [italic]', 'b', 'else [italic]', '1']);
  await page.fill(`${ED} .fsm-cond`, 'b');
  await page.fill(`${ED} .fsm-cond`, '!b');
  assert.deepEqual(await conds(), ['a', 'else', 'b', '!b', '1']);
  assert.deepEqual(await labels(), ['a', 'else [italic]', 'b', '/b', '1']);

  // ---- saved; its HDL compiled and elaborated with no warnings; no problem
  const saved = await page.waitFor(async (p) => {
    const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fel.fsm.json`)).json();
    const c = await (await fetch(`/api/projects/${p}/file?path=src%2Fel.vhd`)).text();
    return m.transitions[1].cond === 'else' && m.transitions[3].cond === '!b' && { m, c };
  }, [pj], { what: 'the diagram and its HDL saved', timeout: 15000 });
  const lib = compile([{ path: 'el.vhd', lang: 'vhdl', text: saved.c }]);
  assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), []);
  assert.deepEqual(elaborate(lib, 'el').diags.map((e) => `${e.severity}: ${e.message}`), []);
  assert.deepEqual(await problems(), []);

  // ---- in Portuguese: the box's label and title
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await select('t2');
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-else-box`)?.parentElement.textContent === 'Senão (todos os outros casos)', [ED], { what: 'the box in Portuguese' });
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-else-box`).parentElement.title, ED),
      'O "caso contrário" do estado (o @ELSE do StateCAD): a transição tomada em todos os casos em que as outras não o são; a sua condição é else');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

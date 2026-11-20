// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: a transition's condition shown as it was typed (#4888), in the Electronics / Engineering notation (the users'
// default): typed in its Properties (oper == "000"), drawn on its arc and listed in its state's transitions as typed,
// not written again (oper == 3'b000); typed in place on the arc (oper = 3'b001 and go), the Properties box showing the
// same; saved as typed, its HDL each language's own literals (compiled and elaborated, no warnings); reopened as it was.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

const machine = (lang) => ({
  name: 'ops', lang, inputs: [{ name: 'oper', width: 3 }, { name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 's', name: 'S', x: 100, y: 100 }, { id: 'u', name: 'U', x: 340, y: 100, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 's', to: 'u', cond: 'go' }, { id: 't2', from: 'u', to: 's', cond: '' }], initial: 's',
});
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));
// (an arc's label as written: its bars lines, #4484)
const arc = (page) => page.eval((ed) => { const l = document.querySelector(`${ed} [data-trans=t1] .fsm-label`); return l && (l.dataset.written ?? l.textContent); }, ED);
const box = (page) => page.eval((ed) => document.querySelector(`${ed} .fsm-cond`)?.value ?? null, ED);
const cond = (page) => page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions[0].cond);

/** The transition t1 selected: its label clicked (again while the view still moves, its fit). */
async function selectT1(page) {
  for (let i = 0; ; i++) {
    try { await page.click(`${ED} [data-trans=t1] .fsm-label`); } catch { /* not there yet */ }
    if (await page.eval((ed) => !!(document.querySelector(`${ed} [data-trans=t1].sel`) && document.querySelector(`${ed} .fsm-cond`)), ED)) return;
    assert.ok(i < 20, 't1 not selected');
    await new Promise((r) => setTimeout(r, 100));
  }
}

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmTyped${lang}`, hdl = `src/ops.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#4888 FSM (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): a condition typed in the Properties and on the arc shown as typed in both, saved and reopened so; its HDL its language's`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/ops.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu[0].action());   // (Electronics / Engineering)
    try {
      await page.eval(() => window.SilinxApp.openFsm('src/ops.fsm.json'));
      await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/ops.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the state diagram' });
      await selectT1(page);

      // ---- typed in the Properties: the arc as typed, not oper == 3'b000
      const typed = 'oper == "000"';
      await page.fill(`${ED} .fsm-cond`, typed);
      await page.waitFor((t) => window.Silinx.active.fsmEditor.getModel().transitions[0].cond === t, [typed], { what: 'the condition kept' });
      await page.waitFor((ed, t) => document.querySelector(`${ed} [data-trans=t1] .fsm-label`)?.textContent === t, [ED, typed], { what: 'the arc drawn again' });
      assert.deepEqual([await arc(page), await box(page), await cond(page)], [typed, typed, typed]);

      // ---- typed in place on the arc: the Properties box the same
      const inPlace = "oper = 3'b001 and go";
      await page.dblclick(`${ED} [data-trans=t1] .fsm-label`);
      await page.waitForSelector(`${ED} .fsm-inline`);
      assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-inline`).value, ED), typed);
      await page.fill(`${ED} .fsm-inline`, inPlace);
      await page.key('Enter');
      await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the text in place closed' });
      await page.waitFor((ed, t) => document.querySelector(`${ed} .fsm-cond`)?.value === t, [ED, inPlace], { what: 'the Properties box' });
      assert.deepEqual([await arc(page), await box(page), await cond(page)], [inPlace, inPlace, inPlace]);
      // its state's list of transitions: as typed too
      await page.click(`${ED} [data-state=s]`);
      await page.waitForSelector(`${ED} .fsm-tlist .fsm-tcond`);
      assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-tlist .fsm-tcond`)].map((c) => c.textContent), ED), [inPlace]);

      // ---- saved as typed; its HDL its language's literal, compiled and elaborated with no warnings
      const saved = await page.waitFor(async (p, t) => {
        const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fops.fsm.json`)).json();
        return m.transitions[0].cond === t && m;
      }, [pj, inPlace], { what: 'the diagram saved', timeout: 15000 });
      assert.deepEqual(saved.transitions.map((t) => t.cond), [inPlace, '']);
      const code = await page.waitFor(async (p, h, l) => {
        const t = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
        return (l === 'vhdl' ? t.includes('unsigned(oper) = 1') : t.includes("oper == 3'b001")) && t;
      }, [pj, hdl, lang], { what: 'the HDL made again', timeout: 15000 });
      // (its test: the language's own literal and operators; its header's comment lists the condition as typed)
      const test = code.split('\n').filter((l) => /\bif\b/.test(l) && /\boper\b/.test(l)).map((l) => l.trim());
      assert.deepEqual(test, [lang === 'vhdl' ? "if (unsigned(oper) = 1) and (go = '1') then" : "if ((oper == 3'b001) && go) begin"]);
      const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
      assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
      assert.deepEqual(elaborate(lib, 'ops').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);

      // ---- reopened: as typed, on the arc and in the Properties
      await page.eval(async () => { await window.SilinxApp.closeDoc(window.SilinxApp.findDoc('fsm:src/ops.fsm.json')); });
      await page.eval(() => window.SilinxApp.openFsm('src/ops.fsm.json'));
      await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/ops.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor again' });
      await selectT1(page);
      assert.deepEqual([await arc(page), await box(page), await cond(page)], [inPlace, inPlace, inPlace]);
      assert.deepEqual(await warnings(page), []);
    } finally {
      await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu[1].action());   // (the tests' text only, test/ui/harness.js)
    }
  });
}

// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: a state's code typed in its Properties (#4908): the encoding made User-defined (the machine's Properties' Encoding
// and the status line), the other states keeping the codes they had; a code twice: Check's error in the console, gone
// once it is changed; saved with the states, its HDL the codes as given (compiled and elaborated, no warnings); the
// Encoding chosen back to Binary, the codes kept; the labels in Portuguese.
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
  name: 'ue', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160 }, { id: 'b', name: 'B', x: 360, y: 160 }, { id: 'c', name: 'C', x: 240, y: 360, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'c', cond: 'go' }, { id: 't3', from: 'c', to: 'a', cond: 'go' }], initial: 'a',
});
const status = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} > .doc-status .ds-f`)].map((f) => f.textContent), ED);
const encoding = (page) => page.eval((ed) => document.querySelector(`${ed} select.fsm-encoding`).value, ED);
const codes = (page) => page.eval(() => { const m = window.Silinx.active.fsmEditor.getModel(); return [m.encoding, m.states.map((s) => s.code ?? null)]; });
const problems = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent));
async function select(page, id) {
  await page.click(`${ED} [data-state=${id}] .fsm-circle`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-scode`), [ED], { what: `${id} selected` });
}

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmCodes${lang}`, hdl = `src/ue.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#4908 FSM (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): a state's code typed, the encoding User-defined, a code twice Check's error, saved, its HDL; Portuguese`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/ue.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/ue.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/ue.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    assert.deepEqual([await encoding(page), (await status(page))[2]], ['binary', 'Encoding: Binary']);

    // ---- B's code, binary 01, typed 11: User-defined, A and C keeping 00 and 10
    await select(page, 'b');
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-scode`).value, ED), '01');
    await page.fill(`${ED} .fsm-scode`, '11');
    await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states[1].code === '11', [], { what: 'the code kept' });
    assert.deepEqual(await codes(page), ['user', ['00', '11', '10']]);
    await page.waitFor((ed) => document.querySelector(`${ed} select.fsm-encoding`)?.value === 'user', [ED], { what: 'the Encoding field' });
    assert.equal((await status(page))[2], 'Encoding: User-defined');

    // ---- C's typed 11 too: Check's error in the console; then 01, none
    await select(page, 'c');
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-scode`).value, ED), '10');
    await page.fill(`${ED} .fsm-scode`, '11');
    await page.waitFor(() => [...document.querySelectorAll('#console-errors .diag')].some((d) => d.textContent.endsWith('States B and C have the same code 11')), [], { what: 'Check\'s error' });
    await page.fill(`${ED} .fsm-scode`, '01');
    await page.waitFor(() => ![...document.querySelectorAll('#console-errors .diag')].some((d) => /same code/.test(d.textContent)), [], { what: 'the error gone' });
    assert.deepEqual(await codes(page), ['user', ['00', '11', '01']]);

    // ---- saved with the states; its HDL the codes as given, compiled and elaborated with no warnings
    const code = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fue.fsm.json`)).json();
      const c = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
      return m.encoding === 'user' && m.states[2].code === '01' && /Encoding {4}: user/.test(c) && c;
    }, [pj, hdl], { what: 'the diagram and its HDL saved', timeout: 15000 });
    const consts = code.split('\n').filter((l) => /^\s*(constant|localparam)\b.*S_[ABC]\b/.test(l)).map((l) => l.trim());
    assert.deepEqual(consts, lang === 'vhdl' ? ['constant S_A : state_t := "00";', 'constant S_B : state_t := "11";', 'constant S_C : state_t := "01";']
      : ["localparam [1:0] S_A = 2'b00;", "localparam [1:0] S_B = 2'b11;", "localparam [1:0] S_C = 2'b01;"]);
    const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'ue').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(await problems(page), []);

    // ---- the Encoding back to Binary: the binary codes shown, the user's kept for later
    await page.eval((ed) => { const s = document.querySelector(`${ed} select.fsm-encoding`); s.value = 'binary'; s.dispatchEvent(new Event('change')); }, ED);
    assert.deepEqual(await codes(page), ['binary', ['00', '11', '01']]);
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-scode`).value, ED), '10');

    // ---- in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await select(page, 'b');
      assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-field .asm-label`)].some((l) => l.textContent === 'Código'), ED), 'Código');
      assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-scode`).title, ED), 'O código do estado: escrever um torna a codificação Definida pelo utilizador');
      assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} select.fsm-encoding option`)].some((o) => o.textContent === 'Definida pelo utilizador'), ED));
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  });
}

// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: a state diagram's output set to a don't care (#4891): in a state's Properties ("1X0", X), drawn as written in its
// circle; on the drawing, in place, a transition's (go / z=3'b0x1), its Properties showing the same; saved as written,
// its HDL each language's don't care (VHDL '-', Verilog x: compiled and elaborated, no warnings); Try it showing X; the
// Outputs' tooltip in Portuguese; no warning in the console.
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
  name: 'dc', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160 }, { id: 'b', name: 'B', x: 380, y: 160, outputs: { y: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'a', cond: '' }], initial: 'a',
});
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmDc${lang}`, hdl = `src/dc.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#4891 FSM (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): an output set to X in the Properties and on the drawing, shown as written, its HDL a don't care, Try it showing X`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/dc.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/dc.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/dc.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    const outs = () => page.eval(() => { const m = window.Silinx.active.fsmEditor.getModel(); return [m.states.map((s) => s.outputs), m.transitions.map((t) => t.outputs)]; });

    // ---- the state A: z "1X0", y X in its Properties; drawn as written in its circle
    await page.click(`${ED} [data-state=a] .fsm-circle`);
    await page.waitForSelector(`${ED} .fsm-outvals.souts`);
    await page.fill(`${ED} input[data-key="souts:z"]`, '"1X0"');
    await page.fill(`${ED} input[data-key="souts:y"]`, 'X');
    await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states[0].outputs.y === 'X', [], { what: 'the values kept' });
    assert.deepEqual(await outs(), [[{ z: '"1X0"', y: 'X' }, { y: '1' }], [{}, {}]]);
    await page.waitFor((ed) => [...document.querySelectorAll(`${ed} [data-state=a] .fsm-outs`)].map((x) => x.textContent).join('|') === 'z="1X0"|y=X', [ED], { what: 'A drawn again' });

    // ---- the transition A → B, in place: go / z=3'b0x1; its Properties the same
    await page.dblclick(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitForSelector(`${ED} .fsm-inline`);
    await page.fill(`${ED} .fsm-inline`, "go / z=3'b0x1");
    await page.key('Enter');
    await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the text in place closed' });
    assert.deepEqual(await outs(), [[{ z: '"1X0"', y: 'X' }, { y: '1' }], [{ z: "3'b0x1" }, {}]]);
    await page.click(`${ED} [data-trans=t1] .fsm-label`);
    await page.waitForSelector(`${ED} .fsm-outvals.touts`);
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} input[data-key="touts:z"]`).value, ED), "3'b0x1");
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans=t1] .fsm-label tspan`)].map((x) => x.textContent), ED), ['go /', "z=3'b0x1"]);

    // ---- saved as written; its HDL a don't care, compiled and elaborated with no warnings
    const code = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fdc.fsm.json`)).json();
      const c = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
      return m.transitions[0].outputs?.z === "3'b0x1" && /Mealy/.test(c) && c;
    }, [pj, hdl], { what: 'the diagram and its HDL saved', timeout: 15000 });
    const asg = code.split('\n').filter((l) => /^\s+(S_B: )?[zy] (<=|=) /.test(l)).map((l) => l.trim().replace(/^S_B: /, ''));
    assert.deepEqual(asg, lang === 'vhdl' ? ['z <= "000";', "y <= '0';", 'z <= "1-0";', "y <= '-';", 'z <= "0-1";', "y <= '1';"]
      : ["z = 3'b000;", "y = 1'b0;", "z = 3'b1x0;", "y = 1'bx;", "z = 3'b0x1;", "y = 1'b1;"]);
    const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'dc').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);

    // ---- Try it: in A (go 0) z 1X0, y X
    await page.click(`${ED} .asm-toolbar .asm-btn`, { text: 'Try it' });
    await page.waitFor((ed) => document.querySelectorAll(`${ed} .fsm-sim-outputs .fsm-led`).length === 2, [ED], { what: 'the Try it panel' });
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-sim-outputs .fsm-led`)].map((x) => x.textContent), ED), ['z = 1X0', 'y = X']);
    await page.click(`${ED} .asm-toolbar .asm-btn`, { text: 'Try it' });
    assert.deepEqual(await warnings(page), []);

    // ---- the Outputs' hint, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.click(`${ED} [data-state=b] .fsm-circle`);
      await page.waitForSelector(`${ED} .fsm-outvals.souts`);
      await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .asm-fhint`)].some((x) => x.textContent === 'O valor de cada saída neste estado (vazio: o seu valor por omissão; X ou "1X0": indiferente).'), [ED], { what: 'the hint in Portuguese' });
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  });
}

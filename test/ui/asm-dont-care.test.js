// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: an ASM chart's output set to a don't care (#4895), as a state diagram's (#4891): a state's Moore outputs typed in
// its Properties (z = "1X0", y = X), drawn as written in its box; Validate with nothing to say; saved as written, its HDL
// each language's don't care (VHDL '-', Verilog x: compiled and elaborated, no warnings); Try it showing X; the
// actions' syntax hint in Portuguese; no warning in the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden]) .asm-editor';

/** A: a decision go, its true exit a conditional output z = "0-1" to B (y = 1), B back to A. */
const chart = (lang) => ({
  version: 1, name: 'dc', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: '0' }],
  nodes: [
    { id: 'a', type: 'state', name: 'A', x: 200, y: 80, actions: [] }, { id: 'd', type: 'decision', x: 200, y: 200, cond: 'go' },
    { id: 'o', type: 'output', x: 200, y: 320, actions: ['z = "0-1"'] }, { id: 'b', type: 'state', name: 'B', x: 200, y: 440, actions: ['y = 1'] },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'd', port: 'next' }, { id: 'e2', from: 'd', to: 'o', port: 'true' }, { id: 'e3', from: 'd', to: 'a', port: 'false' },
    { id: 'e4', from: 'o', to: 'b', port: 'next' }, { id: 'e5', from: 'b', to: 'a', port: 'next' }],
  initial: 'a',
});
// a node selected: clicked on a point of it on top (test/ui/asm-parts.test.js's)
async function pick(page, id) {
  for (let k = 0; k < 20; k++) {
    if (await page.eval((d, i) => !!document.querySelector(`${d} [data-node="${i}"].sel`), D, id)) return;
    const p = await page.eval((d, i) => {
      const e = document.querySelector(`${d} [data-node="${i}"]`), r = e.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('[data-node]') === e) return { x, y };
      }
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, D, id);
    await page.click(p);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`node ${id} not selected`);
}
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));
const SYNTAX = { en: 'Syntax: out = 1, out = 4\'b1010, out = X or "1X0" (a don\'t care), cnt = cnt + 1 (registered), or just "out" for out = 1',
  pt: 'Sintaxe: out = 1, out = 4\'b1010, out = X ou "1X0" (indiferente), cnt = cnt + 1 (registada), ou apenas "out" para out = 1' };

for (const lang of ['vhdl', 'verilog']) {
  const pj = `AsmDc${lang}`, hdl = `src/dc.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#4895 ASM chart (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): an output set to X in a state's Properties, drawn as written, its HDL a don't care, Try it showing X`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/dc.asm.json': JSON.stringify(chart(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openAsm('src/dc.asm.json'));
    await page.waitFor((d) => window.Silinx.active?.id === 'asm:src/dc.asm.json' && document.querySelector(`${d} [data-node=b]`), [D], { what: 'the ASM editor' });

    // ---- the state A: z = "1X0", y = X in its Properties; drawn as written in its box
    await pick(page, 'a');
    await page.waitFor((d) => document.querySelector(`${d} textarea.asm-input`), [D], { what: 'A\'s Properties' });
    assert.ok(await page.eval((d, s) => [...document.querySelectorAll(`${d} .asm-fhint`)].some((x) => x.textContent === s), D, SYNTAX.en));
    await page.fill(`${D} textarea.asm-input`, 'z = "1X0"\ny = X');
    await page.waitFor(() => window.Silinx.active.asmEditor.getModel().nodes[0].actions.length === 2, [], { what: 'the actions kept' });
    assert.deepEqual(await page.eval(() => window.Silinx.active.asmEditor.getModel().nodes[0].actions), ['z = "1X0"', 'y = X']);
    await page.waitFor((d) => [...document.querySelectorAll(`${d} [data-node=a] .asm-text`)].map((x) => x.textContent).join('|').includes('z = "1X0"|y = X'), [D], { what: 'A drawn again' });
    assert.deepEqual(await page.eval(() => window.Silinx.active.asmEditor.validate()), []);

    // ---- saved as written; its HDL a don't care, compiled and elaborated with no warnings
    await page.eval(() => window.SilinxApp.saveAll());
    const code = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fdc.asm.json`)).json();
      const r = await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`);
      const c = r.ok && await r.text();
      return m.nodes[0].actions?.[1] === 'y = X' && c && /1X0/.test(c) && c;
    }, [pj, hdl], { what: 'the chart and its HDL saved', timeout: 15000 });
    const asg = code.split('\n').filter((l) => /^\s+[zy] (<=|=) /.test(l)).map((l) => l.trim());
    assert.deepEqual(asg, lang === 'vhdl' ? ['z <= "000";', "y <= '0';", 'z <= "1-0";', "y <= '-';", 'z <= "0-1";', "y <= '1';"]
      : ["z = 3'd0;", "y = 1'b0;", "z = 3'b1x0;", "y = 1'bx;", "z = 3'b0x1;", "y = 1'b1;"]);
    const lib = compile([{ path: hdl.slice(4), lang, text: code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'dc').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);

    // ---- Try it: in A (go 0) z 1X0, y X (not lit); go 1: z 0X1
    await page.click(`${D} .asm-sim-btn`);
    await page.waitFor((d) => document.querySelectorAll(`${d} .asm-simpanel .fsm-led[data-output]`).length === 2, [D], { what: 'the Try it panel' });
    const leds = () => page.eval((d) => [...document.querySelectorAll(`${d} .asm-simpanel .fsm-led[data-output]`)].map((x) => `${x.textContent}${x.classList.contains('on') ? ' (on)' : ''}`), D);
    assert.deepEqual(await leds(), ['z = 1X0', 'y = X']);
    await page.click(`${D} .asm-simpanel .fsm-bit[data-input=go]`);
    await page.waitFor((d) => document.querySelector(`${d} .asm-simpanel .fsm-led[data-output=z]`)?.textContent === 'z = 0X1', [D], { what: 'z 0X1' });
    assert.deepEqual(await leds(), ['z = 0X1', 'y = X']);
    await page.click(`${D} .asm-sim-btn`);
    assert.deepEqual(await warnings(page), []);

    // ---- the actions' syntax hint, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await pick(page, 'b');
      await page.waitFor((d, s) => [...document.querySelectorAll(`${d} .asm-fhint`)].some((x) => x.textContent === s), [D, SYNTAX.pt], { what: 'the hint in Portuguese' });
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  });
}

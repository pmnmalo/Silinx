// UI (#4299): the circuit editor's Show inside draws an IC's leads (from its pins to its gates' inputs, from their tips
// to their output pins, #4224) as lines: their computed fill none, never SVG's default black that closed each bent lead
// into a black triangle; in the light and the dark theme, in both standards (IEEE's shapes, IEC's boxes), the part
// selected too; and in the print's snapshot, which copies the computed styles. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// the leads' computed fills, by IC: { U1: [...], U2: [...] }
const fills = (page) => page.eval((ed) => {
  const out = {};
  for (const l of document.querySelectorAll(`${ed} polyline.circ-gate-line`)) {
    const id = l.closest('[data-id]').dataset.id;
    (out[id] ??= []).push(getComputedStyle(l).fill);
  }
  return out;
}, ED);
const NONE = { U1: Array(12).fill('none'), U2: Array(12).fill('none') };

uiTest('#4299 Show inside: an IC\'s leads unfilled (no black triangles), in both themes and standards, in the print', E, async (page) => {
  await makeProject(env, { name: 'CircLeads', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircLeads');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-gate-ieee`).length === 8, [ED], { what: 'the gates inside' });
  try {
    for (const theme of ['light', 'dark']) {
      await page.eval(async (t) => (await import('/js/silinx.js')).setTheme(t), theme);
      assert.deepEqual(await fills(page), NONE, theme);
    }
    // the 7408 selected (its outline): its leads the same
    await page.click(await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=U2] .circ-ic-body`).getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; }, ED));
    await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U2].circ-sel`), [ED], { what: 'U2 selected' });
    assert.deepEqual(await fills(page), NONE, 'selected');
    // IEC 60617-12's boxes (Settings ▸ Schematic Symbols): the same leads, unfilled
    await page.eval(async () => {
      const { SYMBOL_STANDARDS } = await import('/core/symbol-standard.js');
      (await import('/js/symbol-standard.js')).symbolsMenu().submenu[SYMBOL_STANDARDS.findIndex(([id]) => id === 'iec')].action();
    });
    await page.waitFor((ed) => document.querySelectorAll(`${ed} rect.circ-gate`).length === 8, [ED], { what: 'the IEC boxes' });
    assert.deepEqual(await fills(page), NONE, 'IEC');
    // the print's snapshot (the exported image's too): each lead's style carries fill none, not the black default
    const snap = await page.eval(async (ed) => {
      const svg = document.querySelector(`${ed} svg.circ-canvas`), world = svg.firstElementChild;
      const { svgSnapshot } = await import('/js/print.js');
      const doc = new DOMParser().parseFromString(svgSnapshot(svg, world, { l: 0, t: 0, r: 800, b: 400 }).svg, 'image/svg+xml');
      return [...doc.querySelectorAll('polyline[data-pin]')].map((l) => /(^|;)fill:\s*none(;|$)/.test(l.getAttribute('style')));
    }, ED);
    assert.deepEqual(snap, Array(24).fill(true));
  } finally {
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
  }
});

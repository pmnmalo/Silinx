// UI: a parity generator written once in VHDL (#4397, group F: core/circuit-model-mux.js), the 74280 on a bench: in the
// Parts panel's MSI group, Check (no message), Try it running its core live (ΣEVEN and ΣODD as its inputs go high),
// its Part info; Portuguese. No browser warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { msiBench } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

uiTest('Circuit editor: a 74280 parity generator written once in VHDL: Parts panel, Check, Try it (its core live), Part info; Portuguese', E, async (page) => {
  // (its switches spread out, each clicked on its own: S1 G, S2 H, S3 I, S4 A…; its LEDs D1 ΣEVEN, D2 ΣODD)
  const m = msiBench('74280', { name: 'c74280' });
  m.parts.filter((p) => p.type === 'logic-switch').forEach((p, k) => {
    const w = m.wires.find((x) => x.points[0][0] === p.x && x.points[0][1] === p.y);
    p.x = -14; p.y = 3 * k;
    w.points[0] = [p.x, p.y];
  });
  await makeProject(env, { name: 'CircParity', top: '', files: { 'src/c74280.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircParity');
  await page.eval(() => window.SilinxApp.openFile('src/c74280.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74280"]`), [ED], { what: 'its row' });
  // (in the MSI group: the title row above it)
  assert.equal(await page.eval((ed) => { let e = document.querySelector(`${ed} .circ-lib-part[data-part="74280"]`); while (e && !e.classList.contains('circ-lib-title')) e = e.previousElementSibling; return e?.textContent ?? null; }, ED),
    'MSI (74LS, 4000) (40)');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74280"]`).textContent, ED), '74280 9-bit odd/even parity generator/checker');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING):/.test(l)), []);
  // Try it: none high (even), one, two, three
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const want = async (w) => page.waitFor((ed, x) => ['D1', 'D2'].every((d, i) => document.querySelector(`${ed} [data-id=${d}] .circ-led`).classList.contains('lit') === x[i]), [ED, w], { what: `ΣEVEN, ΣODD ${w}` });
  const flip = async (s) => page.click(await centre(page, `${ED} [data-id=${s}] .circ-sw-body`));
  await want([true, false]);
  for (const [s, w] of [['S1', [false, true]], ['S4', [true, false]], ['S9', [false, true]]]) { await flip(s); await want(w); }
  await page.click(`${ED} .circ-sim-btn`);
  await page.click(await centre(page, `${ED} [data-id=U1]`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'U1 selected' });
  const rows = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection .circ-info-rows tr`)].map((r) => [r.cells[0].textContent, r.cells[1].textContent]), ED);
  assert.deepEqual(rows.slice(0, 4), [['Chip', 'SN74LS280'], ['Family', '74LS (TTL)'], ['Package', 'DIP-14'], ['Supply', 'VCC 14, GND 7']]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74280"]`)?.textContent === '74280 Gerador/verificador de paridade par/ímpar de 9 bits', [ED], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

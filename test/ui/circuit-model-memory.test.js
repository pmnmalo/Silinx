// UI: an addressable latch written once in VHDL (#4397, group F: core/circuit-model-memory.js), the 74259 on a bench: in
// the Parts panel's sequential group, Check (no message), Try it running its core live (its addressed bit following D
// while G̅ is low, kept once it is high), its Part info; Portuguese. No browser warnings. Both interfaces.
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

uiTest('Circuit editor: a 74259 addressable latch written once in VHDL: Parts panel, Check, Try it (its core live), Part info; Portuguese', E, async (page) => {
  // (its switches spread out: S1 S0, S2 S1, S3 S2, S4 D, S5 G̅, S6 CLR̅; its LEDs D1–D8 Q0–Q7)
  const m = msiBench('74259', { name: 'c74259' });
  m.parts.filter((p) => p.type === 'logic-switch').forEach((p, k) => {
    const w = m.wires.find((x) => x.points[0][0] === p.x && x.points[0][1] === p.y);
    p.x = -14; p.y = 3 * k;
    w.points[0] = [p.x, p.y];
  });
  await makeProject(env, { name: 'CircLatch', top: '', files: { 'src/c74259.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircLatch');
  await page.eval(() => window.SilinxApp.openFile('src/c74259.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74259"]`), [ED], { what: 'its row' });
  assert.equal(await page.eval((ed) => { let e = document.querySelector(`${ed} .circ-lib-part[data-part="74259"]`); while (e && !e.classList.contains('circ-lib-title')) e = e.previousElementSibling; return e?.textContent ?? null; }, ED),
    'Sequential (74LS, 4000) (71)');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74259"]`).textContent, ED), '74259 8-bit addressable latch');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING):/.test(l)), []);
  // Try it: CLR̅ high, D high: Q0 (address 0) lit; G̅ high: kept as D goes low; address 2, G̅ low again, D high: Q2 lit too
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const want = async (ids) => page.waitFor((ed, w) => JSON.stringify([...document.querySelectorAll(`${ed} [data-id^=D] .circ-led`)].filter((l) => l.classList.contains('lit')).map((l) => l.closest('[data-id]').dataset.id)) === JSON.stringify(w), [ED, ids], { what: `${ids} lit` });
  const flip = async (s) => page.click(await centre(page, `${ED} [data-id=${s}] .circ-sw-body`));
  await want([]);
  for (const [s, w] of [['S6', []], ['S4', ['D1']], ['S5', ['D1']], ['S4', ['D1']], ['S2', ['D1']], ['S5', ['D1']], ['S4', ['D1', 'D3']]]) { await flip(s); await want(w); }
  await page.click(`${ED} .circ-sim-btn`);
  await page.click(await centre(page, `${ED} [data-id=U1]`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'U1 selected' });
  const rows = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection .circ-info-rows tr`)].map((r) => [r.cells[0].textContent, r.cells[1].textContent]), ED);
  assert.deepEqual(rows.slice(0, 4), [['Chip', 'SN74LS259'], ['Family', '74LS (TTL)'], ['Package', 'DIP-16'], ['Supply', 'VCC 16, GND 8']]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="74259"]`)?.textContent === '74259 Latch endereçável de 8 bits', [ED], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

// UI: a shift register written once in VHDL (#4397, group E: core/circuit-model-shift.js), the 7491 on a bench: in the
// Parts panel, Check (no message), Try it running its core live (A·B shifted in on CLK's rising edges, QH eight clocks
// later), its Part info; Portuguese. No browser warnings. Both interfaces.
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
const lit = (page) => page.eval((ed) => ['D1', 'D2'].map((d) => document.querySelector(`${ed} [data-id=${d}] .circ-led`).classList.contains('lit')), ED);

uiTest('Circuit editor: a 7491 shift register written once in VHDL: Parts panel, Check, Try it (its core live), Part info; Portuguese', E, async (page) => {
  // (its switches S1 CLK, S2 B, S3 A; its LEDs D1 QH, D2 QH̅)
  // (the bench's switches spread out, each clicked on its own)
  const m = msiBench('7491', { name: 'c7491' });
  m.parts.filter((p) => p.type === 'logic-switch').forEach((p, k) => {
    const w = m.wires.find((x) => x.points[0][0] === p.x && x.points[0][1] === p.y);
    p.x = -14; p.y = 5 * k;
    w.points[0] = [p.x, p.y];
  });
  await makeProject(env, { name: 'CircShift', top: '', files: { 'src/c7491.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircShift');
  await page.eval(() => window.SilinxApp.openFile('src/c7491.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7491"]`), [ED], { what: 'its row' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7491"]`).textContent, ED), '7491 8-bit serial in, serial out shift register');
  // Check: no message
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING):/.test(l)), []);
  // Try it: A and B high, eight clocks: QH high, QH̅ low; A low, eight more: QH low
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const flip = async (s) => page.click(await centre(page, `${ED} [data-id=${s}] .circ-sw-body`));
  const clocks = async (n, want) => {
    for (let k = 0; k < n; k++) { await flip('S1'); await flip('S1'); }
    await page.waitFor((ed, w) => ['D1', 'D2'].every((d, i) => document.querySelector(`${ed} [data-id=${d}] .circ-led`).classList.contains('lit') === w[i]), [ED, want], { what: `QH, QH̅ ${want}` });
  };
  await flip('S2');
  await flip('S3');
  await clocks(7, [false, false]);   // (seven clocks: QH still unknown, neither lit)
  await clocks(1, [true, false]);
  await flip('S3');
  await clocks(7, [true, false]);
  await clocks(1, [false, true]);
  assert.deepEqual(await lit(page), [false, true]);
  await page.click(`${ED} .circ-sim-btn`);
  // its Part info
  await page.click(await centre(page, `${ED} [data-id=U1]`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'U1 selected' });
  const rows = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection .circ-info-rows tr`)].map((r) => [r.cells[0].textContent, r.cells[1].textContent]), ED);
  assert.deepEqual(rows.slice(0, 4), [['Chip', 'SN74LS91'], ['Family', '74LS (TTL)'], ['Package', 'DIP-14'], ['Supply', 'VCC 5, GND 10']]);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7491"]`)?.textContent === '7491 Registo de deslocamento de 8 bits, entrada e saída série', [ED], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

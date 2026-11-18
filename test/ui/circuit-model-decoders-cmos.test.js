// UI: a CMOS decoder checked against its datasheet (#4397, group F: core/circuit-model-decoders.js), the 4028 on a bench: in the Parts
// panel, Check (no message), Try it running its core live (the BCD on A–D, its one output high, 10–15 none), its Part
// info; Portuguese. No browser warnings. Both interfaces.
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
// (the LEDs lit: D3 Q0, D9 Q1, D5 Q9)
const lit = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} [data-id^=D] .circ-led`)].filter((l) => l.classList.contains('lit')).map((l) => l.closest('[data-id]').dataset.id), ED);

uiTest('Circuit editor: a 4028 decoder written once in VHDL: Parts panel, Check, Try it (its core live), Part info; Portuguese', E, async (page) => {
  // (its switches spread out, each clicked on its own: S1 A, S2 D, S3 C, S4 B)
  const m = msiBench('4028', { name: 'c4028' });
  m.parts.filter((p) => p.type === 'logic-switch').forEach((p, k) => {
    const w = m.wires.find((x) => x.points[0][0] === p.x && x.points[0][1] === p.y);
    p.x = -14; p.y = 5 * k;
    w.points[0] = [p.x, p.y];
  });
  await makeProject(env, { name: 'CircCmosDecoder', top: '', files: { 'src/c4028.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircCmosDecoder');
  await page.eval(() => window.SilinxApp.openFile('src/c4028.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="4028"]`), [ED], { what: 'its row' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="4028"]`).textContent, ED), '4028 BCD to decimal decoder');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING):/.test(l)), []);
  // Try it: 0 (Q0 high), 1 (A: Q1), 9 (D too: Q9), 13 (C too: none high)
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const want = async (ids) => page.waitFor((ed, w) => JSON.stringify([...document.querySelectorAll(`${ed} [data-id^=D] .circ-led`)].filter((l) => l.classList.contains('lit')).map((l) => l.closest('[data-id]').dataset.id)) === JSON.stringify(w), [ED, ids], { what: `${ids} lit` });
  const flip = async (s) => page.click(await centre(page, `${ED} [data-id=${s}] .circ-sw-body`));
  await want(['D3']);
  await flip('S1');
  await want(['D9']);
  await flip('S2');
  await want(['D5']);
  await flip('S3');
  await want([]);
  assert.deepEqual(await lit(page), []);
  await page.click(`${ED} .circ-sim-btn`);
  await page.click(await centre(page, `${ED} [data-id=U1]`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'U1 selected' });
  const rows = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection .circ-info-rows tr`)].map((r) => [r.cells[0].textContent, r.cells[1].textContent]), ED);
  assert.deepEqual(rows.slice(0, 4), [['Chip', 'CD4028B'], ['Family', '4000 (CMOS)'], ['Package', 'DIP-16'], ['Supply', 'VDD 16, VSS 8']]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="4028"]`)?.textContent === '4028 Descodificador BCD para decimal', [ED], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

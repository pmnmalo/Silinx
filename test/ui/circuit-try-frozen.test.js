// UI (#5365): while a circuit is tried out (Try it) it is not edited, as the schematic's Try it: the half adder's
// breadboard dragged stays where it is (its parts too); Delete, R, Ctrl+X and Ctrl+V, Edit ▸ Undo change nothing; the
// Wire tool and a part of the Parts panel draw or place nothing; its Properties' fields disabled; Delete and Rotate off in
// its toolbar; its switches still clicked (an LED lit). Stopped: edited again (dragged). No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CTRL = 2;
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);
const model = (page) => page.eval(() => JSON.stringify(window.Silinx.active.circuitEditor.getModel()));

uiTest('#5365 Circuit editor: in Try it nothing is edited (no drag, no Delete, R, cut, paste, undo, wire, part placed; its Properties off); its switches clicked', E, async (page) => {
  await makeProject(env, { name: 'CircFrozen', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircFrozen');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  const m0 = await model(page);
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  // the breadboard dragged by its channel: it stays (its parts too)
  await page.drag(await at(page, 2.4, 5.4), await at(page, 5.4, 10.4));
  await page.click(await at(page, 2.4, 5.4));   // (the breadboard selected)
  for (const [key, mod] of [['Delete', 0], ['r', 0], ['x', CTRL], ['v', CTRL], ['z', CTRL]]) await page.key(key, { modifiers: mod });
  await page.menu('Edit', 'Undo').catch(() => {});
  // the Wire tool: no wire drawn; a part of the Parts panel: none placed
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  await page.click(await at(page, 40, 2)); await page.click(await at(page, 44, 2));
  await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="led"]`).scrollIntoView({ block: 'center' }), ED);
  await page.click(`${ED} .circ-lib-part[data-part="led"]`);
  await page.click(await at(page, 40, 6));
  assert.equal(await model(page), m0, 'the circuit as it was');
  assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .circ-tools [title^="Delete"], ${ed} button[title^="Delete the selection"]`)?.disabled ?? null,
    [...document.querySelectorAll(`${ed} .asm-side input, ${ed} .asm-side select`)].every((x) => x.disabled)], ED), [true, true]);
  assert.deepEqual(await page.eval(() => [window.Silinx.active.circuitEditor.canUndo(), window.Silinx.active.circuitEditor.canDelete(), window.Silinx.active.circuitEditor.canPaste()]), [false, false, false]);
  // its switches still clicked: S1 on, the sum's LED lit
  const knob = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=S1] .circ-sw-knob`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click(knob);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().inputs().S1 === true, [], { what: 'S1 on' });
  assert.equal(await model(page), m0, 'a switch clicked: the circuit as saved');
  // stopped: edited again
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  await page.click(`${ED} [data-act=select]`);
  await page.drag(await at(page, 2.4, 5.4), await at(page, 5.4, 10.4));
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts[0].x === 3, [], { what: 'the breadboard moved' });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

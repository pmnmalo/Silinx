// UI (#5364): a 4×4 matrix keypad in the Circuit editor: the Parts panel's Inputs list it; drawn with its 16 keys (1 2 3
// A / 4 5 6 B / 7 8 9 C / * 0 # D) and its ribbon's pins (R1..R4, C1..C4); Try it: a key held down while the mouse is
// (drawn down), its row joined to its column (R1 on the supply's −, C2 pulled up lighting D1: key 2 darkens D1, key 5
// does not); Check; its Part info, in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'keys', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 }, { id: 'R1', type: 'pull-up', x: 5, y: 6 }, { id: 'D1', type: 'led', x: 5, y: 4 }],
  wires: [{ id: 'g', points: [[0, 10], [-4, 1]], color: 'black' }, { id: 'c', points: [[5, 10], [5, 6]], color: 'blue' }, { id: 'a', points: [[5, 6], [5, 4]], color: 'blue' }, { id: 'k', points: [[6, 4], [-4, 1]], color: 'black' }] };
const lit = (page) => page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`).classList.contains('lit'), ED);
const keyAt = (page, k) => page.eval((ed, key) => { const r = document.querySelector(`${ed} .circ-canvas [data-id=KP1] [data-key="${key}"] rect`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED, k);

uiTest('#5364 Circuit editor: a 4×4 keypad, its keys held down in Try it joining a row to a column; Check; its Part info in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircKeys', top: '', files: { 'src/keys.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircKeys');
  await page.eval(() => window.SilinxApp.openFile('src/keys.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=KP1]`), [ED], { what: 'the circuit editor' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  // the Parts panel's Inputs: the keypad after the DIP switches
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="keypad-4x4"]`)?.textContent, ED), 'Keypad 4×4 (matrix)');
  // drawn: its 16 keys in reading order, its 8 pins named on its ribbon
  assert.deepEqual(await page.eval((ed) => [[...document.querySelectorAll(`${ed} .circ-canvas [data-id=KP1] .circ-key`)].map((k) => k.dataset.key).join(' '),
    [...document.querySelectorAll(`${ed} .circ-canvas [data-id=KP1] .circ-keypad-pin`)].map((t) => t.textContent).join(' ')], ED), ['1 2 3 A 4 5 6 B 7 8 9 C * 0 # D', 'R1 R2 R3 R4 C1 C2 C3 C4']);
  // Check: nothing to say
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: D1 lit (C2 pulled up); key 2 held down: D1 dark, the key drawn down; let go: lit; key 5 (R2 floats): lit
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`)?.classList.contains('lit'), [ED], { what: 'D1 lit' });
  const k2 = await keyAt(page, '2');
  await page.mouse('mouseMoved', k2.x, k2.y); await page.mouse('mousePressed', k2.x, k2.y);
  await page.waitFor((ed) => !document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`).classList.contains('lit'), [ED], { what: 'D1 dark while 2 is held' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=KP1] [data-key="2"]`).classList.contains('down'), ED), true);
  assert.deepEqual(await page.eval(() => window.Silinx.active.circuitEditor.sim().inputs().KP1.map((x) => (x ? 1 : 0)).join('')), '0100000000000000');
  await page.mouse('mouseReleased', k2.x, k2.y);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`).classList.contains('lit'), [ED], { what: 'D1 lit again' });
  const k5 = await keyAt(page, '5');
  await page.mouse('mouseMoved', k5.x, k5.y); await page.mouse('mousePressed', k5.x, k5.y);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().inputs().KP1[5] === true, [], { what: '5 held' });
  assert.equal(await lit(page), true, 'key 5: row 2 floats, D1 stays lit');
  await page.mouse('mouseReleased', k5.x, k5.y);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Part info, in Portuguese
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'KP1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'KP1 selected' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um teclado de membrana, 16 teclas/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="keypad-4x4"]`)?.textContent, ED), 'Teclado 4×4 (matricial)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

// UI: the circuit editor's moves (#4059, #4065, #4066): the half adder's breadboard dragged carries its ICs and LEDs, the
// wires' ends follow (Keep connections, on by default), not ticked they stay; the breadboard turned by R, the parts on it
// with it; copied and pasted (Ctrl+C, Ctrl+V, Edit ▸ Paste), new ids, further each time; Keep connections in Portuguese.
// No warnings. Both interfaces.
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
const model = (page) => page.eval(() => window.Silinx.active.circuitEditor.getModel());
const where = (m, id) => { const p = m.parts.find((x) => x.id === id); return [p.x, p.y, p.rot || 0]; };
const wire = (m, id) => m.wires.find((w) => w.id === id).points;

uiTest('Circuit editor: a breadboard dragged carries its parts, the wires follow (Keep connections); turned; copied and pasted', E, async (page) => {
  await makeProject(env, { name: 'CircMoves', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircMoves');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  await page.eval(() => { try { localStorage.removeItem('silinx.circuit.keep'); } catch { /* none */ } });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-keep-in`).checked, ED), true, 'on by default');
  const m0 = await model(page);
  // the breadboard dragged by its channel 3 columns right, 5 rows down: its ICs and LEDs with it, the switches stay
  await page.drag(await at(page, 2.4, 5.4), await at(page, 5.4, 10.4));
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts[0].x === 3, [], { what: 'the breadboard moved' });
  let m = await model(page);
  assert.deepEqual([where(m, 'BB1'), where(m, 'U1'), where(m, 'D1'), where(m, 'S1')], [[3, 5, 0], [7, 12, 0], [27, 7, 0], [-6, 9, 0]]);
  // (a switch's wire: its end on the board followed it)
  assert.deepEqual(wire(m, 'wb1'), [[-6, 10], [-5, 10], [-5, 11], [8, 16]]);
  assert.deepEqual(await page.eval(() => window.Silinx.active.dirty), true);
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts[0].x === 0, [], { what: 'undone' });
  // Keep connections off: the switch's wire stays where it was
  await page.click(`${ED} .circ-keep`);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.keep')), '0', 'remembered');
  await page.drag(await at(page, 2.4, 5.4), await at(page, 5.4, 10.4));
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts[0].x === 3, [], { what: 'moved again' });
  m = await model(page);
  assert.deepEqual(wire(m, 'wb1'), wire(m0, 'wb1'));
  assert.deepEqual(where(m, 'U1'), [7, 12, 0]);
  await page.menu('Edit', 'Undo');
  await page.click(`${ED} .circ-keep`);
  // the breadboard selected and turned (R): the ICs on it with it, drawn turned
  await page.click(await at(page, 2.4, 5.4));
  await page.key('r');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts[0].rot === 1, [], { what: 'turned' });
  m = await model(page);
  assert.deepEqual([where(m, 'BB1'), where(m, 'U1')], [[0, 0, 1], [-7, 4, 1]]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-id=BB1]`).getAttribute('transform'), ED), 'rotate(90 0 0)');
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => !window.Silinx.active.circuitEditor.getModel().parts[0].rot, [], { what: 'unturned' });
  // copied and pasted: the breadboard, its ICs and LEDs, the wires between them; then again, further
  await page.click(await at(page, 2.4, 5.4));
  await page.key('c', { modifiers: CTRL });
  await page.key('v', { modifiers: CTRL });
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.length === 13, [], { what: 'pasted' });
  m = await model(page);
  assert.deepEqual(m.parts.slice(8).map((p) => [p.id, p.x, p.y]), [['BB2', 2, 2], ['U3', 6, 9], ['U4', 15, 9], ['D3', 26, 4], ['D4', 28, 4]]);
  assert.equal(m.wires.length, 15 + 11);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection h3`).textContent, ED), 'BB2: Half breadboard');
  await page.menu('Edit', 'Paste');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.length === 18, [], { what: 'pasted again' });
  assert.deepEqual(where(await model(page), 'BB3'), [4, 4, 0]);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-keep span`).textContent === 'Manter ligações', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-keep`).title, ED), 'Ao mover ou rodar uma peça: as pontas dos fios seguem os seus pinos e furos, ou ficam onde estão (uma placa de ensaio leva sempre as peças que tem)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

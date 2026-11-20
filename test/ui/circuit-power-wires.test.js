// UI: a new circuit's breadboard powered on both sides (#4929): its supply on the top rails, the top rails joined to the
// bottom ones (+ to + red, − to − black), drawn so; a wire drawn to a + rail red by default (#4932), to a − rail black
// (#4933), between two holes blue; its colour still changed in its Properties. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);
const model = (page) => page.eval(() => window.Silinx.active.circuitEditor.getModel());
const status = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .doc-status .ds-f`)].map((f) => f.textContent), ED);
async function draw(page, ...pts) {
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  for (const [x, y] of pts) await page.click(await at(page, x, y));
}

uiTest('#4929 #4932 #4933 Circuit editor: a new circuit\'s bottom rails powered; a wire to + red, to − black by default', E, async (page) => {
  await makeProject(env, { name: 'CircPower', top: '', files: { 'src/c.circ.json': JSON.stringify(newCircuit('c'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircPower');
  await page.eval(() => window.SilinxApp.openFile('src/c.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-kind=wire][data-id=w4]`), [ED], { what: 'the circuit editor' });
  assert.deepEqual(await status(page), ['0 IC(s) · 0 input(s) · 0 display(s) · 4 wire(s)']);
  // the rails' jumpers on the right: tp30 to bp30 red, tn30 to bn30 black, drawn in their colours
  assert.deepEqual((await model(page)).wires.slice(2).map((w) => [w.id, w.color, w.points[0], w.points.at(-1)]), [['w3', 'red', [29, -4], [29, 15]], ['w4', 'black', [29, -3], [29, 14]]]);
  const stroke = (id) => page.eval((ed, i) => getComputedStyle(document.querySelector(`${ed} [data-id=${i}] .circ-wire`)).stroke, ED, id);
  assert.notEqual(await stroke('w3'), await stroke('w4'));
  assert.equal(await stroke('w3'), await stroke('w1'), 'red as the supply\'s +');
  assert.equal(await stroke('w4'), await stroke('w2'), 'black as its −');
  // a5 to the bottom + rail: red; a6 to the bottom − rail: black; a8 to a10: blue
  await draw(page, [4, 0], [4, 15]);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().wires.length === 5, [], { what: 'a wire to +' });
  await draw(page, [5, 0], [5, 14]);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().wires.length === 6, [], { what: 'a wire to −' });
  await draw(page, [7, 0], [9, 0]);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().wires.length === 7, [], { what: 'a signal\'s wire' });
  assert.deepEqual((await model(page)).wires.slice(4).map((w) => w.color), ['red', 'black', 'blue']);
  assert.equal(await stroke((await model(page)).wires[4].id), await stroke('w1'));
  assert.deepEqual(await status(page), ['0 IC(s) · 0 input(s) · 0 display(s) · 7 wire(s)']);
  // still changed in its Properties (the last one selected: its Colour)
  await page.click(`${ED} [data-act=select]`);
  const id = (await model(page)).wires[4].id;
  const on = await page.eval((ed, i) => {
    const p = document.querySelector(`${ed} [data-kind=wire][data-id=${i}] path`), q = p.getPointAtLength(p.getTotalLength() / 2), m = p.getScreenCTM();
    return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
  }, ED, id);
  await page.click(on);
  await page.waitFor((ed, i) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === `Wire ${i}`, [ED, id], { what: 'the wire selected' });
  await page.fill(`${ED} .circ-selection .circ-color-in`, 'green');
  await page.waitFor((i) => window.Silinx.active.circuitEditor.getModel().wires.find((w) => w.id === i).color === 'green', [id], { what: 'its colour changed' });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

// UI: the boards as a circuit's parts (#5215): the Parts panel's Boards (the Arduino Uno and Nano, the Basys2 and Nexys2),
// a Nano placed from it across the breadboard's channel, drawn with its pins' names (as the System Emulator draws it, #5366); its 5V and GND wired to the rails:
// Check says nothing of it; Try it: its 5V at 1, its GND at 0, its D2 open (its program is a System's); its Part info
// (its pins' roles); Portuguese. Both interfaces.
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
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
async function draw(page, n, ...pts) {
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  for (const [x, y] of pts) await page.click(await at(page, x, y));
  await page.waitFor((k) => window.Silinx.active.circuitEditor.getModel().wires.length === k, [n], { what: `${n} wires` });
}

uiTest('#5215 Circuit editor: a Nano placed from the Parts panel\'s Boards powers the breadboard; Check, Try it, Part info; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircBoards', top: '', files: { 'src/nb.circ.json': JSON.stringify(newCircuit('nb'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircBoards');
  await page.eval(() => window.SilinxApp.openFile('src/nb.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="arduino-nano"]`), [ED], { what: 'the Boards' });
  const group = (g) => page.eval((ed, t) => [...document.querySelectorAll(`${ed} .circ-lib-part[data-group="${t}"]`)].map((b) => [b.dataset.part, b.title]), ED, g);
  assert.deepEqual(await group('Boards'), [['arduino-uno', 'Arduino Uno: click it, then the drawing (Esc: done)'], ['arduino-nano', 'Arduino Nano: click it, then the drawing (Esc: done)'], ['esp32-devkitc', 'ESP32 DevKitC: click it, then the drawing (Esc: done)'],
    ['fpga-basys2', 'Digilent Basys2: click it, then the drawing (Esc: done)'], ['fpga-nexys2', 'Digilent Nexys2: click it, then the drawing (Esc: done)']]);
  // the Nano: pin 1 (D1) in g1, its top row in c (0.6 inch, across the channel)
  await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="arduino-nano"]`).scrollIntoView({ block: 'center' }), ED);
  await page.click(`${ED} .circ-lib-part[data-part="arduino-nano"]`);
  await page.click(await at(page, 0, 8));
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.some((p) => p.type === 'arduino-nano'), [], { what: 'the Nano placed' });
  await page.key('Escape');
  assert.deepEqual((await model(page)).parts.find((p) => p.type === 'arduino-nano'), { id: 'A1', type: 'arduino-nano', x: 0, y: 8 });
  const texts = await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-kind=part][data-id=A1] text`)].map((t) => t.textContent), ED);
  // (drawn as the System Emulator draws it, #5366: its pins' names on it, its id under it)
  assert.deepEqual([texts.slice(0, 3), texts.at(-1)], [['ATmega328P', '16 MHz', 'NANO'], 'A1']);
  assert.deepEqual(['D1', 'D0', 'A7', '5V', 'VIN'].filter((t) => !texts.includes(t)), []);
  // drawn under the wires: the breadboard, the Nano, then the wires
  assert.equal(await page.eval((ed) => { const g = [...document.querySelector(`${ed} .circ-canvas .circ-drawing`).children]; return g.findIndex((e) => e.dataset.id === 'A1') < g.findIndex((e) => e.dataset.kind === 'wire'); }, ED), true);
  // its 5V (pin 27, c4) to the top + rail, its GND (pin 4, g4) from h4 to the top − rail
  await draw(page, 5, [3, 2], [3, -4]);
  await draw(page, 6, [3, 9], [3, -3]);
  await page.click(`${ED} [data-act=select]`);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  // Try it: 5V at 1, GND at 0, D2 open
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  const level = (n) => page.eval((ed, k) => [...document.querySelectorAll(`${ed} [data-id=A1] .circ-pin`)][k - 1].getAttribute('class'), ED, n);
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} [data-id=A1] .circ-pin`)][26].classList.contains('lv1'), [ED], { what: '5V at 1' });
  assert.deepEqual([await level(27), await level(4), await level(29), await level(5)], ['circ-pin lv1', 'circ-pin lv0', 'circ-pin lv0', 'circ-pin lvz']);
  await page.click(`${ED} .circ-sim-btn`);
  // its Part info: what it is, its pins' roles
  const bodyAt = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=A1] .circ-board-body`).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, ED);
  await page.click(bodyAt);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'A1 selected' });
  const info = () => page.eval((ed) => [document.querySelector(`${ed} .circ-selection .circ-info .circ-note`).textContent,
    ...[...document.querySelectorAll(`${ed} .circ-selection .circ-info-pins tr`)].slice(0, 4).map((r) => [...r.cells].map((c) => c.textContent).join(' '))], ED);
  assert.deepEqual(await info(), ["A DIP-30 that straddles a breadboard's channel, its pins the board's (D0…D13, A0…A7; A6 and A7 inputs only): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).",
    "1 D1 the board's pin", "2 D0 the board's pin", '3 RST not connected', '4 GND supply GND']);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um DIP-30/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await info(), ['Um DIP-30 que fica sobre o canal de uma placa de ensaio, os seus pinos os da placa (D0…D13, A0…A7; A6 e A7 só entradas): os seus 5V, 3V3 e GND alimentam a placa de ensaio; os outros pinos são do seu programa, num Sistema (sozinha, não conduzem nada).',
    '1 D1 pino da placa', '2 D0 pino da placa', '3 RST não ligado', '4 GND alimentação GND']);
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-title`)].some((t) => t.textContent === 'Placas (5)'), ED), true);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

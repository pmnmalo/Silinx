// UI: KiCad parts that behave as the library's LED and slide switch (#4349): SparkFun's way, an LED whose cathode is
// pin 1 and a slide switch whose common is its middle pin, drawn as their footprints show them; Try it: the switch
// clicked, the LED lit and dark as the switch goes (its colour its own), the switch's lever toward A or B; their Part
// info; Check says nothing of them; Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const LED_FP = fs.readFileSync(new URL('../fixtures/kicad/parts.pretty/LED_D5.0mm_test.kicad_mod', import.meta.url), 'utf8');
const pin = (n, name) => `(pin passive line (at 0 0 0) (length 2.54) (name "${name}") (number "${n}"))`;
const LIB = `(kicad_symbol_lib (version 20231120) (generator "t")
  (symbol "LED_Green" (property "Reference" "D") (property "Value" "Green") (property "ki_keywords" "LED diode") (property "Footprint" "leds:LED_D5.0mm_test")
    (symbol "LED_Green_1_1" ${pin(1, 'K')} ${pin(2, 'A')}))
  (symbol "SW_SPDT" (property "Reference" "SW") (property "Value" "SPDT") (property "ki_keywords" "switch slide spdt") (property "Footprint" "PinHeader_1x03_P2.54mm_Vertical")
    (symbol "SW_SPDT_1_1" ${pin(1, 'A')} ${pin(2, 'B')} ${pin(3, 'C')})))`;
const T = (s) => `parts/p.kicad_sym#${s}`;
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

uiTest('Circuit editor: a KiCad LED and slide switch behave as the library\'s (#4349): Try it lights the LED as the switch goes; Part info; Portuguese', E, async (page) => {
  // the switch S1 at (0, 0) (its pins at (0..2, 0), the middle its common): A on +, B on −; its common to the LED's anode
  // (D1 at (10, 1): its cathode, pad 1, there, its anode a step up), the cathode on −
  const m = newCircuit('kp', 'vhdl', { breadboard: false });
  m.parts.push({ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'S1', type: T('SW_SPDT'), x: 0, y: 0 }, { id: 'D1', type: T('LED_Green'), x: 10, y: 1 });
  m.wires.push({ id: 'w1', points: [[-20, -20], [0, 0]] }, { id: 'w2', points: [[-20, -19], [2, 0]] }, { id: 'w3', points: [[1, 0], [10, 0]] }, { id: 'w4', points: [[10, 1], [-20, -19]] });
  await makeProject(env, { name: 'CircKiParts', top: '', files: { 'src/kp.circ.json': JSON.stringify(m, null, 2), 'parts/p.kicad_sym': LIB, 'parts/leds.pretty/LED_D5.0mm_test.kicad_mod': LED_FP } });
  await page.setViewport(1440, 900);
  await page.openProject('CircKiParts');
  await page.eval(() => window.SilinxApp.openFile('src/kp.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-fp`), [ED], { what: 'the LED drawn' });
  // their rows and tips; the LED's body green and dark (not trying it), the switch clickable
  const tips = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-part[data-group="KiCad parts (project)"]`)].map((b) => b.title), ED);
  assert.deepEqual(tips, ['Green, as the LED of the library: click it, then the drawing (Esc: done)', 'SPDT, as the Slide switch (SPDT) of the library: click it, then the drawing (Esc: done)']);
  const led = () => page.eval((ed) => [...document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-fp-body`).classList].filter((c) => c.startsWith('circ-led') || c === 'lit'), ED);
  assert.deepEqual(await led(), ['circ-led', 'circ-led-green']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=S1]`).dataset.input, ED), 'switch');
  // Check: nothing of them (no "drawn only")
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(ERROR|WARNING): (S1|D1) /.test(l)), []);
  // Try it: off, the common to A (+): lit; a click: on, to B (−): dark; again: lit
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=D1] .circ-fp-body`)?.classList.contains('lit'), [ED], { what: 'lit: the switch off' });
  const knob = () => page.eval((ed) => { const k = document.querySelector(`${ed} [data-id=S1] .circ-sw-knob`); return [Number(k.getAttribute('x')) + Number(k.getAttribute('width')) / 2, k.classList.contains('on')]; }, ED);
  assert.deepEqual(await knob(), [10, false], 'its lever between its common and A');
  await page.click(await centre(page, `${ED} [data-id=S1] .circ-sw-knob`));
  await page.waitFor((ed) => !document.querySelector(`${ed} [data-id=D1] .circ-fp-body`).classList.contains('lit'), [ED], { what: 'dark: the switch on' });
  assert.deepEqual(await knob(), [30, true], 'its lever between its common and B');
  await page.click(await centre(page, `${ED} [data-id=S1] .circ-sw-knob`));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=D1] .circ-fp-body`).classList.contains('lit'), [ED], { what: 'lit again' });
  await page.click(`${ED} .circ-sim-btn`);
  // the LED's Part info: as the library's LED, its pins by their KiCad numbers
  await page.click(await centre(page, `${ED} [data-id=D1] .circ-fp-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'D1 selected' });
  const about = () => page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`).textContent, ED);
  assert.equal(await about(), 'Behaves as the LED of the library (by its symbol).');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent !== 'Behaves as the LED of the library (by its symbol).', [ED], { what: 'Portuguese' });
  assert.equal(await about(), 'Comporta-se como o LED da biblioteca (pelo seu símbolo).');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { timeout: 120000 });

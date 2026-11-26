// UI (#5383): an oscilloscope in the Circuit editor on a 74LS14's RC oscillator: the Parts panel's Analog group has it;
// drawn (its case, its empty screen, its settings); Try it: its traces, its trigger, its measurements (about 790 Hz, a
// duty cycle of 30 %), its time base's +, its mode NORMAL with a level never reached (waiting), a cursor pair's Δt; its
// Properties' time base saved; Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// (U1, a 7414, its pin 1 at (0, 3): 1A (0, 3), 1Y (1, 3), GND (6, 3), VCC (0, 0))
const CIRC = { format: 'silinx-circuit', version: 1, name: 'osc', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 3 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 }, { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: 1e-6 },
    { id: 'OSC1', type: 'oscilloscope', x: 20, y: 30, tdiv: 0.0005, level: 1.2 }],
  wires: [{ id: 'w1', points: [[-20, -20], [0, 0]], color: 'red' }, { id: 'w2', points: [[-20, -19], [6, 3]], color: 'black' }, { id: 'w3', points: [[1, 3], [-10, 10]], color: 'blue' },
    { id: 'w4', points: [[-6, 10], [0, 3]], color: 'blue' }, { id: 'w5', points: [[-10, 20], [0, 3]], color: 'blue' }, { id: 'w6', points: [[-9, 20], [-20, -19]], color: 'black' },
    { id: 'w7', points: [[20, 30], [1, 3]], color: 'yellow' }, { id: 'w8', points: [[21, 30], [0, 3]], color: 'blue' }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const texts = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] text`)].map((t) => t.textContent), ED);
const knob = async (page, input) => page.click(await centre(page, `${ED} .circ-canvas [data-id=OSC1] [data-input="${input}"] rect`));

uiTest('#5383 Circuit editor: an oscilloscope on an RC oscillator: its traces, measurements, time base, trigger mode, cursors; its Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircScope', top: '', files: { 'src/osc.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircScope');
  await page.eval(() => window.SilinxApp.openFile('src/osc.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-screen`), [ED], { what: 'the scope drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="oscilloscope"]`)?.dataset.group, ED), 'Analog');
  assert.deepEqual((await texts(page)).filter((t) => /div|AUTO|CH1$|V$/.test(t)), ['500 µs/div', '1 V/div', 'CH1', '1.2 V', 'AUTO'], 'its settings, no traces');
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-trace`).length, ED), 0);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: both traces, triggered, measured
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-trace`).length === 2 && [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-meas`)].length === 2, [ED], { what: 'two traces measured', timeout: 15000 });
  const meas = (await texts(page)).filter((t) => /^CH\d f/.test(t));
  assert.match(meas[0], /^CH1 f 7[89]\d Hz T 1\.2\d ms D (29|30|31)\.\d % Vpp 3\.1\d V Vavg /);
  assert.match(meas[1], /^CH2 f 7[89]\d Hz T 1\.2\d ms D [\d.]+ % Vpp 8\d\d mV Vavg /);
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=OSC1] path.circ-scope-mark`) != null, ED), 'the trigger marked');
  // its time base's +: 1 ms a division
  await knob(page, 'scope-t-up');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] text`)].some((t) => t.textContent === '1 ms/div'), [ED], { what: '1 ms/div' });
  // two cursors: a click at a fifth of the screen, another at its middle: Δt 3 ms
  const box = await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-screen`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, ED);
  await page.click({ x: box.x + box.w * 0.2, y: box.y + box.h / 2 }); await page.click({ x: box.x + box.w * 0.5, y: box.y + box.h / 2 });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] text`)].some((t) => t.textContent === 'Δt 3 ms 1/Δt 333 Hz'), [ED], { what: 'Δt 3 ms' });
  // NORMAL, its level at 4 V (never reached): waiting, no traces
  await knob(page, 'scope-mode');
  for (let k = 0; k < 28; k++) await knob(page, 'scope-l-up');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] text`)].some((t) => t.textContent === 'Waiting for the trigger'), [ED], { what: 'waiting' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-trace`).length, ED), 0);
  assert.ok((await texts(page)).includes('NORMAL') && (await texts(page)).includes('4 V'));
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  assert.ok((await texts(page)).includes('500 µs/div'), 'its saved settings again');
  // its Properties: its time base saved
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'OSC1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-scope-in[data-prop="tdiv"]`), [ED], { what: 'OSC1 selected' });
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-selection .circ-scope-in[data-prop="tdiv"]`); s.value = '0.002'; s.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'OSC1').tdiv === 0.002, [], { what: 'saved 2 ms' });
  assert.ok((await texts(page)).includes('2 ms/div'));
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Dois canais, CH1 e CH2/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.firstChild.textContent).filter((t) => /disparo|divisão/.test(t)), ED),
    ['Base de tempo (por divisão)', 'Escala (por divisão)', 'Fonte do disparo', 'Flanco do disparo', 'Nível do disparo (V)', 'Modo do disparo']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="oscilloscope"]`)?.textContent, ED), 'Osciloscópio');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

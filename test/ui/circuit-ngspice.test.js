// UI (#5386): ngspice in the Circuit editor's Try it, on a 74LS14's RC oscillator with an oscilloscope: the Try it bar's
// ngspice button (an analog circuit's, on the local server); the run so far simulated again by ngspice, one way, said in
// the console: its note, then each oscilloscope channel's range (the capacitor between 0 V at time 0 and the Schmitt
// trigger's 1.6 V); in Portuguese, its tip and its lines; no warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// (U1, a 7414, its pin 1 at (0, 3): 1A (0, 3), 1Y (1, 3), GND (6, 3), VCC (0, 0); OSC1's CH1 on 1Y, CH2 on 1A)
const CIRC = { format: 'silinx-circuit', version: 1, name: 'osc', lang: 'vhdl',
  parts: [{ id: 'P1', type: 'supply', x: -20, y: -20 }, { id: 'U1', type: '7414', x: 0, y: 3 }, { id: 'R1', type: 'resistor', x: -10, y: 10, ohms: 1000 }, { id: 'C1', type: 'capacitor', x: -10, y: 20, farads: 1e-6 },
    { id: 'OSC1', type: 'oscilloscope', x: 20, y: 30, tdiv: 0.0005, level: 1.2 }],
  wires: [{ id: 'w1', points: [[-20, -20], [0, 0]], color: 'red' }, { id: 'w2', points: [[-20, -19], [6, 3]], color: 'black' }, { id: 'w3', points: [[1, 3], [-10, 10]], color: 'blue' },
    { id: 'w4', points: [[-6, 10], [0, 3]], color: 'blue' }, { id: 'w5', points: [[-10, 20], [0, 3]], color: 'blue' }, { id: 'w6', points: [[-9, 20], [-20, -19]], color: 'black' },
    { id: 'w7', points: [[20, 30], [1, 3]], color: 'yellow' }, { id: 'w8', points: [[21, 30], [0, 3]], color: 'blue' }] };
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
const NOTE = 'osc.circ.json: ngspice: one way — the digital outputs, as Silinx simulated them, drive ngspice\'s analog circuit; ngspice\'s waveforms change nothing of the digital side';

uiTest('#5386 Circuit editor: Try it\'s ngspice on an RC oscillator: its button, the run again by ngspice, one way, its scope\'s ranges in the console; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircSpice', top: '', files: { 'src/osc.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircSpice');
  await page.eval(() => window.SilinxApp.openFile('src/osc.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=OSC1]`), [ED], { what: 'the circuit' });
  // Try it: the bar's ngspice (an analog circuit), after a few milliseconds of the oscillator
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => { const b = document.querySelector(`${ed} .circ-ngspice`); return b && !b.hidden && window.Silinx.active.circuitEditor && document.querySelector(`${ed} .circ-time`)?.textContent.match(/t = (\d+) ns/)?.[1] > 5e6; }, [ED], { what: 'its button, 5 ms run', timeout: 30000 });
  await page.click(`${ED} .circ-ngspice`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^osc\.circ\.json: ngspice: OSC1 CH2 /.test(l.textContent.trim())), [], { what: 'ngspice\'s lines', timeout: 120000 });
  const ls = await lines(page), at = ls.indexOf(NOTE);
  assert.ok(at > 0, ls.join('\n'));
  assert.match(ls[at - 1], /^osc\.circ\.json: ngspice: running osc's [\d.]+ m?s…$|^osc\.circ\.json: ngspice: downloading eecircuit-engine/);
  assert.match(ls[at + 1], /^osc\.circ\.json: ngspice: OSC1 CH1 from [\d.]+ V to 3\.\d{3} V, [\d.]+ V at the end$/);
  assert.match(ls[at + 2], /^osc\.circ\.json: ngspice: OSC1 CH2 from 0\.000 V to 1\.6\d\d V, [\d.]+ V at the end$/);
  assert.deepEqual(ls.filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  // in Portuguese: its tip, its lines
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-ngspice`)?.title.startsWith('Simular de novo com o ngspice'), [ED], { what: 'Portuguese' });
  await page.click(`${ED} .circ-ngspice`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^osc\.circ\.json: ngspice: OSC1 CH2 de [\d.]+ V a 1\.6\d\d V, [\d.]+ V no fim$/.test(l.textContent.trim())), [], { what: 'ngspice in Portuguese', timeout: 120000 });
  assert.ok((await lines(page)).includes('osc.circ.json: ngspice: num só sentido — as saídas digitais, como o Silinx as simulou, comandam o circuito analógico do ngspice; as formas de onda do ngspice não mudam nada do lado digital'));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.key('Escape');
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 240000 });

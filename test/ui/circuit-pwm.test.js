// UI (#5384): a PWM-dimmed LED in the Circuit editor: a function generator's square wave through a resistor to an LED,
// an oscilloscope on its output, a Pmod DA2 and a Pmod AD1 beside them; the Parts panel's Analog group;
// drawn; Check; Try it: the LED as bright as its mean current, its duty cycle's − (dimmer), the scope's duty measured;
// the generator's Properties' wave saved; Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// (FG1's OUT (0,0), COM (1,0); R1 (0,4)-(4,4); D1 (8,4)-(9,4); OSC1's CH1 (20,10))
const CIRC = { format: 'silinx-circuit', version: 1, name: 'pwm', lang: 'vhdl',
  parts: [{ id: 'FG1', type: 'function-generator', x: 0, y: 0, hz: 1000, duty: 50 }, { id: 'R1', type: 'resistor', x: 0, y: 4, ohms: 150 }, { id: 'D1', type: 'led', x: 8, y: 4 },
    { id: 'OSC1', type: 'oscilloscope', x: 20, y: 10, tdiv: 0.0002, level: 2.5 }, { id: 'DA1', type: 'pmod-da2', x: 40, y: 10 }, { id: 'AD1', type: 'pmod-ad1', x: 50, y: 10 }],
  wires: [{ id: 'w1', points: [[0, 0], [0, 4]] }, { id: 'w2', points: [[4, 4], [8, 4]] }, { id: 'w3', points: [[9, 4], [1, 0]] }, { id: 'w4', points: [[0, 0], [20, 10]] }] };
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const opacity = (page) => page.eval((ed) => Number(document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`)?.style.opacity || 0), ED);

uiTest('#5384 Circuit editor: a PWM-dimmed LED, its duty cycle turned in Try it, the scope\'s duty; the Pmods drawn; Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircPwm', top: '', files: { 'src/pwm.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircPwm');
  await page.eval(() => window.SilinxApp.openFile('src/pwm.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=FG1] .circ-bench-case`) && document.querySelector(`${ed} .circ-canvas [data-id=DA1] .circ-pmod-board`), [ED], { what: 'drawn' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => ['function-generator', 'lm393', 'pmod-da2', 'pmod-ad1'].map((t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`)?.dataset.group), ED), ['Analog', 'Analog', 'Analog', 'Analog']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=DA1] text, ${ed} .circ-canvas [data-id=AD1] text`)].map((t) => t.textContent), ED), ['PmodDA2', '2 × DAC121S101', 'DA1', 'PmodAD1', '2 × AD7476A', 'AD1']);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: at 50 %, the LED lit, its mean current about half of its ~19 mA
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => /^CH1 f 1 kHz T 1 ms D 50 %/.test([...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-meas`)][0]?.textContent ?? ''), [ED], { what: 'the scope at 50 %', timeout: 15000 });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] .circ-led`)?.classList.contains('lit'), [ED], { what: 'lit' });
  const half = await opacity(page);
  // its duty cycle's − eight times: 10 %
  const down = await centre(page, `${ED} .circ-canvas [data-id=FG1] [data-input="sense-down"] rect`);
  for (let k = 0; k < 8; k++) await page.click(down);
  await page.waitFor((ed) => /^CH1 f 1 kHz T 1 ms D 10 %/.test([...document.querySelectorAll(`${ed} .circ-canvas [data-id=OSC1] .circ-scope-meas`)][0]?.textContent ?? ''), [ED], { what: 'the scope at 10 %', timeout: 15000 });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  const dim = await opacity(page);
  assert.ok(dim < half - 0.15, `dimmer: ${dim} after ${half}`);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Properties: its wave a sine
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'FG1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-choice-in[data-prop="wave"]`), [ED], { what: 'FG1 selected' });
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-selection .circ-choice-in[data-prop="wave"]`); s.value = 'sine'; s.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'FG1').wave === 'sine', [], { what: 'a sine' });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um gerador de funções de bancada/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection label`)].map((l) => l.firstChild.textContent).filter((t) => /Frequência|Nível|Ciclo|Onda/.test(t)), ED), ['Ciclo de trabalho (%)', 'Frequência (Hz)', 'Nível alto (V)', 'Nível baixo (V)', 'Onda']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="pmod-ad1"]`)?.textContent, ED), 'Pmod AD1 (dois ADCs de 12 bits, SPI)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

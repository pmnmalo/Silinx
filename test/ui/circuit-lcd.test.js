// UI (#5330): the character LCD 16×2 in the Circuit editor. Its row in the Parts panel's Outputs; a circuit with the LCD
// powered, its RW on GND, logic switches on RS, E and D0..D7: drawn as the module (its 16 pins, its glass dark); Try it:
// the switches clicked as a program writes (display on: 0x0C, then RS and 'A', 0x41, each with E on and off): its glass
// lit, its A drawn; Check with no warnings; its Part info; Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeCircuit } from '../../core/circuit.js';
import { LCD_1602 } from '../../core/circuit-lcd.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const pinX = (name) => LCD_1602.pins.find((p) => p.name === name).dx;
const LINES = ['RS', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
const CIRC = normalizeCircuit({ name: 'lcd', parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'LCD1', type: 'lcd-1602', x: 0, y: 0 },
  ...LINES.map((n) => ({ id: `S${n}`, type: 'logic-switch', x: pinX(n), y: -5 }))],
wires: [{ id: 'v', points: [[-4, -10], [pinX('VDD'), 0]] }, { id: 'g', points: [[-4, -9], [pinX('VSS'), 0]] }, { id: 'rw', points: [[-4, -9], [pinX('RW'), 0]] },
  ...LINES.map((n) => ({ id: `w${n}`, points: [[pinX(n), -5], [pinX(n), 0]] }))] });
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const isOn = (page, id) => page.eval((ed, i) => document.querySelector(`${ed} [data-id=${i}] .circ-sw-knob`).classList.contains('on'), ED, id);
// a switch turned to `on` (a click when it is not)
async function turn(page, id, on) {
  if (await isOn(page, id) === on) return;
  await page.click(await centre(page, `${ED} [data-id=${id}] .circ-sw-body`));
  await page.waitFor((ed, i, v) => document.querySelector(`${ed} [data-id=${i}] .circ-sw-knob`).classList.contains('on') === v, [ED, id, on], { what: `${id} ${on ? 'on' : 'off'}` });
}
async function write(page, rs, b) {
  await turn(page, 'SRS', !!rs);
  for (let k = 0; k < 8; k++) await turn(page, `SD${k}`, !!((b >> k) & 1));
  await turn(page, 'SE', true);
  await turn(page, 'SE', false);
}
const glass = (page) => page.eval((ed) => { const g = document.querySelector(`${ed} [data-id=LCD1]`); return [g.querySelector('.circ-lcd-glass').classList.contains('on'), [...g.querySelectorAll('.circ-lcd-char')].map((c) => `${c.dataset.row}:${c.dataset.col}:${c.textContent}`)]; }, ED);

uiTest('#5330 Circuit editor: a character LCD written by switches in Try it, its glass lit and its A drawn; its row, Check, Part info; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircLcd', top: '', files: { 'src/lcd.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircLcd');
  await page.eval(() => window.SilinxApp.openFile('src/lcd.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=LCD1] .circ-lcd-body`), [ED], { what: 'the LCD drawn' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="lcd-1602"]`)?.dataset.group, ED), 'Outputs');
  assert.deepEqual([await page.eval((ed) => document.querySelectorAll(`${ed} [data-id=LCD1] .circ-pin`).length, ED), await glass(page)], [16, [false, []]]);
  // Check: nothing to say
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: display on (0x0C), then 'A' (0x41)
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await write(page, 0, 0x0c);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LCD1] .circ-lcd-glass.on`), [ED], { what: 'the glass lit' });
  await write(page, 1, 0x41);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LCD1] .circ-lcd-char`), [ED], { what: 'its A' });
  assert.deepEqual(await glass(page), [true, ['0:0:A']]);
  // Fit: the whole module in view, its body larger than its pins (#5330)
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.equal(await page.eval((ed) => { const c = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect(), b = document.querySelector(`${ed} [data-id=LCD1] .circ-lcd-body`).getBoundingClientRect(); return b.top >= c.top && b.bottom <= c.bottom && b.left >= c.left && b.right <= c.right; }, ED), true);
  await page.click(`${ED} .circ-sim-btn`);
  // its Part info
  // (its body's top left: the circuit's view shows its top)
  await page.click(await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=LCD1] .circ-lcd-body`).getBoundingClientRect(); return { x: r.left + 30, y: r.top + 50 }; }, ED));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'LCD1 selected' });
  const about = () => page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`).textContent, ED);
  assert.match(await about(), /^Two lines of 16 characters, its HD44780 controller simulated/);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Duas linhas de 16 caracteres/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent || ''), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection h3`).textContent, ED), 'LCD1: LCD de caracteres 16×2 (HD44780)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

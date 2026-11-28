// UI (#5347): the servo SG90. The Circuit editor: its row in the Parts panel's Outputs, placed from it, drawn with its
// arm at 90°; Check says its signal is driven by nothing; its Part info; Portuguese. The System Emulator: an Arduino
// Uno's Timer1 PWM on D9 (2 ms pulses every 20 ms) through a circuit node, the arm drawn moving to 135°. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';
import { PARTS } from '../../core/circuit-parts.js';
import { avrAssemble, intelHex } from '../avr-asm.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);

uiTest('#5347 Circuit editor: a servo placed from the Parts panel\'s Outputs, its arm at 90°, Check, Part info; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircServo', top: '', files: { 'src/s.circ.json': JSON.stringify(newCircuit('s'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircServo');
  await page.eval(() => window.SilinxApp.openFile('src/s.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="servo-sg90"]`), [ED], { what: 'the Parts panel' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="servo-sg90"]`).dataset.group, ED), 'Outputs');
  await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="servo-sg90"]`).scrollIntoView({ block: 'center' }), ED);
  await page.click(`${ED} .circ-lib-part[data-part="servo-sg90"]`);
  await page.click(await at(page, 5, 2));
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.some((p) => p.type === 'servo-sg90'), [], { what: 'the servo placed' });
  await page.key('Escape');
  assert.deepEqual(await page.eval((ed) => { const g = document.querySelector(`${ed} [data-id=M1]`); return [g.querySelector('.circ-servo-arm').dataset.angle, g.querySelector('.circ-label').textContent]; }, ED), ['90', 'M1  90°']);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully with/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^WARNING: M1/.test(l)), ['WARNING: M1 (Servo (SG90, PWM)) joins nothing']);
  // its Part info
  await page.click(await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=M1] .circ-servo-body`).getBoundingClientRect(); return { x: r.left + 12, y: r.top + 12 }; }, ED));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'M1 selected' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`).textContent, ED), /^Its arm at the angle its signal's pulses ask for/);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^O seu braço/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent || ''), [ED], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

const EMU = '.doc:not([hidden]) .sys-emu';
const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
const CIRC = { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'M1', type: 'servo-sg90', x: 30, y: 30 }],
  wires: [{ id: 'g', points: [uno('GND'), [30, 30]], color: 'black' }, { id: 'v', points: [uno('5V'), [31, 30]], color: 'red' }, { id: 's', points: [uno('D9'), [32, 30]], color: 'blue' }] };
const PROG = ['ldi r16, 0x9c', 'sts 0x87, r16', 'ldi r16, 0x3f', 'sts 0x86, r16', 'ldi r16, 0x0f', 'sts 0x89, r16', 'ldi r16, 0x9f', 'sts 0x88, r16',
  'ldi r16, 0x82', 'sts 0x80, r16', 'ldi r16, 0x1a', 'sts 0x81, r16', 'ldi r16, 0x02', 'out 0x04, r16', 'end:', 'rjmp end'];
const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'emu', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/servo.hex', interfaces: [], x: 0, y: 0 },
  { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [], x: 300, y: 0 }], links: [] }, null, 2);

uiTest('#5347 Emulate System: an Arduino\'s Timer1 PWM moving a circuit node\'s servo to 135°, its arm drawn', E, async (page) => {
  await makeProject(env, { name: 'CoServo', template: 'uart', files: { 'emu.sys.json': SYS, 'src/bench.circ.json': JSON.stringify(CIRC, null, 2), 'fw/servo.hex': intelHex(avrAssemble(PROG)) } });
  const pj = await env.server.api('GET', '/api/projects/CoServo');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoServo', { ...pj, profile: 'system', board: null, constraints: null, top: null });
  await page.openProject('CoServo');
  await page.eval(() => window.SilinxApp.openFile('emu.sys.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .system-editor .sys-emu-btn'), [], { what: 'the System editor' });
  await page.click('.doc:not([hidden]) .system-editor .sys-emu-btn');
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=M1] .circ-servo-arm`), [EMU], { what: 'the circuit', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '⏸ Pause', [EMU], { what: 'running once ready (#5619)', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=M1] .circ-servo-arm`)?.dataset.angle === '135', [EMU], { what: 'the arm at 135°', timeout: 60000 });
  await page.click(`${EMU} .sysemu-run`);
  const s = await page.eval(() => window.SilinxApp.findDoc('sysemu:emu.sys.json').emulator.state());
  assert.deepEqual([s.boards.bench.servos.M1.target, s.warnings, s.errors], [135, [], []]);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

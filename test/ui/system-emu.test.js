// UI (#5212): the System Emulator. A co-design project (the uart example's module on its Basys2, its UCF's pins; a
// serial terminal; an Arduino Uno lighting its LED L): its System editor's Emulate opens the System's boards side by
// side in a document of their own (the Basys2 as the Board Emulator draws it, the Uno Silinx's own); Run: the
// terminal's line reaches the FPGA (its LEDs the last byte), BTN0 clicked on the drawn board sends the FPGA's message to
// the terminal, the Uno's LED L lit and its D13 high; Pause and the console's lines. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { avrAssemble, intelHex } from '../avr-asm.mjs';
import { ROOT } from '../examples-lib.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const EMU = '.doc:not([hidden]) .sys-emu';
const UCF = fs.readFileSync(path.join(ROOT, 'examples/uart/constraints/top.ucf'), 'utf8');
const PINS = Object.fromEntries([...UCF.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'emu', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: PINS, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/l.hex', interfaces: [], x: 0, y: 200 },
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }] }, null, 2);
const BLINK = ['ldi r16, 0x20', 'out 0x04, r16', 'out 0x05, r16', 'loop:', 'rjmp loop'];
const emu = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:emu.sys.json')?.emulator?.state() ?? null);

uiTest('#5212 Emulate: the System\'s boards side by side, the terminal\'s line on the FPGA\'s LEDs, BTN0 clicked sends its message, the Uno\'s LED L; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoEmu', template: 'uart', files: { 'emu.sys.json': SYS, 'fw/l.hex': intelHex(avrAssemble(BLINK)) } });
  const pj = await env.server.api('GET', '/api/projects/CoEmu');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoEmu', { ...pj, kind: 'codesign', board: null, constraints: null, top: null });
  await page.openProject('CoEmu');
  await page.eval(() => window.SilinxApp.openFile('emu.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-emu-btn`).textContent.trim(), ED), 'Emulate');
  await page.click(`${ED} .sys-emu-btn`);
  // its document: the Basys2 drawn as the Board Emulator's, the Uno's pins, the terminal
  await page.waitFor((e) => document.querySelector(`${e} [data-node=fpga] .emu-pcb`) && document.querySelector(`${e} [data-node=uno] .sys-pin`) && document.querySelector(`${e} .sys-term-in`), [EMU], { what: 'the boards', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.active.id), 'sysemu:emu.sys.json');
  assert.deepEqual(await page.eval((e) => [document.querySelectorAll(`${e} [data-node=fpga] .emu-led`).length, document.querySelectorAll(`${e} [data-node=uno] .sys-pin`).length], EMU), [8, 20]);
  await page.click(`${EMU} .sysemu-run`);
  await page.click(`${EMU} .sys-term-in`);
  await page.type('A');
  await page.key('Enter');
  // (the line and its end sent: the LEDs the last byte, LF, 0x0A; the terminal A and LF echoed)
  await page.waitFor(() => { const s = window.SilinxApp.findDoc('sysemu:emu.sys.json').emulator.state(); return s?.boards.fpga?.leds.join() === '0,1,0,1,0,0,0,0'; }, [], { what: 'LF on the LEDs', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} .sys-term-out`)?.textContent === 'A\n', [EMU], { what: 'the echo' });
  // BTN0 clicked on the drawn board: held down until the design saw a real press, its message in the terminal
  await page.eval((e) => { const b = [...document.querySelectorAll(`${e} [data-node=fpga] .emu-btn`)].find((x) => /^BTN0:/.test(x.title)); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }, EMU);
  await page.waitFor((e) => /Hello from Silinx!/.test(document.querySelector(`${e} .sys-term-out`)?.textContent || ''), [EMU], { what: 'the FPGA\'s message', timeout: 60000 });
  const s = await emu(page);
  assert.ok(s.boards.uno.led > 0.9, `the LED L: ${s.boards.uno.led}`);
  assert.equal(await page.eval((e) => document.querySelector(`${e} [data-node=uno] .sys-pin[data-pin=D13]`).classList.contains('high'), EMU), true);
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  await page.click(`${EMU} .sysemu-run`);
  await page.waitFor(() => !window.SilinxApp.findDoc('sysemu:emu.sys.json').emulator.state().running, [], { what: 'paused' });
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()));
  assert.ok(lines.includes('Emulate System: fpga, term, uno ready, 2 board(s).'), lines.join('\n'));
  assert.ok(lines.some((l) => /^Emulate System: paused at \d/.test(l)), lines.join('\n'));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '▶ Executar' && document.querySelector(`${e} .sysemu-restart`)?.textContent === 'Reiniciar', [EMU], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((e) => [document.querySelector(`${e} .asm-side .asm-cap`).textContent.replace(/\s+$/, ''), [...document.querySelectorAll('.tlabel')].map((t) => t.textContent).find((t) => /^Emul/.test(t))], EMU), ['Terminais', 'Emular (emu)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

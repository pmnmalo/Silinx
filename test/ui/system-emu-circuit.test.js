// UI (#5322): a circuit node in the System Emulator. A System project (the uart example's module on its Basys2, its
// btn on JB1 and its led<0> on JB3; a serial terminal; a circuit, the Basys2's JB1 driven by a logic switch S1, its JB3
// lighting the LED D2): Emulate draws the circuit beside the board as the Circuit editor draws it; Run: S1 clicked in
// it presses the FPGA's button (its message in the terminal), the LED D2 lit as LD0; the console's lines, no warnings.
// Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const EMU = '.doc:not([hidden]) .sys-emu';
const BENCH = { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl',
  parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'S1', type: 'logic-switch', x: 8, y: 25 }, { id: 'D2', type: 'led', x: 12, y: 26, color: 'green' }],
  wires: [{ id: 'w1', points: [[8, 25], [9, 30]], color: 'blue' }, { id: 'w5', points: [[11, 30], [12, 26]], color: 'blue' }, { id: 'w6', points: [[13, 26], [4, 30]], color: 'black' }] };
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'emu', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { clk: 'B8', rx: 'J3', tx: 'A3', 'btn<0>': 'C6', 'led<0>': 'C5' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [], x: 300, y: 200 },
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }] }, null, 2);
const emu = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:emu.sys.json')?.emulator?.state() ?? null);

uiTest('#5322 Emulate: a circuit node drawn beside the board, its switch clicked presses the FPGA\'s button, its LED lit as LD0; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoEmuCirc', template: 'uart', files: { 'emu.sys.json': SYS, 'src/bench.circ.json': JSON.stringify(BENCH, null, 2) } });
  const pj = await env.server.api('GET', '/api/projects/CoEmuCirc');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoEmuCirc', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('CoEmuCirc');
  await page.eval(() => window.SilinxApp.openFile('emu.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-emu-btn`);
  // the circuit drawn: the Basys2's Pmods, the switch, the LED (dark)
  await page.waitFor((e) => document.querySelector(`${e} [data-node=fpga] .emu-pcb`) && document.querySelector(`${e} [data-node=bench] .sys-emu-circ [data-id=S1]`), [EMU], { what: 'the boards', timeout: 60000 });
  assert.deepEqual(await page.eval((e) => { const c = document.querySelector(`${e} [data-node=bench]`); return [c.querySelector('.sys-emu-cap').textContent, c.classList.contains('circuit-editor'), [...c.querySelectorAll('[data-kind=part]')].map((g) => g.dataset.id), !!c.querySelector('[data-id=D2] .circ-led.lit')]; }, EMU),
    ['bench', true, ['F1', 'S1', 'D2'], false]);
  await page.click(`${EMU} .sysemu-run`);
  await page.click(`${EMU} .sys-term-in`);
  await page.type('A');
  await page.key('Enter');
  await page.waitFor((e) => document.querySelector(`${e} .sys-term-out`)?.textContent === 'A\n', [EMU], { what: 'the echo', timeout: 60000 });
  // S1 clicked: on, the FPGA's button held, its message
  await page.eval((e) => document.querySelector(`${e} [data-node=bench] [data-id=S1] [data-input], ${e} [data-node=bench] [data-id=S1][data-input]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), EMU);
  await page.waitFor((e) => /Hello from Silinx!/.test(document.querySelector(`${e} .sys-term-out`)?.textContent || ''), [EMU], { what: 'the FPGA\'s message', timeout: 60000 });
  const s = await emu(page);
  assert.equal(s.boards.bench.inputs.S1, true);
  // (D2 as LD0: the last byte's bit 0, drawn so)
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=S1] .circ-sw-knob.on`), [EMU], { what: 'S1 drawn on' });
  const lit = await page.eval((e) => !!document.querySelector(`${e} [data-node=bench] [data-id=D2] .circ-led.lit`), EMU);
  assert.equal(lit, (await emu(page)).boards.bench.leds.D2 === 'on');
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  await page.click(`${EMU} .sysemu-run`);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()));
  assert.ok(lines.includes('Emulate System: fpga, term, bench ready, 2 board(s).'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  // in Portuguese: the emulator's labels, the circuit's ids as they are
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '▶ Executar', [EMU], { what: 'Portuguese' });
  assert.equal(await page.eval((e) => document.querySelector(`${e} [data-node=bench] .sys-emu-cap`).textContent, EMU), 'bench');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

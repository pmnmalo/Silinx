// UI (#5336): the graphic OLED 128×64 (SSD1306, I²C). A co-design System: an Arduino Uno and a circuit node (the Uno,
// labelled uno, the OLED on its A5 and A4, a pull-up on each line), the Uno's firmware writing to the OLED over its TWI;
// Emulate: the circuit drawn, the OLED's pixels lit as the Uno writes them, no warnings. The circuit in the Circuit
// editor: the OLED's row in the Parts panel's Outputs, drawn dark (not simulated), its Part info; Check with no warnings;
// Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { PARTS } from '../../core/circuit-parts.js';
import { avrAssemble, intelHex } from '../avr-asm.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const EMU = '.doc:not([hidden]) .sys-emu';
const CED = '.doc:not([hidden]) .circuit-editor';
const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
const CIRC = { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl',
  parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'OLED1', type: 'oled-ssd1306', x: 30, y: 25 },
    { id: 'R1', type: 'pull-up', x: 36, y: 22 }, { id: 'R2', type: 'pull-up', x: 38, y: 22 }],
  wires: [{ id: 'c', points: [uno('A5'), [32, 25]], color: 'yellow' }, { id: 'd', points: [uno('A4'), [33, 25]], color: 'green' }, { id: 'v', points: [uno('5V'), [31, 25]], color: 'red' },
    { id: 'g', points: [uno('GND'), [30, 25]], color: 'black' }, { id: 'wr1', points: [[36, 22], [32, 25]], color: 'red' }, { id: 'wr2', points: [[38, 22], [33, 25]], color: 'red' }] };
// the Uno: its TWI at 100 kHz writing the OLED's init (charge pump, display on, A1, C8, horizontal mode), then 0xFF, 0x81,
// 0x3C (14 pixels at the top left); each byte written and TWINT waited for
const send = (bytes) => ['ldi r16, 0xa4', 'rcall go', ...bytes.flatMap((b) => [`ldi r16, ${b}`, 'sts 0xbb, r16', 'ldi r16, 0x84', 'rcall go']), 'ldi r16, 0x94', 'sts 0xbc, r16', 'rcall pause'];
const PROG = ['ldi r16, 72', 'sts 0xb8, r16', ...send([0x78, 0x00, 0x8d, 0x14, 0xaf, 0xa1, 0xc8, 0x20, 0x00]), ...send([0x78, 0x40, 0xff, 0x81, 0x3c]), 'end:', 'rjmp end',
  'go:', 'sts 0xbc, r16', 'wait:', 'lds r18, 0xbc', 'sbrs r18, 7', 'rjmp wait', 'ret', 'pause:', 'ldi r22, 250', 'p1:', 'dec r22', 'brne p1', 'ret'];
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'oled', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/oled.hex', interfaces: [], x: 0, y: 0 },
  { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [], x: 300, y: 0 }], links: [] }, null, 2);

uiTest('#5336 a graphic OLED: an Arduino writing to it over I²C in Emulate, its pixels lit; its row, Part info, Check; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoOled', template: 'uart', files: { 'oled.sys.json': SYS, 'src/bench.circ.json': JSON.stringify(CIRC, null, 2), 'fw/oled.hex': intelHex(avrAssemble(PROG)) } });
  const pj = await env.server.api('GET', '/api/projects/CoOled');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoOled', { ...pj, kind: 'codesign', board: null, constraints: null, top: null });
  await page.setViewport(1440, 900);
  await page.openProject('CoOled');
  await page.eval(() => window.SilinxApp.openFile('oled.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-emu-btn`);
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] .sys-emu-circ [data-id=OLED1] .circ-oled-glass`), [EMU], { what: 'the circuit drawn', timeout: 60000 });
  assert.equal(await page.eval((e) => !!document.querySelector(`${e} [data-node=bench] .circ-oled-px`), EMU), false, 'dark before the run');
  await page.click(`${EMU} .sysemu-run`);
  await page.waitFor((e) => document.querySelector(`${e} [data-node=bench] [data-id=OLED1] .circ-oled-px`), [EMU], { what: 'its pixels lit', timeout: 60000 });
  const s = await page.eval(() => window.SilinxApp.findDoc('sysemu:oled.sys.json').emulator.state());
  assert.deepEqual([s.boards.bench.oleds.OLED1.on, s.boards.bench.oleds.OLED1.lit], [true, 14]);
  // (its path, a run of lit pixels each: rows 0 and 7 one run of 2, rows 1 and 6 one pixel, rows 2..5 two runs)
  assert.equal(await page.eval((e) => (document.querySelector(`${e} [data-node=bench] [data-id=OLED1] .circ-oled-px`).getAttribute('d').match(/M/g) || []).length, EMU), 12);
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  await page.click(`${EMU} .sysemu-run`);
  // the circuit in its editor: its row, dark, its Part info; Check
  await page.eval(() => window.SilinxApp.openFile('src/bench.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=OLED1] .circ-oled-body`), [CED], { what: 'the circuit editor' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="oled-ssd1306"]`)?.dataset.group, CED), 'Outputs');
  assert.equal(await page.eval((ed) => !!document.querySelector(`${ed} .circ-canvas [data-id=OLED1] .circ-oled-px`), CED), false);
  await page.click(`${CED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'OLED1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [CED], { what: 'OLED1 selected' });
  const about = () => page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`).textContent, CED);
  assert.match(await about(), /^128 × 64 pixels, its SSD1306 controller simulated on I²C at 0x3C/);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^128 × 64 píxeis/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent || ''), [CED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection h3`).textContent, CED), 'OLED1: OLED gráfico 128×64 (SSD1306, I²C)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

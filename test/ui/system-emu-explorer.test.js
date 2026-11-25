// UI (#5484): the System Emulator's Explorer 16/32. A System project with a PIC24 node (its firmware made by the tests'
// assembler: the LCD's two rows written, then S3 lighting D3, RD13 to RA1, RD8's inverse on RA2): its System editor's
// Emulate draws the board as Silinx's own (its LCD, its LEDs D3 to D10, its buttons S3 to S6, R6, the TC1047A); Run:
// the LCD shows its rows, D4 and D5 lit, S3 held down lights D3, let go turns it off; R6's slider and the temperature
// set on the board's model; no warnings. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { explorerHex } from '../pic24-node-lib.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const EMU = '.doc:not([hidden]) .sys-emu';
const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'pic', nodes: [
  { id: 'pic', kind: 'mcu', board: 'explorer-1632', firmware: 'pic/explorer.hex', interfaces: [], x: 0, y: 0 }], links: [] }, null, 2);
const state = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:pic.sys.json')?.emulator?.state() ?? null);
const press = (page, part, type) => page.eval((e, p, t) => document.querySelector(`${e} [data-node=pic] .sys-exp-btn[data-part=${p}]`).dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1 })), EMU, part, type);
const pointerUp = (page) => page.eval(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })));

uiTest('#5484 Emulate: the Explorer 16/32 drawn, its LCD\'s rows, S3 held lights D3, R6 and the temperature set; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PicEmu', template: 'uart', files: { 'pic.sys.json': SYS, 'pic/explorer.hex': explorerHex() } });
  const pj = await env.server.api('GET', '/api/projects/PicEmu');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/PicEmu', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('PicEmu');
  await page.eval(() => window.SilinxApp.openFile('pic.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-emu-btn`);
  await page.waitFor((e) => document.querySelector(`${e} [data-node=pic] .emu-pcb`), [EMU], { what: 'the board', timeout: 60000 });
  // its parts: 8 LEDs, 4 buttons (S3 S6 S5 S4, as on the board), R6's slider, the temperature, the LCD's two rows
  const parts = await page.eval((e) => {
    const b = document.querySelector(`${e} [data-node=pic]`);
    return { leds: [...b.querySelectorAll('.sys-exp-led')].map((l) => [l.dataset.part, l.title]), buttons: [...b.querySelectorAll('.sys-exp-btn')].map((x) => [x.dataset.part, x.title]),
      pot: [b.querySelector('.sys-exp-pot').value, b.querySelector('.sys-exp-pot').title], temp: [b.querySelector('.sys-exp-temp').value, b.querySelector('.sys-exp-temp').title],
      rows: b.querySelectorAll('.sys-exp-lcd-row').length, note: b.querySelector('.emu-board-note').textContent };
  }, EMU);
  assert.deepEqual(parts.leds, [['D3', 'LED D3 (RA0)'], ['D4', 'LED D4 (RA1)'], ['D5', 'LED D5 (RA2)'], ['D6', 'LED D6 (RA3)'], ['D7', 'LED D7 (RA4)'], ['D8', 'LED D8 (RA5)'], ['D9', 'LED D9 (RA6)'], ['D10', 'LED D10 (RA7)']]);
  assert.deepEqual(parts.buttons, [['S3', 'Button S3 (RD6)'], ['S6', 'Button S6 (RD7)'], ['S5', 'Button S5 (RA7)'], ['S4', 'Button S4 (RD13)']]);
  assert.deepEqual([parts.pot, parts.temp, parts.rows, parts.note], [['50', 'Potentiometer R6 (AN5): 0 to 3.3 V'], ['25', 'Temperature sensor TC1047A (AN4), °C'], 2, 'Explorer 16/32 — pic · PIC24FJ1024GB610, its 8 MHz crystal']);
  // Run: the LCD's rows; D4 (RD13 pulled up by S4) and D5 (RD8 floating, read 0) lit
  await page.click(`${EMU} .sysemu-run`);
  await page.waitFor((e) => [...document.querySelectorAll(`${e} [data-node=pic] .sys-exp-lcd-row`)].map((r) => r.textContent).join('|') === 'Silinx PIC24    |Explorer 16/32  ', [EMU], { what: 'the LCD\'s rows', timeout: 60000 });
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b && b.leds.D4 > 0.9 && b.leds.D5 > 0.9 && b.leds.D3 < 0.1; }, [], { what: 'D4 and D5 lit', timeout: 30000 });
  // S3 held down: D3 lit, the button drawn down; let go: off
  await press(page, 'S3', 'pointerdown');
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b?.held.S3 && b.leds.D3 > 0.9; }, [], { what: 'S3 lighting D3', timeout: 30000 });
  assert.equal(await page.eval((e) => document.querySelector(`${e} [data-node=pic] .sys-exp-btn[data-part=S3]`).classList.contains('on'), EMU), true);
  if (process.env.SILINX_SHOT) await page.screenshot(process.env.SILINX_SHOT);
  await pointerUp(page);
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b && !b.held.S3 && b.leds.D3 < 0.1; }, [], { what: 'D3 off', timeout: 30000 });
  // R6's slider and the temperature: on the board's model
  await page.eval((e) => { const p = document.querySelector(`${e} [data-node=pic] .sys-exp-pot`); p.value = '20'; p.dispatchEvent(new Event('input', { bubbles: true })); const t = document.querySelector(`${e} [data-node=pic] .sys-exp-temp`); t.value = '40'; t.dispatchEvent(new Event('change', { bubbles: true })); }, EMU);
  await page.waitFor(() => { const a = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic.analog; return a?.R6 === 0.2 && a.TC1047A === 40; }, [], { what: 'R6 and the temperature', timeout: 30000 });
  const s = await state(page);
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  await page.click(`${EMU} .sysemu-run`);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()));
  assert.ok(lines.includes('Emulate System: pic ready, 1 board(s).'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((e) => document.querySelector(`${e} [data-node=pic] .sys-exp-pot`)?.title.startsWith('Potenciómetro'), [EMU], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((e) => { const b = document.querySelector(`${e} [data-node=pic]`); return [b.querySelector('.sys-exp-led').title, b.querySelector('.sys-exp-btn').title, b.querySelector('.sys-exp-pot').title, b.querySelector('.sys-exp-temp').title, b.querySelector('.sys-exp-lcd').title, b.querySelector('.emu-board-note').textContent]; }, EMU),
    ['LED D3 (RA0)', 'Botão S3 (RD6)', 'Potenciómetro R6 (AN5): 0 a 3,3 V', 'Sensor de temperatura TC1047A (AN4), °C', 'LCD 16x2 (o PMP: PMD0-7 RE0-RE7, RS RB15, E RD4)', 'Explorer 16/32 — pic · PIC24FJ1024GB610, o seu cristal de 8 MHz']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

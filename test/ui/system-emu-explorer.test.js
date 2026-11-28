// UI (#5484): the System Emulator's Explorer 16/32. A System project with a PIC24 node (its firmware made by the tests'
// assembler: the LCD's two rows written, then S3 lighting D3, RD13 to RA1, RD8's inverse on RA2): its System editor's
// Emulate draws the board as Silinx's own (its LCD, its LEDs D3 to D10, its buttons S3 to S6, R6, the TC1047A); Run:
// the LCD shows its rows, D4 and D5 lit, S3 held down lights D3, let go turns it off; R6's slider and the temperature
// set on the board's model; no warnings. Portuguese; both interfaces. The uart-fpga-pic24 example emulated: the PIC24's hello
// echoed by the FPGA on the LCD, then BTN0's message; the LEDs the last byte.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { explorerHex, buttonsHex } from '../pic24-node-lib.mjs';

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

uiTest('#5484 Emulate: the Explorer 16/32 drawn, its LCD\'s rows, S3 held lights D3, R6 and the temperature set; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PicEmu', template: 'uart', files: { 'pic.sys.json': SYS, 'pic/explorer.hex': explorerHex() } });
  const pj = await env.server.api('GET', '/api/projects/PicEmu');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/PicEmu', { ...pj, profile: 'system', board: null, constraints: null, top: null });
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
  // (its colours the stylesheet's, #5575: the board's own, the same in the light and the dark theme; the real board's
  // green solder mask, its LCD's grey glass in a blue frame, its white silkscreen, #5579)
  const colours = () => page.eval((e) => { const s = document.querySelector(`${e} [data-node=pic] .emu-pcb-art`), r = (v) => s.querySelector(`rect[fill="var(--exp-${v})"]`), t = [...s.querySelectorAll('text')].find((x) => x.textContent === 'EXPLORER 16/32');
    return [r('pcb'), r('lcd'), r('lcd-frame'), t].map((x) => getComputedStyle(x).fill); }, EMU);
  const BOARD = ['rgb(42, 122, 63)', 'rgb(198, 205, 189)', 'rgb(38, 49, 92)', 'rgb(242, 245, 239)'];   // (its PCB, its LCD's glass and frame, its silkscreen)
  for (const theme of ['light', 'dark']) {
    await page.eval(async (x) => (await import('/js/silinx.js')).setTheme(x), theme);
    assert.equal(await page.eval(() => document.documentElement.dataset.theme), theme);
    assert.deepEqual(await colours(), BOARD, theme);
  }
  await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
  // Run: the LCD's rows; D4 (RD13 pulled up by S4) and D5 (RD8 floating, read 0) lit
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '⏸ Pause', [EMU], { what: 'running once ready (#5619)', timeout: 60000 });
  await page.waitFor((e) => [...document.querySelectorAll(`${e} [data-node=pic] .sys-exp-lcd-row`)].map((r) => r.textContent).join('|') === 'Silinx PIC24    |Explorer 16/32  ', [EMU], { what: 'the LCD\'s rows', timeout: 60000 });
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b && b.leds.D4 > 0.9 && b.leds.D5 > 0.9 && b.leds.D3 < 0.1; }, [], { what: 'D4 and D5 lit', timeout: 30000 });
  // S3 held down: D3 lit, the button drawn down; let go: off
  await press(page, 'S3', 'pointerdown');
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b?.held.S3 && b.leds.D3 > 0.9; }, [], { what: 'S3 lighting D3', timeout: 30000 });
  assert.equal(await page.eval((e) => document.querySelector(`${e} [data-node=pic] .sys-exp-btn[data-part=S3]`).classList.contains('on'), EMU), true);
  if (process.env.SILINX_SHOT) await page.screenshot(process.env.SILINX_SHOT);
  await press(page, 'S3', 'pointerup');
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

uiTest('#5484 the uart-fpga-pic24 example emulated: the PIC24\'s hello echoed by the FPGA on its LCD, BTN0\'s message there next; its LEDs the last byte', E, async (page) => {
  await makeProject(env, { name: 'UartPic', template: 'uart-fpga-pic24' });
  await page.openProject('UartPic');
  await page.eval(() => window.SilinxApp.openFile('uart_fpga_pic24.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-emu-btn`);
  await page.waitFor((e) => document.querySelector(`${e} [data-node=pic] .emu-pcb`) && document.querySelector(`${e} [data-node=fpga] .emu-pcb`), [EMU], { what: 'the boards', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '⏸ Pause', [EMU], { what: 'running once ready (#5619)', timeout: 60000 });
  await page.waitFor((e, t) => [...document.querySelectorAll(`${e} [data-node=pic] .sys-exp-lcd-row`)].map((r) => r.textContent).join('|') === t, [EMU, 'PIC24 + FPGA    |Hi from PIC24!  '], { what: 'the echo on the LCD', timeout: 60000 });
  // BTN0 on the FPGA's board: its message on the LCD's second row (its first 16 characters), LF on the LEDs (D4, D6)
  await page.eval((e) => { const b = [...document.querySelectorAll(`${e} [data-node=fpga] .emu-btn`)].find((x) => /^BTN0:/.test(x.title)); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }, EMU);
  await page.waitFor((e, t) => [...document.querySelectorAll(`${e} [data-node=pic] .sys-exp-lcd-row`)].map((r) => r.textContent).join('|') === t, [EMU, 'PIC24 + FPGA    |Hello from Silin'], { what: 'BTN0\'s message on the LCD', timeout: 60000 });
  await page.waitFor(() => { const b = window.SilinxApp.findDoc('sysemu:uart_fpga_pic24.sys.json').emulator.state()?.boards.pic; return b && Object.entries(b.leds).filter(([, v]) => v > 0.5).map(([d]) => d).join() === 'D4,D6'; }, [], { what: 'LF on the LEDs', timeout: 30000 });
  const s = await page.eval(() => window.SilinxApp.findDoc('sysemu:uart_fpga_pic24.sys.json').emulator.state());
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  await page.click(`${EMU} .sysemu-run`);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()));
  assert.ok(lines.includes('Emulate System: pic, fpga ready, 2 board(s).'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

// (#5618) each button pressed with the mouse where it is drawn (a real press: whatever is on top of it gets it), held, then
// let go: the PIC24 reads it (its firmware lights the button's LED while its pin is 0), in the light and the dark theme
uiTest('#5618 regression: the Explorer 16/32\'s buttons S3 to S6 clicked, then held and let go, with the mouse where they are drawn: the PIC24 reads each; light and dark', E, async (page) => {
  await makeProject(env, { name: 'PicBtn', template: 'uart', files: { 'pic.sys.json': SYS.replace('pic/explorer.hex', 'pic/buttons.hex'), 'pic/buttons.hex': buttonsHex() } });
  const pj = await env.server.api('GET', '/api/projects/PicBtn');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/PicBtn', { ...pj, profile: 'system', board: null, constraints: null, top: null });
  await page.openProject('PicBtn');
  await page.eval(() => window.SilinxApp.openFile('pic.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-emu-btn`);
  await page.waitFor((e) => document.querySelector(`${e} [data-node=pic] .sys-exp-btn`), [EMU], { what: 'the board', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-run`)?.textContent === '⏸ Pause', [EMU], { what: 'running once ready (#5619)', timeout: 60000 });
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.now > 20e9, [], { what: 'running', timeout: 60000 });
  const LED = { S3: 'D3', S4: 'D4', S6: 'D6', S5: 'D7' };
  // (none of them lit; D10 is S5's pin, RA7, an input here: its pull-up)
  assert.deepEqual(await page.eval((ds) => ds.filter((d) => window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state().boards.pic.leds[d] > 0.5), Object.values(LED)), [], 'no button\'s LED lit');
  for (const theme of ['light', 'dark']) {
    await page.eval(async (x) => (await import('/js/silinx.js')).setTheme(x), theme);
    for (const [s, d] of Object.entries(LED)) {
      // (its centre, and what the page has there: the button itself)
      const at = await page.eval((e, p) => { const r = document.querySelector(`${e} [data-node=pic] .sys-exp-btn[data-part=${p}]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, EMU, s);
      assert.equal(await page.eval((x, y) => document.elementFromPoint(x, y)?.closest('.sys-exp-btn')?.dataset.part ?? null, at.x, at.y), s, `${theme}: ${s} on top at its place`);
      await page.mouse('mouseMoved', at.x, at.y);
      // a click (pressed and let go at once): held down until the PIC24 had it, its LED lit a while, then off (on the old
      // code both reached the worker before its next run: the PIC24 never saw it, #5618); its LED sampled every 5 ms
      await page.eval((x) => { window.__lit = 0; window.__sample = setInterval(() => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; window.__lit = Math.max(window.__lit, b?.leds[x] ?? 0); }, 5); }, d);
      await page.mouse('mousePressed', at.x, at.y);
      await page.mouse('mouseReleased', at.x, at.y);
      await page.waitFor(() => window.__lit > 0.5, [], { what: `${theme}: ${s} clicked, ${d} lit`, timeout: 10000 });
      await page.waitFor((x) => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b && !b.held[x[0]] && b.leds[x[1]] < 0.1; }, [[s, d]], { what: `${theme}: ${s} clicked, ${d} off again`, timeout: 30000 });
      await page.eval(() => clearInterval(window.__sample));
      // held down, then let go
      await page.mouse('mousePressed', at.x, at.y);
      await page.waitFor((x) => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b?.held[x[0]] && b.leds[x[1]] > 0.9; }, [[s, d]], { what: `${theme}: ${s} held, ${d} lit`, timeout: 30000 });
      assert.equal(await page.eval((e, p) => document.querySelector(`${e} [data-node=pic] .sys-exp-btn[data-part=${p}]`).classList.contains('on'), EMU, s), true, `${s} drawn down`);
      // (#5880: S5 holds RA7, D10's pin too, at 0: D10 off, drawn as D9, an LED off; lit again by RA7's pull-up once let go)
      if (s === 'S5') await page.waitFor((e) => { const l = (p) => getComputedStyle(document.querySelector(`${e} [data-node=pic] .sys-exp-led[data-part=${p}]`)).backgroundColor; return window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state().boards.pic.leds.D10 === 0 && l('D10') === l('D9'); }, [EMU], { what: `${theme}: S5 held, D10 off and drawn as D9`, timeout: 10000 });
      await page.mouse('mouseReleased', at.x, at.y);
      if (s === 'S5') await page.waitFor(() => window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic.leds.D10 === 1, [], { what: `${theme}: S5 let go, D10 lit by the pull-up`, timeout: 30000 });
      await page.waitFor((x) => { const b = window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state()?.boards.pic; return b && !b.held[x[0]] && b.leds[x[1]] < 0.1; }, [[s, d]], { what: `${theme}: ${s} let go, ${d} off`, timeout: 30000 });
    }
  }
  await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
  const st = await page.eval(() => window.SilinxApp.findDoc('sysemu:pic.sys.json').emulator.state());
  assert.deepEqual([st.warnings, st.errors], [[], []]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

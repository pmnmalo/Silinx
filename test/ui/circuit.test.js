// UI: the digital circuit editor (web/js/circuit-editor.js, #3897, #3898): a half adder on its breadboard opened, its
// Design row ([Circuit] [VHDL]), its status line; a 7404 placed from the parts library and undone (Edit ▸ Undo); a wire
// drawn between two holes; Try it: a click on a switch lights an LED after the gates' delays; Check in the console; its
// HDL file made on save; in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// a grid point's place on the screen (the drawing's transform)
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);
const status = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .doc-status .ds-f`)].map((f) => f.textContent), ED);

uiTest('Circuit editor: the half adder opened, a part placed and undone, a wire drawn, simulated live, checked, its HDL; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircPj', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircPj');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'circ:src/half_adder.circ.json' && document.querySelector(ed), [ED], { what: 'the circuit editor' });
  await page.waitFor((ed) => /15 wire/.test(document.querySelector(`${ed} .doc-status`)?.textContent), [ED], { what: 'its counts' });
  assert.deepEqual(await status(page), ['2 IC(s) · 2 switch(es) · 2 LED(s) · 15 wire(s)']);
  // its Design row: the circuit's badge first, its HDL's last (made with it, as every drawing's)
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'half_adder'), [], { what: 'half_adder in the hierarchy' });
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#hier li')].find((li) => li.querySelector(':scope > .row .lbl')?.textContent === 'half_adder').querySelector(':scope > .row').querySelectorAll('.badge')].map((b) => b.textContent)), ['Circuit', 'VHDL']);
  assert.match(await page.consoleText(), /src\/half_adder\.vhd generated from src\/half_adder\.circ\.json/);
  // a 7404 from the library, placed by a click on the canvas; Edit ▸ Undo takes it away
  await page.click(`${ED} .circ-lib-part[data-part="7404"]`);
  const free = await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height - 30 }; }, ED);
  await page.click(free);
  await page.waitFor((ed) => /^3 IC/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'a 7404 placed' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection h3`).textContent, ED), 'U3: Hex inverter');
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .circ-pinout`).textContent, ED), /^SN74LS04: pinout1A114VCC1Y2136A2A3126Y[^]*GND784Y$/);
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /^2 IC/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'undone' });
  // a wire from hole a3 to hole a8: ended on the hole
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  await page.click(await at(page, 2, 0));
  await page.click(await at(page, 7, 0));
  await page.waitFor((ed) => /16 wire/.test(document.querySelector(`${ed} .doc-status`).textContent), [ED], { what: 'a wire drawn' });
  await page.click(`${ED} [data-act=select]`);
  // Try it: S1 (a) on, the XOR's LED (s) lights; the time in the status line
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed}.circ-simulating`) || document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'simulating' });
  assert.deepEqual(await status(page), ['2 IC(s) · 2 switch(es) · 2 LED(s) · 16 wire(s)', 't = 12 ns']);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-led.lit`).length, ED), 0);
  const sw = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=S1] .circ-sw-body`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click(sw);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-led.lit`).length === 1, [ED], { what: 'the LED s lit' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-led.lit`).closest('[data-id]').dataset.id, ED), 'D1');
  assert.deepEqual(await status(page), ['2 IC(s) · 2 switch(es) · 2 LED(s) · 16 wire(s)', 't = 24 ns']);
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // Check: in the console (the wire drawn reaches the XOR's 4Y on a8: its gate used, its inputs 4A and 4B floating)
  await page.click(`${ED} .circ-check`);
  await page.waitConsole(/Process "Check Circuit" completed/);
  assert.match(await page.consoleText(), /Started : "Check Circuit" of half_adder\.circ\.json\.\n\nWARNING: U1 pin 12 \(4A\) is floating: a 74LS input reads high\nWARNING: U1 pin 13 \(4B\) is floating: a 74LS input reads high\n\nProcess "Check Circuit" completed successfully with 2 warning\(s\)/);
  // saved: its HDL file made again
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(async () => !window.Silinx.active?.dirty, [], { what: 'saved' });
  assert.match(await readWs(env, 'CircPj', 'src/half_adder.vhd'), /^entity half_adder is$/m);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-tool`)].some((b) => b.textContent.trim() === 'Fio'), [ED], { what: 'the toolbar in Portuguese' });
  assert.deepEqual(await status(page), ['2 CI(s) · 2 interruptor(es) · 2 LED(s) · 16 fio(s)']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-parts h3, ${ed} .circ-lib-title`)].map((e) => e.textContent), ED),
    ['Peças', 'Placas de ensaio', 'Alimentação', 'Entradas', 'Saídas', 'Portas (74LS)']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-sim-btn`).textContent.trim(), ED), 'Experimentar');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-sim-btn`).title, ED), 'Experimentar: clique num interruptor para o mudar, carregue num botão para o manter premido; os LEDs e o nível de cada pino mostram o circuito a funcionar');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7400"]`).textContent, ED), '7400 Quatro portas NAND de 2 entradas');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 120000 });

uiTest('Circuit editor: New Source ▸ Circuit makes one with its breadboard and supply, opened; a button held while pressed', E, async (page) => {
  await makeProject(env, { name: 'CircNew', top: '' });
  await page.setViewport(1440, 900);
  await page.openProject('CircNew');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Circuit');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'blinker');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'circ:src/blinker.circ.json' && document.querySelector(ed), [ED], { what: 'the new circuit opened' });
  assert.deepEqual(await status(page), ['0 IC(s) · 0 switch(es) · 0 LED(s) · 2 wire(s)']);
  const m = JSON.parse(await readWs(env, 'CircNew', 'src/blinker.circ.json'));
  assert.deepEqual(m.parts.map((p) => p.type), ['breadboard-half', 'supply']);
  // a button from the + rail to an LED's anode, its cathode on the − rail: lit while pressed
  await page.click(`${ED} .circ-lib-part[data-part="button"]`);
  await page.click(await at(page, 2, 0));
  await page.click(`${ED} .circ-lib-part[data-part="led"]`);
  await page.click(await at(page, 5, 2));
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  await page.click(await at(page, 2, 1)); await page.click(await at(page, 2, -4));
  await page.click(await at(page, 5, 1)); await page.click(await at(page, 5, 4));
  await page.click(await at(page, 6, 1)); await page.click(await at(page, 6, -3));
  await page.waitFor((ed) => /5 wire/.test(document.querySelector(`${ed} .doc-status`).textContent), [ED], { what: 'three wires drawn' });
  await page.click(`${ED} [data-act=select]`);
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'simulating' });
  const b = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=B1] .circ-btn-cap`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.mouse('mouseMoved', b.x, b.y); await page.mouse('mousePressed', b.x, b.y);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-led.lit`).length === 1, [ED], { what: 'lit while pressed' });
  await page.mouse('mouseReleased', b.x, b.y);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-led.lit`).length === 0, [ED], { what: 'off once released' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 120000 });

uiTest('Circuit editor: its Properties fold to a strip and expand, remembered; on a narrow window over the canvas behind ☰ Properties', E, async (page) => {
  await makeProject(env, { name: 'CircFold', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircFold');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the circuit editor' });
  const folded = () => page.eval((ed) => document.querySelector(ed).classList.contains('props-folded'), ED);
  assert.equal(await folded(), false);
  await page.click(`${ED} .asm-side .asm-fold`);
  assert.equal(await folded(), true);
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'opened again' });
  assert.equal(await folded(), true, 'remembered');
  await page.click(`${ED} .asm-side`);
  assert.equal(await folded(), false, 'expanded by a click on the strip');
  // narrow: the panel over the canvas, closed, shown and hidden by ☰ Properties
  await page.setViewport(800, 900);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false));
  const btn = `${ED} .circ-toolbar .narrow-only`;
  await page.waitFor((b) => document.querySelector(b)?.getClientRects().length > 0, [btn], { what: 'the ☰ button' });
  const shown = () => page.eval((s) => document.querySelector(s).classList.contains('side-open') && document.querySelector(`${s} .asm-side`).getClientRects().length > 0, ED);
  assert.equal(await shown(), false);
  await page.click(btn);
  assert.equal(await shown(), true);
  await page.click(btn);
  assert.equal(await shown(), false);
  await page.setViewport(1440, 900);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

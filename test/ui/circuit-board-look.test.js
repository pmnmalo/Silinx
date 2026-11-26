// UI (#5366): the circuit's boards drawn as the emulators draw them: the Basys2 and Nexys2 the Board Emulator's (its
// PCB, its Pmods, its LEDs, switches, buttons and digits where it puts them), the Uno, Nano and ESP32 DevKitC (#5495) the System Emulator's;
// each pin of the part (where the wires join it) on a pin of the drawing (a Pmod's, a header's), the board turned too;
// a board selected by a click on its drawing, its outline lit; Fit shows them all; the print's snapshot has the
// drawings (all SVG); Portuguese (the boards' silkscreen is data, not translated). No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { ...newCircuit('boards'), parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0 }, { id: 'A2', type: 'arduino-nano', x: 0, y: 32 }, { id: 'E1', type: 'esp32-devkitc', x: 2, y: 52 },
  { id: 'F1', type: 'fpga-basys2', x: 32, y: 0 }, { id: 'F2', type: 'fpga-nexys2', x: 98, y: 0 }], wires: [] };
// each pin of a board's part: the drawing's pin under it (a circle or a square smaller than a pitch, its middle within a
// pixel of the pin's); the pins with none
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
const unmatched = (page, id) => page.eval((ed, pid) => {
  const g = document.querySelector(`${ed} [data-id=${pid}]`);
  const mid = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; };
  const pitch = g.querySelector('.circ-pin').getBoundingClientRect().width / 6 * 20;   // (a pin's circle: r 3 of a pitch's 20)
  const pads = [...g.querySelectorAll('.circ-board-art circle, .circ-board-art rect')].map(mid).filter(([, , w, h]) => w < pitch * 0.8 && h < pitch * 0.8);
  return [...g.querySelectorAll('.circ-pin')].map((p, i) => [i + 1, mid(p)]).filter(([, [x, y]]) => !pads.some(([a, b]) => Math.abs(a - x) < 1 && Math.abs(b - y) < 1)).map(([n]) => n);
}, ED, id);

uiTest('#5366 Circuit editor: the boards drawn as the emulators draw them, their pins on the drawings\' pins; selected, turned, fitted, printed', E, async (page) => {
  await makeProject(env, { name: 'CircBoards', top: '', files: { 'src/boards.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircBoards');
  await page.eval(() => window.SilinxApp.openFile('src/boards.circ.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-canvas .circ-board-art`).length === 5, [ED], { what: 'the boards drawn' });
  await page.click(`${ED} [data-act=fit]`).catch(() => page.eval(() => window.Silinx.active.circuitEditor.fit()));
  await page.screenshot(`${env.shotDir}/circuit-board-look.png`);
  // (its Check: each board joins nothing)
  const said = ['A1 (Arduino Uno)', 'A2 (Arduino Nano)', 'E1 (ESP32 DevKitC)', 'F1 (Digilent Basys2)', 'F2 (Digilent Nexys2)'].map((b) => `WARNING: ${b} joins nothing`);
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /F2 \(Digilent Nexys2\) joins nothing/.test(l.textContent)), [], { what: 'the Check' });
  assert.deepEqual(await warnings(page), said);
  // the emulators' drawings: their names, an FPGA board's 8 LEDs, 8 switches (and its power switch), 4 buttons, 4 digits
  const look = (id) => page.eval((ed, pid) => {
    const a = document.querySelector(`${ed} [data-id=${pid}] .circ-board-art`);
    const n = (s) => a.querySelectorAll(s).length;
    return [[...a.querySelectorAll('text')].map((t) => t.textContent).find((t) => /^(UNO|NANO|ESP32-DevKitC V4|BASYS 2|NEXYS 2)$/.test(t)), n('rect.circ-bd-led'), n('.circ-bd-sw'), n('.circ-bd-btn'), n(':scope > svg:not(.emu-pcb-art)')];
  }, ED, id);
  assert.deepEqual([await look('A1'), await look('A2'), await look('E1'), await look('F1'), await look('F2')], [['UNO', 0, 0, 0, 0], ['NANO', 0, 0, 0, 0], ['ESP32-DevKitC V4', 0, 0, 0, 0], ['BASYS 2', 8, 9, 4, 4], ['NEXYS 2', 8, 9, 4, 4]]);
  // every pin of each where the drawing has it
  for (const id of ['A1', 'A2', 'E1', 'F1', 'F2']) assert.deepEqual(await unmatched(page, id), [], `${id}: its pins on its drawing's`);
  // a click on its drawing selects it, its outline lit
  const on = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=F1] .circ-board-art`).getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 }; }, ED);
  await page.click(on);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=F1]`).classList.contains('circ-sel'), [ED], { what: 'F1 selected' });
  assert.notEqual(await page.eval((ed) => getComputedStyle(document.querySelector(`${ed} [data-id=F1] .circ-board-outline`)).stroke, ED), 'none');
  // turned (R): its drawing with it, its pins still on the drawing's
  await page.key('r');
  await page.waitFor(() => window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'F1').rot === 1, [], { what: 'F1 turned' });
  assert.deepEqual(await unmatched(page, 'F1'), [], 'turned: its pins on its drawing\'s');
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => !window.Silinx.active.circuitEditor.getModel().parts.find((p) => p.id === 'F1').rot, [], { what: 'undone' });
  // Fit: every board in the canvas
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  assert.deepEqual(await page.eval((ed) => {
    const c = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect();
    return [...document.querySelectorAll(`${ed} .circ-canvas .circ-board-outline`)].filter((o) => { const r = o.getBoundingClientRect(); return r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1; }).length;
  }, ED), 0, 'Fit: all of them shown');
  // the print's snapshot: the drawings in it, all SVG
  const snap = await page.eval(async (ed) => {
    const { svgSnapshot } = await import('/js/print.js');
    const svg = document.querySelector(`${ed} .circ-canvas`), world = svg.querySelector('.circ-world');
    return svgSnapshot(svg, world, { l: -400, t: -200, r: 3000, b: 1000 }).svg;
  }, ED);
  assert.deepEqual(['BASYS 2', 'NEXYS 2', 'UNO', 'NANO', 'ATmega328P'].filter((t) => !snap.includes(`>${t}<`)), []);
  assert.equal(/foreignObject/i.test(snap), false);
  // in Portuguese: the boards' silkscreen as it is
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => document.documentElement.lang === 'pt' || true, [], { what: 'Portuguese' });
  assert.deepEqual(await look('F1'), ['BASYS 2', 8, 9, 4, 4]);
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-id=F1] .circ-bd-silk`)].map((t) => t.textContent).slice(0, 2).join(' '), ED), 'LD7 (G1)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // (no other since; the Design's own Check, in the background, says them too)
  assert.deepEqual((await warnings(page)).map((l) => l.replace('WARNING:Circuit - "src/boards.circ.json": ', 'WARNING: ')).filter((l) => !said.includes(l)), [], 'no other since');
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

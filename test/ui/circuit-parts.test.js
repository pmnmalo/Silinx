// UI: phase 2's parts in the circuit editor (#3899, web/js/circuit-draw-parts.js): a DIP switch, a 7-segment display, an
// LED bar, a clock source, a slide switch and a pull-up drawn; Try it: a click on a DIP lever lights a segment, a click on
// the slide switch flips it, the clock ticks in real time; the library's groups (the 74LS and the 4000 gates), a 4001
// placed and its pinout; the properties: a clock's frequency, a DIP switch's levers as saved; in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newCircuit } from '../../core/circuit.js';
import * as E from '../../core/circuit-edit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const ED = '.doc:not([hidden]) .circuit-editor';

// a DIP switch's levers 1 and 2 from + to a display's a and b; a clock on an LED bar's first light; a slide switch
// between the rails on the bar's second light
function panel() {
  let m = newCircuit('panel');
  const ops = [['addPart', { type: 'dip-4', at: 'BB1.f3', id: 'S1', label: 'sw' }], ['addWire', { from: 'BB1.j3', to: 'BB1.bp3' }], ['addWire', { from: 'BB1.j4', to: 'BB1.bp4' }],
    ['addWire', { from: 'BB1.bp1', to: 'BB1.tp1', via: [[-2, 15], [-2, -4]] }],
    ['addPart', { type: 'seg7-cc', at: 'BB1.h12', id: 'DS1', label: 'hex' }], ['addWire', { from: 'BB1.a3', to: 'BB1.a15' }], ['addWire', { from: 'BB1.a4', to: 'BB1.b16' }], ['addWire', { from: 'BB1.e14', to: 'BB1.tn14' }],
    ['addPart', { type: 'clock', at: [-8, 20], id: 'CK1', label: 'clk' }], ['addPart', { type: 'led-bar-10', at: 'BB1.f20', id: 'D2', label: 'bar' }],
    ['addWire', { from: 'CK1.out', to: 'BB1.j20' }], ['addWire', { from: 'BB1.a20', to: 'BB1.tn20' }], ['addWire', { from: 'BB1.a21', to: 'BB1.tn21' }],
    ['addPart', { type: 'spdt', at: [34, 4], id: 'S2', label: 'sel' }], ['addWire', { from: 'S2.A', to: 'BB1.tn30', via: [[34, -3]] }], ['addWire', { from: 'S2.B', to: 'BB1.tp30', via: [[36, -4]] }],
    ['addWire', { from: 'S2.C', to: 'BB1.j21', via: [[35, 12], [20, 12]] }],
    ['addPart', { type: 'pull-up', at: [30, 20], id: 'R1' }], ['addWire', { from: 'R1.out', to: 'BB1.bp30' }]];
  for (const [f, a] of ops) { const r = E[f](m, a); if (r.error) throw new Error(`${f}: ${r.error}`); m = r.model; }
  return E.setPartProps(m, 'CK1', { hz: 20 }).model;
}
const litSegs = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} [data-id=DS1] .circ-seg.lit`)].map((s) => s.dataset.seg), ED);
const litBars = (page) => page.eval((ed) => document.querySelectorAll(`${ed} [data-id=D2] .circ-bar`).length && [...document.querySelectorAll(`${ed} [data-id=D2] .circ-bar`)].map((b) => (b.classList.contains('lit') ? 1 : 0)).join(''), ED);
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

uiTest('Circuit editor, phase 2\'s parts: a DIP switch, a display, an LED bar, a clock, a slide switch; tried live; the library and the properties; Portuguese', () => env, async (page) => {
  await makeProject(env, { name: 'PartsPj', top: '', files: { 'src/panel.circ.json': JSON.stringify(panel(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('PartsPj');
  await page.eval(() => window.SilinxApp.openFile('src/panel.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=DS1] .circ-seg`), [ED], { what: 'the display drawn' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .doc-status .ds-f`)].map((f) => f.textContent), ED), ['0 IC(s) · 3 input(s) · 2 display(s) · 15 wire(s)']);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-id=S1] .circ-dip-lever`).length, ED), 4);
  // Try it: nothing lit; lever 1 on: segment a; lever 2 on: b too
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.deepEqual(await litSegs(page), []);
  await page.click(await centre(page, `${ED} [data-id=S1] .circ-dip-lever[data-lever="0"]`));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=DS1] .circ-seg.lit`).length === 1, [ED], { what: 'segment a lit' });
  await page.click(await centre(page, `${ED} [data-id=S1] .circ-dip-lever[data-lever="1"]`));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=DS1] .circ-seg.lit`).length === 2, [ED], { what: 'segments a and b lit' });
  assert.deepEqual(await litSegs(page), ['a', 'b']);
  // the clock (20 Hz) blinks the bar's first light; the slide switch lights its second
  const seen = new Set();
  for (let i = 0; i < 12 && seen.size < 2; i++) { seen.add((await litBars(page))[0]); await new Promise((r) => setTimeout(r, 30)); }
  assert.deepEqual([...seen].sort(), ['0', '1'], 'the clock ticking');
  assert.equal((await litBars(page))[1], '0');
  await page.click(await centre(page, `${ED} [data-id=S2] .circ-sw-body`));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=D2] .circ-bar`)[1].classList.contains('lit'), [ED], { what: 'the slide switch on: light 2' });
  await page.click(`${ED} .circ-sim-btn`);
  // the library: the 74LS and the 4000 gates; a 4001 placed, its pinout
  const groups = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-group`)].map((g) => [g.querySelector('.circ-lib-title').textContent, g.querySelectorAll('.circ-lib-part').length]), ED);
  assert.deepEqual(groups, [['Breadboards', 2], ['Power', 3], ['Inputs', 6], ['Outputs', 4], ['Gates (74LS)', 16], ['Gates (4000)', 7]]);
  await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="4001"]`).scrollIntoView({ block: 'center' }), ED);   // (the library scrolls)
  await page.click(`${ED} .circ-lib-part[data-part="4001"]`);
  const free = await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: r.top + 24 }; }, ED);
  assert.equal(await page.eval((p) => document.elementFromPoint(p.x, p.y)?.closest('[data-kind]') || null, free), null, 'an empty place of the canvas');
  await page.click(free);
  await page.waitFor((ed) => /^1 IC/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'a 4001 placed' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection h3`).textContent, ED), 'U1: Quad 2-input NOR');
  // (its pinout: pin 1 beside 14, 2 beside 13 …, as the chip seen from above)
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-pinout`).textContent, ED), 'CD4001B: pinout1A114VDD1B2134B1Y3124A2Y4114Y2A5103Y2B693BVSS783A');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-pinout + .circ-note`).textContent, ED), 'Typical delay 60 ns');
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /^0 IC/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'undone' });
  // the properties: the clock's frequency, the DIP switch's levers as saved (Try it starts from them)
  await page.click(await centre(page, `${ED} [data-id=CK1] .circ-supply-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-hz-in`), [ED], { what: 'the clock selected' });
  await page.fill(`${ED} .circ-hz-in`, '2.5');
  await page.waitFor((ed) => /clk 2\.5 Hz/.test(document.querySelector(`${ed} [data-id=CK1]`).textContent), [ED], { what: 'its frequency' });
  await page.click(await centre(page, `${ED} [data-id=S1] .circ-dip-body`));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-on-in`).length === 4, [ED], { what: 'the DIP switch selected' });
  await page.click(`${ED} .circ-on-in`, { index: 2 });
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=S1] .circ-dip-lever[data-lever="2"]`).classList.contains('on'), [ED], { what: 'lever 3 on' });
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(() => !window.Silinx.active?.dirty, [], { what: 'saved' });
  const m = JSON.parse(await readWs(env, 'PartsPj', 'src/panel.circ.json'));
  assert.deepEqual([m.parts.find((p) => p.id === 'CK1').hz, m.parts.find((p) => p.id === 'S1').on], [2.5, [false, false, true, false]]);
  assert.match(await readWs(env, 'PartsPj', 'src/panel.vhd'), /^    sw_1 : in std_logic;$/m);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-lib-title`)].some((t) => t.textContent === 'Portas (4000)'), [ED], { what: 'the library in Portuguese' });
  assert.deepEqual(await page.eval((ed) => ['dip-4', 'seg7-cc', '7430', '4001', '7403'].map((t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`).textContent), ED),
    ['Interruptor DIP (4)', 'Mostrador de 7 segmentos, cátodo comum', '7430 Uma porta NAND de 8 entradas', '4001 Quatro portas NOR de 2 entradas', '7403 Quatro portas NAND de 2 entradas, coletor aberto']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-on`).closest('label').firstChild.textContent, ED), 'Alavancas ligadas');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

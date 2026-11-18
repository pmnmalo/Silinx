// UI (#4505): Show inside draws a three-state IC's buffers as its datasheet's connection diagram: the 74244's standing
// between its rows (turned up and down), each OE̅'s bus into its four buffers' sides through their bubbles, a dot where a
// bus branches (a T of one pin's lines), its crossings of the data lines as the circuit's wires cross (⋮ Wire crossings:
// hop-overs over them, or plain), never a dot on a crossing; IEEE's triangles and IEC's boxes. The circuit (the 74244's
// bench: powered, its inputs and enables on switches, its outputs on LEDs pulled down) checked with no errors and no
// warnings; no warnings on the page; Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { icBench } from '../circuit-helpers.mjs';
import { checkCircuit } from '../../core/circuit-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const ED = '.doc:not([hidden]) .circuit-editor';
const menuItem = async (page, label) => page.click(await page.eval((ed, l) => {
  const r = [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-item`)].find((b) => b.lastChild.textContent === l).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, ED, label));
// the 74244's inside: its buffers [function, turned], IEC's qualifiers, its lines, its hop-overs' arcs, its dots, its
// enables' bubbles, its pins named
const inside = (page) => page.eval((ed) => {
  const ic = document.querySelector(`${ed} [data-id=U1]`);
  return { shapes: [...ic.querySelectorAll('.circ-gate-ieee')].map((g) => `${g.dataset.fn}${g.dataset.rot}`), boxes: [...ic.querySelectorAll('.circ-gate-text')].map((t) => t.textContent),
    lines: ic.querySelectorAll('.circ-gate-line').length, arcs: [...ic.querySelectorAll('path.circ-gate-hop')].reduce((n, p) => n + (p.getAttribute('d').match(/ A/g) || []).length, 0),
    dots: ic.querySelectorAll('.circ-gate-dot').length, bubbles: ic.querySelectorAll('.circ-gate-en').length, names: [...ic.querySelectorAll('.circ-pin-name')].map((t) => t.textContent).sort() };
}, ED);

uiTest('#4505 Show inside: the 74244\'s buffers standing, its enables\' buses (dots at their branches, bubbles), crossing as the wires cross; IEEE, IEC; Portuguese', () => env, async (page) => {
  const m = icBench('74244', { name: 'octal' });
  assert.deepEqual(checkCircuit(m).map((x) => `${x.severity}: ${x.message}`), []);
  await makeProject(env, { name: 'TriPj', top: '', files: { 'src/octal.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('TriPj');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.circuit.hops', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/octal.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1]`), [ED], { what: 'the circuit editor' });
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-ieee`).length === 8, [ED], { what: 'the 74244\'s buffers' });
  // Hop-overs (the default): the two buses hop over the 14 data lines they cross; 6 dots, the buses' branches; 8 bubbles
  const HOPS = { shapes: [...Array(4).fill('buf-90'), ...Array(4).fill('buf90')], boxes: [], lines: 26, arcs: 14, dots: 6, bubbles: 8, names: ['GND', 'VCC'] };
  assert.deepEqual(await inside(page), HOPS);
  // Plain crossings: straight across, still no dot on them
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Plain crossings');
  await page.waitFor((ed) => !document.querySelector(`${ed} [data-id=U1] .circ-gate-hop`), [ED], { what: 'plain crossings' });
  assert.deepEqual(await inside(page), { ...HOPS, arcs: 0 });
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Hop-overs');
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1] .circ-gate-hop`), [ED], { what: 'the hop-overs again' });
  // IEC: a box a buffer, its qualifier 1
  await page.eval(async () => (await import('/js/symbol-standard.js')).symbolsMenu().submenu.find((x) => /IEC/.test(x.label)).action());
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-text`).length === 8, [ED], { what: 'the IEC boxes' });
  assert.deepEqual(await inside(page), { ...HOPS, shapes: [], boxes: Array(8).fill('1') });
  await page.eval(async () => (await import('/js/symbol-standard.js')).symbolsMenu().submenu.find((x) => /IEEE/.test(x.label)).action());
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-ieee`).length === 8, [ED], { what: 'the shapes again' });
  // in Portuguese: the same drawing
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /CI\(s\)/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'the status line in Portuguese' });
  assert.deepEqual(await inside(page), HOPS);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.circuit.hops', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

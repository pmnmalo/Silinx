// UI (#4505): Show inside draws the 4023's three NANDs (and the 4025's, 4073's, 4075's gates), its first gate's 1C line
// crossing 1Y's once: a hop-over with ⋮ Wire crossings' Hop-overs (the default), a plain crossing with Plain crossings,
// never a dot; IEEE's shapes and IEC's boxes. The latches' row in the Parts panel: a latch's symbol. The circuit (the
// 4023's bench: powered, its inputs on switches, its outputs on LEDs) checked with no errors and no warnings; no warnings
// on the page; Portuguese. Both interfaces.
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
// the 4023's inside: its gates' shapes, its lines (a hop-over's path), its pins named, any dot
const inside = (page) => page.eval((ed) => {
  const ic = document.querySelector(`${ed} [data-id=U1]`);
  return { shapes: [...ic.querySelectorAll('.circ-gate-ieee')].map((g) => g.dataset.fn), boxes: [...ic.querySelectorAll('.circ-gate-text')].map((t) => t.textContent),
    lines: ic.querySelectorAll('.circ-gate-line').length, hops: [...ic.querySelectorAll('path.circ-gate-hop')].map((p) => [p.dataset.pin, / A2\.5,2\.5 /.test(p.getAttribute('d'))]),
    names: [...ic.querySelectorAll('.circ-pin-name')].map((t) => t.textContent).sort(), dots: ic.querySelectorAll('.circ-dot, .circ-junction').length };
}, ED);

uiTest('#4505 Show inside: the 4023\'s gates, 1C crossing 1Y as the wires cross (a hop-over or plain); the latches\' symbol; Portuguese', () => env, async (page) => {
  const m = icBench('4023', { name: 'nand3' });
  assert.deepEqual(checkCircuit(m).map((x) => `${x.severity}: ${x.message}`), []);
  await makeProject(env, { name: 'CrossPj', top: '', files: { 'src/nand3.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CrossPj');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.circuit.hops', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/nand3.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1]`), [ED], { what: 'the circuit editor' });
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-ieee`).length === 3, [ED], { what: 'the 4023\'s gates' });
  // Hop-overs (the default): 1Y's line hops over 1C's
  const HOP = { shapes: ['nand', 'nand', 'nand'], boxes: [], lines: 12, hops: [['9', true]], names: ['VDD', 'VSS'], dots: 0 };
  assert.deepEqual(await inside(page), HOP);
  // Plain crossings: straight across, no dot
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Plain crossings');
  await page.waitFor((ed) => !document.querySelector(`${ed} [data-id=U1] .circ-gate-hop`), [ED], { what: 'a plain crossing' });
  assert.deepEqual(await inside(page), { ...HOP, hops: [] });
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Hop-overs');
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1] .circ-gate-hop`), [ED], { what: 'the hop-over again' });
  // IEC: & boxes, the hop the same
  await page.eval(async () => (await import('/js/symbol-standard.js')).symbolsMenu().submenu.find((x) => /IEC/.test(x.label)).action());
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-text`).length === 3, [ED], { what: 'the IEC boxes' });
  assert.deepEqual(await inside(page), { ...HOP, shapes: [], boxes: ['&', '&', '&'] });
  await page.eval(async () => (await import('/js/symbol-standard.js')).symbolsMenu().submenu.find((x) => /IEEE/.test(x.label)).action());
  // the latches in the Parts panel: a latch's symbol, no clock's ▷
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7475"] svg`), [ED], { what: 'the Parts panel' });
  assert.deepEqual(await page.eval((ed) => ['7475', '7477', '74375', '74279', '74373', '74573', '7474'].map((t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"] svg`).getAttribute('class')), ED),
    [...Array(6).fill('circ-pv circ-pv-sym circ-pv-latch'), 'circ-pv circ-pv-sym']);
  // in Portuguese: the same drawing
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /CI\(s\)/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'the status line in Portuguese' });
  assert.deepEqual(await inside(page), HOP);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.circuit.hops', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

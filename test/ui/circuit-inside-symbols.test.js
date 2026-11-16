// UI (#4220): the circuit editor's Show inside draws the ICs' gates in Settings ▸ Schematic Symbols' standard (#4113):
// IEEE Std 91-1984's distinctive shapes by default (the 7408's ANDs a D: an arc, no box), IEC 60617-12's boxes (& in a
// rectangle) once it is chosen, drawn again at once with the circuit open; back to the shapes; the 7486's XORs (a shape
// and its second back) and their boxes (=1). Laid out as the datasheet's connection diagram (#4224): each gate's lines
// horizontal and vertical, from its pins (an input's) or to them (the output's), three a gate; VCC and GND named. The
// breadboard's strips the same in both. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';

/** Settings ▸ Schematic Symbols (View ▸ in the ISE style interface), `pick` clicked. */
async function chooseSymbols(page, pick) {
  await page.closeMenus();
  const ise = await page.eval(() => document.documentElement.dataset.ui === 'ise');
  let items;
  if (ise) items = await page.openMenu('View');
  else {
    await page.click('#settings-btn');
    await page.waitForSelector('body > .menu-popup .mi');
    items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => ({ label: l.textContent })));
  }
  const idx = items.findIndex((x) => x.label === 'Schematic Symbols');
  assert.ok(idx >= 0, items.map((x) => x.label).join(' | '));
  await page.hover(await page.point(ise ? 'body > .menu-popup > .mi' : 'body > .menu-popup:not(.sub) > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  await page.click('.menu-popup.sub .mi', { index: subs.indexOf(pick) });
}
// an IC's gates inside as drawn: [function or qualifier, how: 'arc' (an AND's D), 'shield' (an OR's or XOR's curves), 'box']
const gates = (page, id) => page.eval((ed, u) => {
  const ic = document.querySelector(`${ed} [data-id=${u}]`);
  const shapes = [...ic.querySelectorAll('.circ-gate-ieee')].map((g) => {
    const d = g.querySelector('path').getAttribute('d');
    return [g.dataset.fn, / A[\d.]+,[\d.]+ 0 0 1 /.test(d) ? 'arc' : /Q.*Q.*Q/.test(d) ? 'shield' : d, g.querySelectorAll('path').length];
  });
  const boxes = [...ic.querySelectorAll('rect.circ-gate')].map((r) => [r.nextElementSibling?.textContent, 'box', 1]);
  return [...shapes, ...boxes];
}, ED, id);
// an IC's lines inside as drawn (#4224): [its pin, orthogonal, its pin's end on the pin's point], and the pins named
const lines = (page, id) => page.eval((ed, u) => {
  const ic = document.querySelector(`${ed} [data-id=${u}]`);
  const pin = new Map([...ic.querySelectorAll('circle.circ-pin')].map((c) => [c.querySelector('title').textContent.match(/pin (\d+)/)[1], [+c.getAttribute('cx'), +c.getAttribute('cy')]]));
  const out = [...ic.querySelectorAll('polyline.circ-gate-line')].map((l) => {
    const pts = l.getAttribute('points').split(' ').map((q) => q.split(',').map(Number));
    const flat = pts.slice(1).every((b, i) => b[0] === pts[i][0] || b[1] === pts[i][1]);
    const p = pin.get(l.dataset.pin), ends = [pts[0], pts.at(-1)].some((q) => q[0] === p[0] && q[1] === p[1]);
    return [+l.dataset.pin, flat, ends];
  }).sort((a, b) => a[0] - b[0]);
  return { lines: out, names: [...ic.querySelectorAll('.circ-pin-name')].map((t) => t.textContent).sort() };
}, ED, id);
const LINES = { lines: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13].map((n) => [n, true, true]), names: ['GND', 'VCC'] };

uiTest('#4220 Show inside: the ICs\' gates in Settings ▸ Schematic Symbols\' standard, drawn again when it changes', E, async (page) => {
  await makeProject(env, { name: 'CircSyms', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircSyms');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  await page.click(`${ED} .circ-inside`);
  // IEEE Std 91-1984, the default: the 7408's ANDs a D (its arc), the 7486's XORs a shield and a second back
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-gate-ieee`).length === 8, [ED], { what: 'the shapes' });
  const AND = [['and', 'arc', 1], ['and', 'arc', 1], ['and', 'arc', 1], ['and', 'arc', 1]], XOR = [['xor', 'shield', 2], ['xor', 'shield', 2], ['xor', 'shield', 2], ['xor', 'shield', 2]];
  assert.deepEqual([await gates(page, 'U2'), await gates(page, 'U1')], [AND, XOR]);
  assert.deepEqual([await lines(page, 'U1'), await lines(page, 'U2')], [LINES, LINES]);
  const strips = await page.eval((ed) => document.querySelectorAll(`${ed} .circ-strip`).length, ED);
  // IEC 60617-12 chosen with the circuit open: boxes, & and =1, at once
  await chooseSymbols(page, 'IEC 60617-12 (rectangular)');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} rect.circ-gate`).length === 8, [ED], { what: 'the boxes' });
  assert.deepEqual([await gates(page, 'U2'), await gates(page, 'U1')], [AND.map(() => ['&', 'box', 1]), XOR.map(() => ['=1', 'box', 1])]);
  assert.deepEqual([await lines(page, 'U1'), await lines(page, 'U2')], [LINES, LINES]);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-strip`).length, ED), strips);
  // back to the distinctive shapes
  await chooseSymbols(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-gate-ieee`).length === 8 && !document.querySelector(`${ed} rect.circ-gate`), [ED], { what: 'the shapes again' });
  assert.deepEqual([await gates(page, 'U2'), await gates(page, 'U1')], [AND, XOR]);
  await page.eval(() => { try { localStorage.removeItem('silinx.symbols'); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

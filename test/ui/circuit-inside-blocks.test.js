// UI (#4508): Show inside draws an IC with no gates as its datasheet's connection diagram: the 7474's two D flip-flops,
// a box each beside its pins, their clocks' ▷ and their bubbles; the 74161's one box. IEEE (the datasheet's names) and
// IEC 60617-12 (1D, C1, S, R; a counter's CTR), drawn again at once when Settings ▸ Schematic Symbols changes; the
// same in Portuguese (the pins' names are the datasheet's). The circuit (both ICs powered) checked with no errors and no
// warnings; no warnings on the page. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit, normalizeCircuit } from '../../core/circuit.js';
import { partPins } from '../../core/circuit-parts.js';
import { checkCircuit } from '../../core/circuit-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const ED = '.doc:not([hidden]) .circuit-editor';

// a 7474 and a 74161 beside the supply, their VCC and GND wired to it
function circuit() {
  const m = newCircuit('ffs', 'vhdl', { breadboard: false });
  const U1 = { id: 'U1', type: '7474', x: 0, y: 0 }, U2 = { id: 'U2', type: '74161', x: 12, y: 0 };
  m.parts.push(U1, U2, { id: 'P1', type: 'supply', x: -20, y: -20 });
  const pin = (p, n) => { const q = partPins(p).find((x) => x.n === n); return [q.x, q.y]; };
  let k = 0;
  const W = (...points) => m.wires.push({ id: `w${++k}`, points, color: 'blue' });
  W([-20, -20], pin(U1, 14)); W([-20, -19], pin(U1, 7)); W(pin(U1, 14), pin(U2, 16)); W(pin(U1, 7), pin(U2, 8));
  return normalizeCircuit(m);
}

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
// an IC's boxes inside: [unit, its labels], its clocks' ▷, its bubbles, its IEC qualifiers, its lines
const blocks = (page, id) => page.eval((ed, u) => {
  const ic = document.querySelector(`${ed} [data-id=${u}]`);
  return { boxes: [...ic.querySelectorAll('.circ-block')].map((b) => [b.dataset.unit, [...b.querySelectorAll('.circ-block-pin')].map((t) => t.textContent).join(' ')]),
    clocks: ic.querySelectorAll('.circ-block-clock').length, bubbles: ic.querySelectorAll('.circ-block .circ-gate-bubble').length,
    qualifiers: [...ic.querySelectorAll('.circ-block-qual')].map((t) => t.textContent), lines: ic.querySelectorAll('polyline.circ-gate-line').length };
}, ED, id);

uiTest('#4508 Show inside: the 7474\'s flip-flops and the 74161\'s counter as their datasheets draw them, IEEE and IEC, Portuguese', () => env, async (page) => {
  const m = circuit();
  assert.deepEqual(checkCircuit(m).map((x) => `${x.severity}: ${x.message}`), []);
  await makeProject(env, { name: 'BlocksPj', top: '', files: { 'src/ffs.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('BlocksPj');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/ffs.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U2]`), [ED], { what: 'the circuit editor' });
  // inside hidden: no boxes, the ICs' names
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-block`).length, ED), 0);
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-block`).length === 3, [ED], { what: 'the boxes' });
  // IEEE: the datasheet's names; a box a flip-flop, a ▷ each, CLR̅ and PRE̅ bubbled
  const FF_IEEE = { boxes: [['1', 'CLR̅ D CLK PRE̅ Q Q̅'], ['2', 'Q̅ Q PRE̅ CLK D CLR̅']], clocks: 2, bubbles: 4, qualifiers: [], lines: 12 };
  assert.deepEqual(await blocks(page, 'U1'), FF_IEEE);
  const ctr = await blocks(page, 'U2');
  assert.deepEqual([ctr.boxes.length, ctr.boxes[0][0], ctr.clocks, ctr.bubbles, ctr.qualifiers, ctr.lines], [1, 'all', 1, 2, [], 16]);
  // (the supply's pins last, in the box over them)
  assert.match(ctr.boxes[0][1], /^CLR̅ CLK A B C D ENP LOAD̅ ENT QD QC QB QA RCO GND VCC$/);
  // IEC 60617-12, at once: 1D, C1, S, R (Q unlabelled, Q̅ by its bubble); the counter's CTR
  await chooseSymbols(page, 'IEC 60617-12 (rectangular)');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-block[data-std=iec]`), [ED], { what: 'the IEC boxes' });
  assert.deepEqual(await blocks(page, 'U1'), { boxes: [['1', 'R 1D C1 S'], ['2', 'S C1 1D R']], clocks: 2, bubbles: 6, qualifiers: [], lines: 12 });
  assert.deepEqual((await blocks(page, 'U2')).qualifiers, ['CTR']);
  await chooseSymbols(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-block[data-std=ieee]`), [ED], { what: 'the IEEE boxes again' });
  // in Portuguese: the datasheet's names kept
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /CI\(s\)/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'the status line in Portuguese' });
  assert.deepEqual(await blocks(page, 'U1'), FF_IEEE);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

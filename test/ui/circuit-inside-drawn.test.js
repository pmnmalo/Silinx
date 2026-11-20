// UI (#4934): Show inside draws the 7475 as its datasheet's connection diagram (Pedro's picture): four D latches, each a
// box with its D, G, Q and Q̅, the enables 1-2 (pin 13) and 3-4 (pin 4) each down between its pair, a dot, into both;
// their crossings hop-overs (Wire crossings: Hop-overs, the default); the 74375's two
// pairs, one on each row. IEEE (the datasheet's names) and IEC 60617-12 (1D, C1; Q̅ by its bubble), drawn again at once
// when Settings ▸ Schematic Symbols changes; the same in Portuguese. The circuit checked with no errors and no warnings;
// no warnings on the page. Both interfaces.
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

// a 7475 and a 74375 beside the supply, their VCC and GND wired to it
function circuit() {
  const m = newCircuit('latches', 'vhdl', { breadboard: false });
  const U1 = { id: 'U1', type: '7475', x: 0, y: 0 }, U2 = { id: 'U2', type: '74375', x: 12, y: 0 };
  m.parts.push(U1, U2, { id: 'P1', type: 'supply', x: -20, y: -20 });
  const pin = (p, n) => { const q = partPins(p).find((x) => x.n === n); return [q.x, q.y]; };
  let k = 0;
  const W = (...points) => m.wires.push({ id: `w${++k}`, points, color: 'blue' });
  W([-20, -20], pin(U1, 5)); W([-20, -19], pin(U1, 12)); W(pin(U1, 5), pin(U2, 16)); W(pin(U1, 12), pin(U2, 8));
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
// an IC's boxes inside: [unit, its labels], its dots, its hop-overs, its bubbles
const inside = (page, id) => page.eval((ed, u) => {
  const ic = document.querySelector(`${ed} [data-id=${u}]`);
  return { boxes: [...ic.querySelectorAll('.circ-block')].map((b) => [b.dataset.unit, [...b.querySelectorAll('.circ-block-pin')].map((t) => t.textContent).join(' ')]),
    dots: ic.querySelectorAll('.circ-gate-dot').length, hops: ic.querySelectorAll('.circ-gate-hop').length, bubbles: ic.querySelectorAll('.circ-block .circ-gate-bubble').length };
}, ED, id);

uiTest('#4934 Show inside: the 7475\'s four latches as its datasheet draws them, their enables shared by pairs; the 74375\'s; IEEE and IEC, Portuguese', () => env, async (page) => {
  const m = circuit();
  assert.deepEqual(checkCircuit(m).map((x) => `${x.severity}: ${x.message}`), []);
  await makeProject(env, { name: 'LatchPj', top: '', files: { 'src/latches.circ.json': JSON.stringify(m, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('LatchPj');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols', 'silinx.circuit.hops']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/latches.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U2]`), [ED], { what: 'the circuit editor' });
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-block`).length === 8, [ED], { what: 'the latches' });
  // IEEE: a box a latch, its pins' functions; the two enables' dots; the lines' five crossings hopped, on four of them
  const U1_IEEE = { boxes: [['1', 'Q Q̅ G D'], ['2', 'Q̅ G D Q'], ['3', 'Q Q̅ G D'], ['4', 'G D Q Q̅']], dots: 2, hops: 4, bubbles: 0 };
  assert.deepEqual(await inside(page, 'U1'), U1_IEEE);
  assert.deepEqual(await inside(page, 'U2'), { boxes: [['1', 'D Q̅ Q G'], ['2', 'G Q Q̅ D'], ['4', 'D Q̅ Q G'], ['3', 'G Q Q̅ D']], dots: 2, hops: 0, bubbles: 0 });
  // (its supply's pins not named inside; the enables' lines from their pins 13 and 4)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-id=U1] .circ-pin-name`)].map((t) => t.textContent), ED), []);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-line[data-pin="13"]`).length, ED), 2);
  // IEC 60617-12, at once: 1D, C1, Q unlabelled, Q̅ by its bubble
  await chooseSymbols(page, 'IEC 60617-12 (rectangular)');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-block[data-std=iec]`), [ED], { what: 'the IEC boxes' });
  assert.deepEqual(await inside(page, 'U1'), { boxes: [['1', 'C1 1D'], ['2', 'C1 1D'], ['3', 'C1 1D'], ['4', 'C1 1D']], dots: 2, hops: 4, bubbles: 4 });
  await chooseSymbols(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-block[data-std=ieee]`), [ED], { what: 'the IEEE boxes again' });
  // in Portuguese: the datasheet's names kept
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /CI\(s\)/.test(document.querySelector(`${ed} .doc-status .ds-f`).textContent), [ED], { what: 'the status line in Portuguese' });
  assert.deepEqual(await inside(page, 'U1'), U1_IEEE);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols', 'silinx.circuit.hops']) try { localStorage.removeItem(k); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

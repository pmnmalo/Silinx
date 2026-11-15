// UI: a wire drawn from A to B in the circuit's style (#4083): Orthogonal, a click on hole a3 then on a8 makes a wire
// routed over the gap above row a (shown so while drawing); a boxed-in pin's wire drawn straight, said in the console;
// Direct, through a clicked point; Curved, from A to B, a sag; the Wire tool's tip in Portuguese. No other warning.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);
const last = (page) => page.eval(() => window.Silinx.active.circuitEditor.getModel().wires.at(-1));
const style = (page, s) => page.eval((s) => { const ed = window.Silinx.active.circuitEditor; const m = ed.getModel(); if (s) m.wireStyle = s; else delete m.wireStyle; ed.setModel(m); }, s);
async function draw(page, ...pts) {
  await page.click(`${ED} .circ-tool`, { text: 'Wire' });
  for (const [x, y] of pts) await page.click(await at(page, x, y));
}

uiTest('#4083 Circuit editor: a wire from A to B in its style: Orthogonal routed, Direct through a point, Curved; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircDraw', top: '', files: { 'src/half_adder.circ.json': JSON.stringify({ ...halfAdder(), wireStyle: 'orthogonal' }, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircDraw');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  const n0 = (await page.eval(() => window.Silinx.active.circuitEditor.getModel().wires.length));
  // Orthogonal: a3, then the pointer on a8: the draft routed; a click there: the wire
  await draw(page, [2, 0]);
  const p8 = await at(page, 7, 0);
  await page.mouse('mouseMoved', p8.x, p8.y);
  await page.waitFor((ed) => document.querySelector(`${ed} path.circ-draft`)?.getAttribute('d') === 'M40,0 L40,-20 L140,-20 L140,0', [ED], { what: 'the draft routed' });
  await page.click(p8);
  await page.waitFor((n) => window.Silinx.active.circuitEditor.getModel().wires.length === n + 1, [n0], { what: 'the wire' });
  assert.deepEqual((await last(page)).points, [[2, 0], [2, -1], [7, -1], [7, 0]]);
  // a boxed-in pin (U1 pin 3) to D2's anode: drawn straight, said
  await draw(page, [6, 7], [26, 2]);
  await page.waitConsole(/no clear orthogonal path/);
  assert.deepEqual((await last(page)).points, [[6, 7], [26, 2]]);
  assert.match(await page.consoleText(), /WARNING: half_adder\.circ\.json: w\d+: no clear orthogonal path \(the parts' pins and the other wires in the way\): drawn straight there/);
  // Direct: through a clicked point
  await page.click(`${ED} [data-act=select]`);
  await style(page, null);
  await draw(page, [2, 0], [4, -2], [7, 0]);
  await page.waitFor((n) => window.Silinx.active.circuitEditor.getModel().wires.length === n + 1, [n0 + 2], { what: 'a direct wire' });
  assert.deepEqual((await last(page)).points, [[2, 0], [4, -2], [7, 0]]);
  // Curved: from A to B, a sag
  await page.click(`${ED} [data-act=select]`);
  await style(page, 'curved');
  await draw(page, [12, 0], [17, 0]);
  await page.waitFor((n) => window.Silinx.active.circuitEditor.getModel().wires.length === n + 1, [n0 + 3], { what: 'a curved wire' });
  const w = await last(page);
  assert.deepEqual(w.points, [[12, 0], [17, 0]]);
  assert.match(await page.eval((ed, id) => document.querySelector(`${ed} [data-id=${id}] .circ-wire`).getAttribute('d'), ED, w.id), /^M240,0 .* L?290,10 .*340,0$/);   // (its middle half a step below: crossing w2, drawn sampled for its hops)
  // the Wire tool's tip, in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .circ-tool`)].some((b) => b.textContent.trim() === 'Fio'), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-tool`)].find((b) => b.textContent.trim() === 'Fio').title, ED),
    'Desenhar um fio: clique no início, num pino ou num furo, e depois no fim (os pontos entre eles: por onde passa); é feito no estilo de fios do menu ⋮, encaminhado quando Ortogonal (duplo clique ou Esc: acaba aí)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

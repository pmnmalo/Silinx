// UI: a circuit wire's ends and shape edited by its handles (#4930, #4931; core/circuit-wire-edit.js): the selected wire's
// handles shown (its ends, its bends, its segments' middles); its end dragged to another hole, reconnected there; a
// segment's middle dragged out into a new bend; a bend dragged; a bend double-clicked away; each one edit, Edit ▸ Undo
// bringing the wire back; saved. No handles while trying it. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// a grid point's or a handle's place on the screen
const at = (page, x, y) => page.eval((ed, gx, gy) => {
  const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
  return { x: m.a * gx * 20 + m.e, y: m.d * gy * 20 + m.f };
}, ED, x, y);
const handle = (page, h) => page.point(`${ED} [data-handle="${h}"]`);
const points = (page, id) => page.eval((i) => window.Silinx.active.circuitEditor.getModel().wires.find((w) => w.id === i).points, id);
const waitPoints = (page, id, pts, what) => page.waitFor((i, p) => JSON.stringify(window.Silinx.active.circuitEditor.getModel().wires.find((w) => w.id === i).points) === p, [id, JSON.stringify(pts)], { what });

uiTest('#4930 #4931 Circuit editor: a wire\'s end dragged to another hole, its bends dragged, added and removed; undone', E, async (page) => {
  await makeProject(env, { name: 'WireEdit', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('WireEdit');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-kind=wire][data-id=ws]`), [ED], { what: 'the circuit editor' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-wire-handle`).length, ED), 0, 'no wire selected: no handles');
  // ws selected (a click on its middle): its handles, 2 ends, 2 bends, 3 middles
  const mid = await page.eval((ed) => {
    const p = document.querySelector(`${ed} [data-kind=wire][data-id=ws] path`), q = p.getPointAtLength(p.getTotalLength() / 2), m = p.getScreenCTM();
    return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
  }, ED);
  await page.click(mid);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-wire-handles[data-id=ws] .circ-wire-handle`).length === 7, [ED], { what: 'its handles' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-wire-handle`)].map((h) => h.dataset.handle), ED),
    ['end:0', 'end:1', 'bend:0', 'bend:1', 'mid:0', 'mid:1', 'mid:2']);
  const was = await points(page, 'ws');
  // its end (D1's anode, [24, 4]) dragged to the hole above it, c25 ([24, 3]): reconnected there, the same strip
  await page.drag(await handle(page, 'end:1'), await at(page, 24, 3));
  await waitPoints(page, 'ws', [[6, 9], [6, 12], [24, 12], [24, 3]], 'its end moved');
  // the middle of its second segment ([15, 12]) dragged down to [15, 13]: a new bend
  await page.drag(await handle(page, 'mid:1'), await at(page, 15, 13));
  await waitPoints(page, 'ws', [[6, 9], [6, 12], [15, 13], [24, 12], [24, 3]], 'a new bend');
  // that bend dragged to [16, 13]; then double-clicked away
  await page.drag(await handle(page, 'bend:1'), await at(page, 16, 13));
  await waitPoints(page, 'ws', [[6, 9], [6, 12], [16, 13], [24, 12], [24, 3]], 'the bend moved');
  await page.dblclick(await handle(page, 'bend:1'));
  await waitPoints(page, 'ws', [[6, 9], [6, 12], [24, 12], [24, 3]], 'the bend removed');
  // each one edit: four undos, the wire as it was
  for (let k = 0; k < 4; k++) await page.menu('Edit', 'Undo');
  await waitPoints(page, 'ws', was, 'undone');
  await page.menu('Edit', 'Redo');
  await waitPoints(page, 'ws', [[6, 9], [6, 12], [24, 12], [24, 3]], 'redone');
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(async () => !window.Silinx.active?.dirty, [], { what: 'saved' });
  assert.deepEqual(JSON.parse(await readWs(env, 'WireEdit', 'src/half_adder.circ.json')).wires.find((w) => w.id === 'ws').points, [[6, 9], [6, 12], [24, 12], [24, 3]]);
  // trying it: no handles
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-wire-handle`).length, ED), 0);
  await page.click(`${ED} .circ-stop`);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

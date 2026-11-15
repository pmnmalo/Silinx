// UI: a circuit's parts turned (#4114): every kind of part (an IC, the switches, a button, an LED, the supply, the clock,
// a pull-up, a 7-segment display, an LED bar, a probe, a breadboard) turned a quarter, a half and three quarters drawn as
// the unturned one turned about its place: its shapes' box the unturned box turned, its pins on its turned pins
// (core/circuit-parts.js partPins); its texts upright; its name clear of its body. An IC turned again by the toolbar's Turn.
// No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const TYPES = ['7400', '74138', 'logic-switch', 'button', 'spdt', 'dip-4', 'clock', 'pull-up', 'led', 'supply', 'seg7-cc', 'led-bar-10', 'probe', 'breadboard-half'];

function circuit() {
  const parts = [];
  TYPES.forEach((type, i) => { for (let rot = 0; rot < 4; rot++) parts.push({ id: `P${i}_${rot}`, type, x: 10 + rot * 40, y: 10 + i * 30, ...(rot ? { rot } : {}) }); });
  return { format: 'silinx-circuit', version: 1, name: 'turned', lang: 'vhdl', parts, wires: [] };
}

// each part's drawing measured on the screen, relative to its place (x, y), in grid steps: its shapes' box, its pins,
// whether its texts are upright, whether a name's box meets its body's
const measure = (page) => page.eval(async (ed) => {
  const { partPins } = await import('/core/circuit-parts.js');
  const world = document.querySelector(`${ed} .circ-world`), k = world.getScreenCTM().a * 20;
  const out = {};
  for (const p of window.Silinx.active.circuitEditor.getModel().parts) {
    const g = document.querySelector(`${ed} [data-kind=part][data-id="${p.id}"]`), m = world.getScreenCTM();
    const o = { x: m.a * p.x * 20 + m.e, y: m.d * p.y * 20 + m.f };
    const rel = (r) => ({ x0: (r.left - o.x) / k, x1: (r.right - o.x) / k, y0: (r.top - o.y) / k, y1: (r.bottom - o.y) / k });
    const shapes = [...g.querySelectorAll('rect, circle, path, line, polyline, polygon')].filter((e) => !e.closest('text'));
    const box = shapes.map((e) => rel(e.getBoundingClientRect())).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
    const pins = [...g.querySelectorAll('.circ-pin')].map((e) => { const r = rel(e.getBoundingClientRect()); return [Math.round((r.x0 + r.x1) / 2 * 10) / 10, Math.round((r.y0 + r.y1) / 2 * 10) / 10]; });
    const upright = [...g.querySelectorAll('text')].every((t) => { const c = t.getScreenCTM(); return Math.abs(c.b) < 1e-6 && Math.abs(c.c) < 1e-6 && c.a > 0 && c.d > 0; });
    const bodies = shapes.filter((e) => !e.classList.contains('circ-pin')).map((e) => e.getBoundingClientRect());
    const clear = [...g.querySelectorAll('text.circ-label')].every((t) => { const a = t.getBoundingClientRect(); return bodies.every((b) => a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1); });
    const want = partPins(p).map((q) => [q.x - p.x, q.y - p.y]);
    out[p.id] = { box, pins, want, upright, clear };
  }
  return out;
}, ED);

// a box turned a quarter clockwise about the place: (x, y) → (−y, x)
const turn = (b, n) => { for (; n > 0; n--) b = { x0: -b.y1, x1: -b.y0, y0: b.x0, y1: b.x1 }; return b; };
const near = (a, b) => ['x0', 'x1', 'y0', 'y1'].every((s) => Math.abs(a[s] - b[s]) < 0.08);
const sortPts = (ps) => ps.map(([x, y]) => [Math.round(x * 10) / 10 + 0, Math.round(y * 10) / 10 + 0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

uiTest('#4114 Circuit editor: every kind of part turned 90°, 180° and 270° drawn as the unturned part turned, its texts upright', E, async (page) => {
  await makeProject(env, { name: 'CircTurn', top: '', files: {
    'src/turned.circ.json': JSON.stringify(circuit(), null, 2),
    'src/one.circ.json': JSON.stringify({ ...circuit(), name: 'one', parts: [{ id: 'U1', type: '7400', x: 10, y: 10, rot: 3 }] }, null, 2),
  } });
  await page.setViewport(1440, 900);
  await page.openProject('CircTurn');
  await page.eval(() => window.SilinxApp.openFile('src/turned.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=P0_3]`), [ED], { what: 'the circuit editor' });
  const m = await measure(page);
  const bad = [];
  TYPES.forEach((type, i) => {
    const b0 = m[`P${i}_0`].box;
    for (let rot = 0; rot < 4; rot++) {
      const d = m[`P${i}_${rot}`];
      if (!near(d.box, turn(b0, rot))) bad.push(`${type} ${90 * rot}°: its box ${JSON.stringify(d.box)}, not ${JSON.stringify(turn(b0, rot))}`);
      if (JSON.stringify(sortPts(d.pins)) !== JSON.stringify(sortPts(d.want))) bad.push(`${type} ${90 * rot}°: its pins not on its turned pins`);
      if (!d.upright) bad.push(`${type} ${90 * rot}°: a text not upright`);
      if (!d.clear) bad.push(`${type} ${90 * rot}°: its name over its body`);
    }
  });
  assert.deepEqual(bad, []);
  // a 7400 turned three quarters, turned once more by the toolbar's Turn: back unturned, drawn as the unturned one was
  await page.eval(() => window.SilinxApp.openFile('src/one.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1]`), [ED], { what: 'the second circuit' });
  // (its view fitted to it first, and settled: the IC where the click lands)
  await page.waitFor((ed) => {
    const r = JSON.stringify(document.querySelector(`${ed} [data-id=U1] .circ-ic-body`).getBoundingClientRect()), same = r === window.lastU1;
    window.lastU1 = r;
    return same && JSON.parse(r).height > 100;
  }, [ED], { what: 'fitted', interval: 150 });
  await page.click(`${ED} [data-id=U1] .circ-ic-body`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1].circ-sel`), [ED], { what: 'selected' });
  await page.click(`${ED} button[title^="Turn the selected part"]`);
  await page.waitFor(() => !window.Silinx.active.circuitEditor.getModel().parts[0].rot, [], { what: 'turned' });
  const m2 = await measure(page);
  assert.ok(near(m2.U1.box, m.P0_0.box), JSON.stringify([m2.U1.box, m.P0_0.box]));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-id=U1]`).getAttribute('transform'), ED), null);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });

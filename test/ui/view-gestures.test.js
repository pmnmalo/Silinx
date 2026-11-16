// UI: every drawing's view gestures are the Schematic editor's (#4291, web/js/view-gestures.js): in the schematic,
// circuit, ASM chart, state diagram, Petri net and symbol editors, the RTL schematic viewer and the FPGA view, the wheel
// with Ctrl (a trackpad's pinch) zooms about the pointer by exp(-deltaY · 0.01), as smoothly as the fingers move (not in
// steps), a mouse's notch by exp(-deltaY · 0.0015); a trackpad's two-finger scroll pans (Shift: across); two fingers on
// a touch screen pinch; Safari's trackpad pinch, its gesture events (#4296), zooms once (where a Ctrl + wheel comes too,
// and on iPadOS, whose two fingers send them too); the middle button, and the left one with Space held down, drag the view, selecting or moving
// nothing; the zoom stays within the editor's limits. No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';
import { newModel } from '../../core/asm.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);
const frame = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const rectOf = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const count = (page, sel) => page.eval((s) => document.querySelectorAll(s).length, sel);

// The view of a drawing, whatever its kind: { s, ox, oy }, the drawing's point (x, y) at the client point (ox + x·s, oy + y·s).
// 'transform': its viewport group's transform="translate(tx,ty) scale(s)" in its svg; 'viewBox': the FPGA view's
// (scaled to meet); 'symbol': the symbol editor's svg, its size the zoom, scrolled in its frame (the viewBox's margin).
const viewOf = (page, v) => page.eval((v) => {
  const svg = document.querySelector(v.svg), r = svg.getBoundingClientRect();
  if (v.kind === 'transform') {
    const n = (document.querySelector(v.vp).getAttribute('transform').match(/-?[\d.]+(e-?\d+)?/g) || []).map(Number);
    return { s: n[2], ox: r.left + n[0], oy: r.top + n[1] };
  }
  const [x, y, w, h] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  if (v.kind === 'symbol') { const s = r.width / w; return { s, ox: r.left - x * s, oy: r.top - y * s }; }
  const s = Math.min(r.width / w, r.height / h);
  return { s, ox: r.left + (r.width - w * s) / 2 - x * s, oy: r.top + (r.height - h * s) / 2 - y * s };
}, v);
// a wheel event at the client point p, on the element there (as the browser sends it)
const wheel = (page, p, o) => page.eval((p, o) => document.elementFromPoint(p.x, p.y).dispatchEvent(new WheelEvent('wheel', { deltaMode: 0, ...o, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })), p, o);
// the drawing's point under p
const under = (v, p) => ({ x: (p.x - v.ox) / v.s, y: (p.y - v.oy) / v.s });
async function zoomedBy(page, cfg, p, o, f, what) {
  const v0 = await viewOf(page, cfg);
  await wheel(page, p, o);
  await frame(page);
  const v1 = await viewOf(page, cfg);
  near(v1.s / v0.s, f, 2e-3, `${cfg.what}: ${what}, zoomed by ${f.toFixed(4)}`);
  const a = under(v0, p), b = under(v1, p);
  near(b.x, a.x, 1.5 / v1.s, `${cfg.what}: ${what}, the point under the pointer kept (x)`);
  near(b.y, a.y, 1.5 / v1.s, `${cfg.what}: ${what}, the point under the pointer kept (y)`);
}
async function pannedBy(page, cfg, p, o, dx, dy, what) {
  const v0 = await viewOf(page, cfg);
  await wheel(page, p, o);
  await frame(page);
  const v1 = await viewOf(page, cfg);
  near(v1.s, v0.s, 1e-9, `${cfg.what}: ${what}, the zoom kept`);
  near(v1.ox - v0.ox, dx, 1, `${cfg.what}: ${what}, panned (x)`);
  near(v1.oy - v0.oy, dy, 1, `${cfg.what}: ${what}, panned (y)`);
}
// a drag of the view from the item `item`, by the middle button or by the left one with Space held down: the view moved
// with the pointer, the item with it only, the selection as it was
async function dragPan(page, cfg, how) {
  const what = `${cfg.what}: ${how === 'space' ? 'Space + drag' : 'the middle button\'s drag'}`;
  // (the item of `cfg.item` nearest the drawing's middle, under the pointer there)
  const k = await page.eval((s, i) => {
    const b = document.querySelector(s).getBoundingClientRect(), mx = b.left + b.width / 2, my = b.top + b.height / 2;
    let best = -1, bd = Infinity;
    document.querySelectorAll(i).forEach((e, n) => {
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, d = Math.hypot(x - mx, y - my);
      if (d < bd && e.contains(document.elementFromPoint(x, y))) { bd = d; best = n; }
    });
    return best;
  }, cfg.svg, cfg.item);
  assert.ok(k >= 0, `${what}: an item in view`);
  const item = () => page.eval((i, n) => { const r = document.querySelectorAll(i)[n].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cfg.item, k);
  const a = await item(), v0 = await viewOf(page, cfg), n0 = cfg.selected ? await count(page, cfg.selected) : 0;
  const d = cfg.drag || { x: 40, y: 30 };
  if (how === 'space') {
    await page.eval((s) => { document.querySelector(s).closest('[tabindex]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })); }, cfg.svg);
  }
  const button = how === 'space' ? 'left' : 'middle', buttons = how === 'space' ? 1 : 4;
  await page.mouse('mouseMoved', a.x, a.y);
  await page.mouse('mousePressed', a.x, a.y, { button, buttons });
  for (let i = 1; i <= 6; i++) await page.mouse('mouseMoved', a.x + d.x * i / 6, a.y + d.y * i / 6, { button, buttons });
  await page.mouse('mouseReleased', a.x + d.x, a.y + d.y, { button });
  if (how === 'space') await page.eval(() => document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })));
  await frame(page);
  const v1 = await viewOf(page, cfg), a1 = await item();
  near(v1.s, v0.s, 1e-9, `${what}: the zoom kept`);
  near(v1.ox - v0.ox, d.x, 1, `${what}: the view panned (x)`);
  near(v1.oy - v0.oy, d.y, 1, `${what}: the view panned (y)`);
  near(a1.x - a.x, d.x, 1, `${what}: the item moved with the view only (x)`);
  near(a1.y - a.y, d.y, 1, `${what}: the item moved with the view only (y)`);
  if (cfg.selected) assert.equal(await count(page, cfg.selected), n0, `${what}: the selection as it was`);
}
// two fingers spread from 2·50 to 2·75 px about p: zoomed by 1.5 about their centre
async function pinch(page, cfg, p) {
  const v0 = await viewOf(page, cfg);
  await page.touchGesture([[{ x: p.x - 50, y: p.y }, { x: p.x - 75, y: p.y }], [{ x: p.x + 50, y: p.y }, { x: p.x + 75, y: p.y }]]);
  await frame(page);
  const v1 = await viewOf(page, cfg);
  near(v1.s / v0.s, 1.5, 0.02, `${cfg.what}: zoomed by the pinch`);
  const a = under(v0, p), b = under(v1, p);
  near(b.x, a.x, 2 / v1.s, `${cfg.what}: the point under the fingers kept (x)`);
  near(b.y, a.y, 2 / v1.s, `${cfg.what}: the point under the fingers kept (y)`);
}

// Safari's events at the client point p, on the element there, in order (#4296): ['start'] / ['change', scale] / ['end'],
// its gesture events (WebKit's GestureEvent, as a plain event with its scale and pointer); ['wheel', deltaY], a Ctrl +
// wheel; ['down' | 'move' | 'up', finger, x, y], a finger's pointer event on the screen (iPadOS), ['touch', type, n] its
// touch event, n fingers down. Returns the gesture events not prevented (the page zoomed).
const safari = (page, p, evs) => page.eval((p, evs) => {
  let at = document.elementFromPoint(p.x, p.y);
  const fingers = [], target = () => (at.isConnected ? at : (at = document.elementFromPoint(p.x, p.y)));
  // (the fingers' pointers are the page's, not the browser's: none it can capture)
  const capture = Element.prototype.setPointerCapture, release = Element.prototype.releasePointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { capture.call(this, id); } catch {} };
  Element.prototype.releasePointerCapture = function (id) { try { release.call(this, id); } catch {} };
  const props = (e, o) => { for (const [k, v] of Object.entries(o)) Object.defineProperty(e, k, { value: v }); return e; };
  let free = 0;
  try {
  for (const [what, a, b, c] of evs) {
    if (what === 'wheel') target().dispatchEvent(new WheelEvent('wheel', { deltaY: a, ctrlKey: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    else if (what === 'touch') target().dispatchEvent(props(new Event(a, { bubbles: true, cancelable: true }), { touches: { length: b } }));
    else if (['down', 'move', 'up'].includes(what)) {
      if (what === 'down') fingers[a] = document.elementFromPoint(b, c);
      const down = what !== 'up';
      (fingers[a].isConnected ? fingers[a] : document.elementFromPoint(b, c)).dispatchEvent(new PointerEvent(`pointer${what}`, { bubbles: true, cancelable: true, composed: true, view: window, pointerId: 201 + a, pointerType: 'touch', isPrimary: a === 0, clientX: b, clientY: c, button: what === 'move' ? -1 : 0, buttons: down ? 1 : 0, width: 1, height: 1, pressure: down ? 0.5 : 0 }));
    } else {
      const e = props(new Event(`gesture${what}`, { bubbles: true, cancelable: true }), { scale: what === 'change' ? a : 1, rotation: 0, clientX: p.x, clientY: p.y });
      target().dispatchEvent(e);
      if (!e.defaultPrevented) free++;
    }
  }
  } finally { Element.prototype.setPointerCapture = capture; Element.prototype.releasePointerCapture = release; }
  return free;
}, p, evs);
async function safariZoomed(page, cfg, p, evs, f, what) {
  const v0 = await viewOf(page, cfg);
  assert.equal(await safari(page, p, evs), 0, `${cfg.what}: ${what}, the page not zoomed (every gesture event prevented)`);
  await frame(page);
  const v1 = await viewOf(page, cfg);
  near(v1.s / v0.s, f, 2e-3, `${cfg.what}: ${what}, zoomed by ${f.toFixed(4)}`);
  const a = under(v0, p), b = under(v1, p);
  near(b.x, a.x, 2 / v1.s, `${cfg.what}: ${what}, the point under the pointer kept (x)`);
  near(b.y, a.y, 2 / v1.s, `${cfg.what}: ${what}, the point under the pointer kept (y)`);
}
// Safari's pinches (#4296): macOS's trackpad (gesture events only); with a Ctrl + wheel too, the first to come zooms, once;
// iPadOS's two fingers (pointer, touch and gesture events): twoFingerView's zoom (75 → 50 px apart: by 2/3), once
async function safariPinches(page, cfg, p) {
  await safariZoomed(page, cfg, p, [['start'], ['change', 1.1], ['change', 1.18], ['change', 1.25], ['end']], 1.25, 'Safari\'s trackpad pinch');
  await safariZoomed(page, cfg, p, [['start'], ['change', 0.8], ['wheel', 10], ['change', 0.6], ['wheel', 5], ['end']], 0.6, 'Safari\'s pinch out with Ctrl + wheels too');
  await safariZoomed(page, cfg, p, [['start'], ['wheel', -4], ['change', 1.3], ['wheel', -4], ['change', 1.5], ['end']], Math.exp(0.08), 'a Ctrl + wheel first, gesture events too');
  const evs = [['down', 0, p.x - 75, p.y], ['touch', 'touchstart', 1], ['down', 1, p.x + 75, p.y], ['touch', 'touchstart', 2], ['start']];
  for (let i = 1; i <= 8; i++) {
    const d = 75 - 25 * i / 8;
    evs.push(['move', 0, p.x - d, p.y], ['move', 1, p.x + d, p.y], ['change', d / 75]);
  }
  evs.push(['up', 0, p.x - 50, p.y], ['touch', 'touchend', 1], ['end'], ['up', 1, p.x + 50, p.y], ['touch', 'touchend', 0]);
  await safariZoomed(page, cfg, p, evs, 2 / 3, 'iPadOS\'s two-finger pinch');
}

// every gesture on one drawing (cfg: what, kind, svg, vp, item, selected, limits [min, max] or null, space, middle)
async function gestures(page, cfg) {
  const c = center(await rectOf(page, cfg.svg));
  const p = { x: c.x + 17, y: c.y - 11 };
  // the view as the editor first fits it (once it has its size)
  let v = null;
  for (let i = 0; i < 60; i++) {
    const w = await viewOf(page, cfg);
    if (v && w.s === v.s && w.ox === v.ox && w.oy === v.oy) break;
    v = w;
    await new Promise((r) => setTimeout(r, 50));
  }
  // (the symbol larger than its frame, scrolled to its top left corner: its left pins in view, dragged up and left)
  if (cfg.kind === 'symbol') { await wheel(page, c, { deltaY: -60, ctrlKey: true }); await page.eval((s) => { const w = document.querySelector(s).parentElement; w.scrollLeft = 0; w.scrollTop = 0; }, cfg.svg); await frame(page); }
  // the drags first, the items in view as they were drawn
  if (cfg.space) await dragPan(page, cfg, 'space');
  if (cfg.middle) await dragPan(page, cfg, 'middle');
  // a trackpad's pinch, a small one and the other way: as smooth as the fingers (the factor of the distance, not a step)
  await zoomedBy(page, cfg, p, { deltaY: -4, ctrlKey: true }, Math.exp(0.04), 'a small pinch (Ctrl + wheel)');
  await zoomedBy(page, cfg, p, { deltaY: 2.5, ctrlKey: true }, Math.exp(-0.025), 'a smaller pinch out');
  // a mouse's notch, Cmd's wheel
  await zoomedBy(page, cfg, p, { deltaY: -100 }, Math.exp(0.15), 'a notch of the wheel');
  await zoomedBy(page, cfg, p, { deltaY: 100, metaKey: true }, Math.exp(-0.15), 'Cmd + wheel');
  // a trackpad's scroll: the view panned, the other way; Shift: across
  await pannedBy(page, cfg, p, { deltaX: 6.5, deltaY: 11.5 }, -6.5, -11.5, 'a trackpad\'s scroll');
  await pannedBy(page, cfg, p, { deltaY: 30, shiftKey: true }, -30, 0, 'Shift + wheel');
  // two fingers on a touch screen
  await pinch(page, cfg, p);
  // Safari's pinch (the symbol: about a point of its frame, the drawing larger than it now)
  const q = cfg.kind === 'symbol' ? center(await page.eval((s) => { const r = document.querySelector(s).parentElement.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, cfg.svg)) : p;
  await safariPinches(page, cfg, q);
  // the limits: zoomed in, then out, as far as it goes
  for (let i = 0; i < 40; i++) await wheel(page, c, { deltaY: -100, ctrlKey: true });
  const max = (await viewOf(page, cfg)).s;
  await wheel(page, c, { deltaY: -100, ctrlKey: true });
  assert.equal((await viewOf(page, cfg)).s, max, `${cfg.what}: no further in`);
  for (let i = 0; i < 80; i++) await wheel(page, c, { deltaY: 100, ctrlKey: true });
  const min = (await viewOf(page, cfg)).s;
  await wheel(page, c, { deltaY: 100, ctrlKey: true });
  assert.equal((await viewOf(page, cfg)).s, min, `${cfg.what}: no further out`);
  assert.ok(min > 0 && min < max, `${cfg.what}: ${min} < ${max}`);
  if (cfg.limits) { near(min, cfg.limits[0], 1e-6, `${cfg.what}: the zoom's least`); near(max, cfg.limits[1], 1e-6, `${cfg.what}: the zoom's most`); }
}

uiTest('#4291 the editors\' view gestures are the schematic\'s: smooth wheel and pinch zoom about the pointer, trackpad pan, two fingers, Safari\'s pinch (#4296), Space and the middle button pan, within the zoom\'s limits (schematic, circuit, ASM chart, state diagram, Petri net)', E, async (page) => {
  const doc = newDoc('vg', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 200, y: 120, rot: 0, mirror: false, name: 'XLXI_1', params: { width: 1 } });
  await makeProject(env, { name: 'ViewGestures', top: '', files: {
    'src/vg.sch.json': JSON.stringify(doc),
    'src/half_adder.circ.json': JSON.stringify(halfAdder()),
    'src/ctl.asm.json': JSON.stringify(newModel('ctl', 'vhdl')),
    'src/det.fsm.json': JSON.stringify(newFsm('det')),
    'src/pn.pn.json': JSON.stringify(newPetri('pn', 'vhdl')),
  } });
  await page.openProject('ViewGestures');

  await page.eval(() => window.SilinxApp.openSch('src/vg.sch.json'));
  const SE = `${D} .sch-editor`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 5, [`${SE} svg .sym[data-id=S1]`], { what: 'the schematic' });
  await gestures(page, { what: 'schematic', kind: 'transform', svg: `${SE} .se-canvas svg`, vp: `${SE} .se-vp`, item: `${SE} svg .sym[data-id=S1]`, selected: `${SE} svg .sym.sel`, limits: [0.08, 6], space: true, middle: true });

  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  const CE = `${D} .circuit-editor`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 5, [`${CE} [data-id=BB1]`], { what: 'the circuit' });
  await gestures(page, { what: 'circuit', kind: 'transform', svg: `${CE} .circ-canvas`, vp: `${CE} .circ-world`, item: `${CE} .circ-world [data-id]`, selected: `${CE} .circ-world .sel`, limits: [0.2, 4], space: true, middle: true });

  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  const AE = `${D} .asm-editor`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 10, [`${AE} [data-node=s1]`], { what: 'the ASM chart' });
  await gestures(page, { what: 'ASM chart', kind: 'transform', svg: `${AE} .asm-canvas`, vp: `${AE} .asm-vp`, item: `${AE} [data-node=s1]`, selected: `${AE} [data-node].sel`, limits: [0.2, 4], space: true, middle: true });

  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  const FE = `${D} .fsm-editor`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 10, [`${FE} [data-state=s1] .fsm-circle`], { what: 'the state diagram' });
  await gestures(page, { what: 'state diagram', kind: 'transform', svg: `${FE} .fsm-canvas`, vp: `${FE} .fsm-vp`, item: `${FE} [data-state=s1] .fsm-circle`, selected: `${FE} .fsm-state.sel`, limits: [0.2, 4], space: true, middle: true });

  await page.eval(() => window.SilinxApp.openPetri('src/pn.pn.json'));
  const PE = `${D} .petri-editor`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 10, [`${PE} .pn-place .pn-circle`], { what: 'the Petri net' });
  await gestures(page, { what: 'Petri net', kind: 'transform', svg: `${PE} .pn-canvas`, vp: `${PE} .pn-world`, item: `${PE} .pn-place .pn-circle`, selected: `${PE} .pn-world .sel`, limits: [0.25, 4], space: true, middle: true });
  assert.deepEqual(warnings(page), []);
});

uiTest('#4291 the symbol editor and the RTL schematic viewer have the schematic\'s view gestures too, Safari\'s pinch included (mounted alone)', E, async (page) => {
  await page.eval(async () => {
    const { mountSymbolEditor } = await import('/js/symbol-editor.js');
    const { mountSchematic } = await import('/js/schematic-view.js');
    const { compile, elaborate } = await import('/core/compile.js');
    const { buildSchematic } = await import('/core/schematic.js');
    const host = (top) => {
      const el = document.createElement('div');
      el.style.cssText = `position: fixed; left: 0; top: ${top}px; width: 700px; height: 420px; z-index: 9999; background: white; display: flex`;
      document.body.append(el);
      return el;
    };
    const sy = host(0); sy.id = 'vg-sym';
    mountSymbolEditor(sy, { module: { name: 'm', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }] } });
    const rv = host(430); rv.id = 'vg-rtl';
    const text = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (a, b : in std_logic; y : out std_logic); end top;\narchitecture rtl of top is begin y <= a and b; end rtl;\n';
    await mountSchematic(rv, {}).show(buildSchematic(elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text }]), 'top').top), { title: 'top' });
  });
  await page.waitFor(() => document.querySelector('#vg-sym .sy-pin') && document.querySelector('#vg-rtl [data-node]'), [], { what: 'both drawn' });
  await new Promise((r) => setTimeout(r, 500));   // (their first fit)
  await gestures(page, { what: 'symbol editor', kind: 'symbol', svg: '#vg-sym .sy-svg', item: '#vg-sym .sy-pin', selected: '#vg-sym .sy-pin.sel', limits: [0.5, 8], space: true, middle: true, drag: { x: -40, y: -30 } });
  await gestures(page, { what: 'RTL schematic', kind: 'transform', svg: '#vg-rtl .sch-svg', vp: '#vg-rtl .sch-vp', item: '#vg-rtl [data-node]', limits: [0.02, 8], middle: true });
  assert.deepEqual(warnings(page), []);
});

// a placed and routed design for the FPGA view (the XDL fixture, as the 'fpgaview' step of ISE writes it)
const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  signal q : std_logic;
begin
  u1: entity work.sub port map (clk => clk, a => a, q => q);
  y <= a or q;
end rtl;
`;
const SUB = `library ieee; use ieee.std_logic_1164.all;
entity sub is port (clk, a : in std_logic; q : out std_logic); end sub;
architecture rtl of sub is
  signal r : std_logic := '1';
begin
  process (clk) begin if rising_edge(clk) then r <= a and not r; end if; end process;
  q <= r;
end rtl;
`;

uiTest('#4291 the FPGA view has the schematic\'s view gestures: smooth wheel and pinch zoom, trackpad pan, two fingers, Safari\'s pinch (#4296), the middle button', E, async (page) => {
  const name = 'ViewGesturesFpga';
  await makeProject(env, { name, files: { 'src/top.vhd': TOP, 'src/sub.vhd': SUB }, top: 'top' });
  const build = path.join(env.server.workspace, name, 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', f), path.join(build, f));
  await page.openProject(name);
  await page.menu('Tools', 'Implemented Design (FPGA View)');
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view open' });
  const V = `${D} .fv`;
  await gestures(page, { what: 'FPGA view', kind: 'viewBox', svg: `${V} .fv-canvas svg`, item: `${V} .fv-site`, middle: true });
  assert.deepEqual(warnings(page), []);
});

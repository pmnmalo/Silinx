// A drawing's view gestures (web/js/canvas-gestures.js, #4291): the wheel's zoom and pan, as the schematic editor's
// sch-mouse.js had them (its onWheel, the reference below, copied from main before the move).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelGesture, wheelView } from '../web/js/canvas-gestures.js';

// the schematic editor's wheel before the move, on a view { tx, ty, s }: the reference
function reference(e, view) {
  let zoom = null;
  if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 1 && e.deltaMode !== 0) || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)) {
    zoom = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
  } else {
    view.tx -= e.shiftKey ? e.deltaY : e.deltaX; view.ty -= e.shiftKey ? 0 : e.deltaY;
  }
  return zoom;
}
const wheel = (o) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, clientX: 10, clientY: 20, ...o });

test('the wheel: every kind of wheel event does what the schematic editor did with it', () => {
  const cases = [
    { deltaY: 100 }, { deltaY: -100 }, { deltaY: 53 }, { deltaY: -120 },      // a mouse's notches (pixels, 50 or more)
    { deltaY: 3, deltaMode: 1 }, { deltaY: -1, deltaMode: 1 },               // a mouse's lines (Firefox)
    { deltaY: 4.5 }, { deltaY: -12 }, { deltaY: 30 }, { deltaX: 7, deltaY: 2 }, // a trackpad's scroll
    { deltaX: -20, deltaY: 60 },                                              // a diagonal scroll, a notch's size: a pan
    { deltaY: 4.2, ctrlKey: true }, { deltaY: -9, ctrlKey: true },          // a trackpad's pinch (Ctrl)
    { deltaY: 100, metaKey: true }, { deltaY: 100, shiftKey: true }, { deltaY: 3, deltaMode: 1, shiftKey: true },
    { deltaY: 0 }, { deltaX: 0.5, deltaY: 0.5 },
  ];
  for (const c of cases) {
    const e = wheel(c), ref = { tx: 0, ty: 0 };
    const zoom = reference(e, ref);
    const g = wheelGesture(e);
    if (zoom != null) assert.equal(g.zoom, zoom, JSON.stringify(c));
    else { assert.equal(g.zoom, undefined, JSON.stringify(c)); assert.ok(Object.is(g.pan[0] + 0, ref.tx + 0) && g.pan[1] + 0 === ref.ty + 0, JSON.stringify(c)); }
  }
});

test('the wheel zooms smoothly: the factor follows the wheel distance, never a fixed step', () => {
  const f = (d, o) => wheelGesture(wheel({ deltaY: d, ...o })).zoom;
  // a pinch: twice the spread, twice the zoom (in its logarithm); in and out the same amount undo each other
  assert.ok(Math.abs(Math.log(f(-8, { ctrlKey: true })) - 2 * Math.log(f(-4, { ctrlKey: true }))) < 1e-12);
  assert.ok(Math.abs(f(5, { ctrlKey: true }) * f(-5, { ctrlKey: true }) - 1) < 1e-12);
  assert.ok(f(-1, { ctrlKey: true }) > 1 && f(-1, { ctrlKey: true }) < 1.02, 'a small pinch: a small zoom');
  assert.ok(f(-100) > 1 && f(100) < 1, 'the wheel up zooms in, down out');
  assert.ok(Math.abs(f(100) - Math.exp(-0.15)) < 1e-12);
});

test('wheelView: the page kept (preventDefault), the zoom about the pointer or the pan given', () => {
  const calls = [];
  let prevented = 0;
  const run = (o) => wheelView({ ...wheel(o), preventDefault: () => { prevented++; } }, { zoom: (...a) => calls.push(['zoom', ...a]), pan: (...a) => calls.push(['pan', ...a]) });
  run({ deltaY: -2, ctrlKey: true, clientX: 33, clientY: 44 });
  run({ deltaX: 5, deltaY: 7 });
  run({ deltaY: 9, shiftKey: true });
  assert.equal(prevented, 3);
  assert.deepEqual(calls, [['zoom', Math.exp(0.02), 33, 44], ['pan', -5, -7], ['pan', -9, -0]]);
});

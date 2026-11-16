// A drawing's view gestures (web/js/canvas-gestures.js, #4291): the wheel's zoom and pan, as the schematic editor's
// sch-mouse.js had them (its onWheel, the reference below, copied from main before the move); Safari's pinch, its
// gesture events (#4296).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelGesture, wheelView, safariPinch } from '../web/js/canvas-gestures.js';

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

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-12, `${what || 'near'}: ${a} is not ${b}`);
// Safari's gesture events (#4296): an event of `type` with its scale and pointer; ev.prevented once preventDefault'ed
const gev = (o = {}) => { const e = { clientX: 30, clientY: 40, prevented: false, ...o }; e.preventDefault = () => { e.prevented = true; }; return e; };
const pinchOf = (o = {}) => {
  const zooms = [];
  const p = safariPinch({ zoom: (...a) => zooms.push(a), ...o });
  return { p, zooms, total: () => zooms.reduce((t, [f]) => t * f, 1) };
};

test('Safari\'s pinch: each gesturechange zooms by its scale over the last one, about the pointer; the page kept', () => {
  const { p, zooms, total } = pinchOf();
  const evs = [gev(), gev({ scale: 1.1 }), gev({ scale: 1.25, clientX: 31 }), gev({ scale: 1.25 }), gev({ scale: 1.2 }), gev({ scale: 1.2 })];
  p.start(evs[0]);
  for (const e of evs.slice(1, 5)) p.change(e);
  p.end(evs[5]);
  assert.ok(evs.every((e) => e.prevented), 'every event prevented (not the page zoomed)');
  assert.equal(zooms.length, 3, 'a change of no scale zooms nothing');
  near(zooms[0][0], 1.1); near(zooms[1][0], 1.25 / 1.1); near(zooms[2][0], 1.2 / 1.25);
  near(total(), 1.2, 'the zoom of the whole gesture: its last scale');
  assert.deepEqual(zooms.map((z) => z.slice(1)), [[30, 40], [31, 40], [30, 40]]);
  // a second gesture starts again from 1
  p.start(gev()); p.change(gev({ scale: 0.5 })); p.end(gev());
  near(zooms[3][0], 0.5);
  // pinched in then out as far: the view as it was
  const b = pinchOf();
  b.p.start(gev()); for (const s of [1.3, 1.7, 1.2, 0.9, 1]) b.p.change(gev({ scale: s })); b.p.end(gev());
  near(b.total(), 1, 'in and out undo each other');
});

test('Safari\'s pinch: about at() when the event has no pointer; a change with no gesturestart; scales not positive ignored', () => {
  const { p, zooms } = pinchOf({ at: () => [7, 8] });
  p.change(gev({ scale: 2, clientX: undefined, clientY: undefined }));
  p.change(gev({ scale: 0 })); p.change(gev({ scale: -1 })); p.change(gev({ scale: NaN })); p.change(gev({ scale: Infinity })); p.change(gev({}));
  p.change(gev({ scale: 3 }));
  p.end(gev());
  assert.deepEqual(zooms, [[2, 7, 8], [1.5, 30, 40]]);
});

test('Safari\'s pinch with a Ctrl + wheel too: zoomed once, by the first of them to come in the gesture', () => {
  // the gesture first: its Ctrl + wheels dropped (prevented, not zoomed); a wheel outside a gesture is the wheel's
  const a = pinchOf();
  a.p.start(gev());
  a.p.change(gev({ scale: 1.2 }));
  const w = gev({ ctrlKey: true, deltaY: -10 });
  assert.equal(a.p.wheel(w), true); assert.ok(w.prevented);
  a.p.change(gev({ scale: 1.5 }));
  assert.equal(a.p.wheel(gev({ ctrlKey: true, deltaY: -5 })), true);
  a.p.end(gev());
  near(a.total(), 1.5);
  assert.equal(a.p.wheel(gev({ ctrlKey: true, deltaY: -5 })), false, 'after the gesture: the wheel\'s');
  // the wheel first: the gesture's changes zoom nothing
  const b = pinchOf();
  b.p.start(gev());
  assert.equal(b.p.wheel(gev({ ctrlKey: true, deltaY: -4 })), false);
  const c = gev({ scale: 1.3 });
  b.p.change(c);
  assert.ok(c.prevented, 'still not the page zoomed');
  assert.equal(b.p.wheel(gev({ ctrlKey: true, deltaY: -4 })), false);
  b.p.end(gev());
  assert.deepEqual(b.zooms, []);
  // a wheel with no Ctrl in a gesture (a scroll): the wheel's, and the gesture still zooms
  const d = pinchOf();
  d.p.start(gev());
  assert.equal(d.p.wheel(gev({ deltaY: 3 })), false);
  d.p.change(gev({ scale: 1.1 }));
  near(d.total(), 1.1);
});

test('Safari\'s pinch on iPadOS: two fingers on the screen are twoFingerView\'s, zoomed once; its trackpad\'s pinch zooms', () => {
  let touching = true;
  const { p, zooms } = pinchOf({ touching: () => touching });
  const evs = [gev(), gev({ scale: 1.2 }), gev({ scale: 1.5 }), gev()];
  p.start(evs[0]); p.change(evs[1]); p.change(evs[2]); p.end(evs[3]);
  assert.deepEqual(zooms, [], 'the fingers\' gesture events zoom nothing');
  assert.ok(evs.every((e) => e.prevented), 'nor the page');
  assert.equal(p.wheel(gev({ ctrlKey: true })), false, 'after it: the wheel\'s');
  // the fingers down after gesturestart: from then on twoFingerView's
  touching = false;
  p.start(gev()); p.change(gev({ scale: 1.1 }));
  touching = true;
  p.change(gev({ scale: 1.4 }));
  p.end(gev());
  assert.equal(zooms.length, 1, 'fingers down in a trackpad\'s pinch: from then on theirs');
  near(zooms[0][0], 1.1);
  touching = false;
  p.start(gev()); touching = true; p.change(gev({ scale: 1.2 })); p.end(gev());
  assert.equal(zooms.length, 1, 'fingers down before its first change: none');
  // a trackpad's pinch (no finger on the screen)
  touching = false;
  p.start(gev()); p.change(gev({ scale: 2 })); p.end(gev());
  near(zooms.at(-1)[0], 2);
});

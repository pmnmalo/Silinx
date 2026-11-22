// web/js/when-hidden.js (#5276): the When hidden setting (Pause by default, Keep running remembered), the watcher of
// an element's visibility (the page's, its document tab's: an IntersectionObserver), the interval held while not seen
// (no backlog: a fresh interval when seen again) and the next frame (a timer while the page is hidden).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// a page: its document (hidden or not, its visibilitychange), localStorage, the IntersectionObservers, timers counted
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const docListeners = new Set();
let hidden = false;
globalThis.document = {
  get hidden() { return hidden; },
  addEventListener: (t, f) => { if (t === 'visibilitychange') docListeners.add(f); },
  removeEventListener: (t, f) => { if (t === 'visibilitychange') docListeners.delete(f); },
};
const winListeners = new Map();
globalThis.addEventListener = (t, f) => { if (!winListeners.has(t)) winListeners.set(t, new Set()); winListeners.get(t).add(f); };
globalThis.removeEventListener = (t, f) => winListeners.get(t)?.delete(f);
globalThis.dispatchEvent = (e) => { for (const f of [...(winListeners.get(e.type) || [])]) f(e); return true; };
const observers = new Set();
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; this.els = []; }
  observe(el) { this.els.push(el); observers.add(this); }
  disconnect() { observers.delete(this); }
};
const setHidden = (v) => { hidden = v; for (const f of [...docListeners]) f(); };
const setInView = (el, v) => { for (const o of [...observers]) if (o.els.includes(el)) o.cb([{ isIntersecting: v }]); };
const listeners = () => docListeners.size + [...winListeners.values()].reduce((n, s) => n + s.size, 0) + observers.size;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { HIDDEN_KEY, hiddenPref, setHiddenPref, watchSeen, intervalWhileSeen, nextFrame } = await import('../web/js/when-hidden.js');

beforeEach(() => { store.clear(); hidden = false; });

test('the When hidden setting: Pause by default, Keep running remembered, the Board Emulator\'s key; anything else is Pause', () => {
  assert.equal(HIDDEN_KEY, 'silinx.emulator.hidden');
  assert.equal(hiddenPref(), 'pause');
  setHiddenPref('run');
  assert.equal(store.get(HIDDEN_KEY), 'run');
  assert.equal(hiddenPref(), 'run');
  setHiddenPref('pause');
  assert.equal(hiddenPref(), 'pause');
  store.set(HIDDEN_KEY, 'bogus');
  assert.equal(hiddenPref(), 'pause');
  setHiddenPref('bogus');
  assert.equal(store.get(HIDDEN_KEY), 'pause');
  // (localStorage refused: Pause)
  const ls = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  try { assert.equal(hiddenPref(), 'pause'); setHiddenPref('run'); assert.equal(hiddenPref(), 'pause'); } finally { globalThis.localStorage = ls; }
});

test('watchSeen: shown while the page is visible and the element in view; held only with Pause; told of every change; destroy removes its listeners', () => {
  const el = {}, n0 = listeners();
  let calls = 0;
  const w = watchSeen(el, () => { calls++; });
  assert.deepEqual([w.shown(), w.held()], [true, false]);
  setInView(el, false);
  assert.deepEqual([w.shown(), w.held(), calls], [false, true, 1], 'another document tab');
  setInView(el, true);
  setHidden(true);
  assert.deepEqual([w.shown(), w.held(), calls], [false, true, 3], 'the page hidden');
  setHiddenPref('run');
  assert.deepEqual([w.shown(), w.held(), calls], [false, false, 4], 'Keep running: not held, told');
  // (another window changed it: the storage event)
  store.set(HIDDEN_KEY, 'pause');
  globalThis.dispatchEvent(Object.assign(new Event('storage'), { key: HIDDEN_KEY }));
  globalThis.dispatchEvent(Object.assign(new Event('storage'), { key: 'other' }));
  assert.deepEqual([w.held(), calls], [true, 5]);
  setHidden(false);
  assert.deepEqual([w.shown(), w.held(), calls], [true, false, 6]);
  w.destroy();
  assert.equal(listeners(), n0, 'no listener left');
  setHidden(true);
  assert.equal(calls, 6, 'none told once destroyed');
});

test('watchSeen with no IntersectionObserver: the page\'s visibility only', () => {
  const io = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    const w = watchSeen({});
    assert.equal(w.shown(), true);
    setHidden(true);
    assert.equal(w.held(), true);
    w.destroy();
  } finally { globalThis.IntersectionObserver = io; }
});

test('intervalWhileSeen: every ms while seen, none while held, a fresh interval when seen again (no burst); Keep running ticks on; stop', async () => {
  const el = {}, n0 = listeners();
  let n = 0;
  const r = intervalWhileSeen(el, 20, () => { n++; });
  await sleep(110);
  assert.ok(n >= 3 && n <= 6, `${n} ticks in 110 ms`);
  setInView(el, false);
  assert.equal(r.held(), true);
  const k = n;
  await sleep(150);
  assert.equal(n, k, 'held: no tick');
  setInView(el, true);
  assert.equal(n, k, 'seen again: no tick at once (the time held not caught up)');
  await sleep(10);
  assert.equal(n, k, 'its next tick a whole period later');
  await sleep(60);
  assert.ok(n > k && n <= k + 4, `${n - k} ticks once seen again`);
  setHiddenPref('run');
  setHidden(true);
  assert.equal(r.held(), false);
  const j = n;
  await sleep(80);
  assert.ok(n > j, 'Keep running: it ticks on while hidden');
  setHiddenPref('pause');
  const i = n;
  await sleep(80);
  assert.equal(n, i, 'Pause again: held at once');
  setHidden(false);
  r.stop();
  const s = n;
  await sleep(80);
  assert.equal(n, s, 'stopped');
  assert.equal(listeners(), n0, 'no listener left');
  setInView(el, false); setInView(el, true);
  await sleep(40);
  assert.equal(n, s, 'stopped: not started again when seen');
});

test('nextFrame: an animation frame while the page is visible, a timer while it is hidden; cancel', async () => {
  const raf = [], cancelled = [];
  globalThis.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
  globalThis.cancelAnimationFrame = (id) => cancelled.push(id);
  try {
    let got = null;
    const c = nextFrame((t) => { got = t; });
    assert.equal(raf.length, 1);
    raf[0](123);
    assert.equal(got, 123);
    nextFrame(() => {})();
    assert.deepEqual(cancelled, [2]);
    setHidden(true);
    got = null;
    nextFrame((t) => { got = t; });
    assert.equal(raf.length, 2, 'hidden: no animation frame');
    await sleep(30);
    assert.equal(typeof got, 'number', 'hidden: a timer');
    got = null;
    nextFrame((t) => { got = t; })();
    await sleep(30);
    assert.equal(got, null, 'cancelled');
    c();
  } finally { delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; setHidden(false); }
});

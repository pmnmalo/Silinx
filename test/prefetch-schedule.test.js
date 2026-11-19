// When the browser edition downloads what Implement needs in the background (web/js/prefetch-schedule.js, #4628): after the
// page's load event, a delay, and the browser idle; never on a metered or slow connection; cancelled by another opening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterOpening, PREFETCH_DELAY, PREFETCH_SPREAD } from '../web/js/prefetch-schedule.js';

// a window whose events, timers and idle callbacks run when the test says
function fakeWindow({ readyState = 'loading', idle = true, connection } = {}) {
  const w = { log: [], timers: [], idles: [], listeners: {}, document: { readyState }, navigator: { connection } };
  w.addEventListener = (type, f) => { (w.listeners[type] ||= []).push(f); w.log.push(`listen ${type}`); };
  let ids = 0;
  w.setTimeout = (f, ms) => { w.timers.push({ f, ms, id: ++ids }); w.log.push(`timeout ${ms}`); return ids; };
  w.clearTimeout = id => { const t = w.timers.find(x => x.id === id); if (t) t.f = null; w.log.push('cleared'); };
  if (idle) w.requestIdleCallback = (f, o) => { w.idles.push(f); w.log.push(`idle ${o.timeout}`); };
  w.fire = type => { for (const f of w.listeners[type] || []) f(); };
  w.tick = () => { const t = w.timers.shift(); t?.f?.(); };
  w.idleNow = () => { const f = w.idles.shift(); f?.(); };
  return w;
}

test('#4628 afterOpening: nothing while the page loads; its load event, the delay, then the browser idle; then once', () => {
  const w = fakeWindow();
  let n = 0;
  afterOpening(() => n++, { win: w, delay: 15000 });
  assert.deepEqual(w.log, ['listen load']);
  assert.equal(n, 0);
  w.fire('load');
  assert.deepEqual(w.log, ['listen load', 'timeout 15000']);
  assert.equal(n, 0, 'not before the delay');
  w.tick();
  assert.deepEqual(w.log, ['listen load', 'timeout 15000', 'idle 10000']);
  assert.equal(n, 0, 'not before the browser is idle');
  w.idleNow();
  assert.equal(n, 1);
});

test('#4628 afterOpening: a page already loaded waits for the delay only; no requestIdleCallback (Safari): a moment later', () => {
  const w = fakeWindow({ readyState: 'complete', idle: false });
  let n = 0;
  afterOpening(() => n++, { win: w, delay: 0 });
  assert.deepEqual(w.log, ['timeout 0']);
  w.tick();
  assert.deepEqual(w.log, ['timeout 0', 'timeout 200']);
  assert.equal(n, 0);
  w.tick();
  assert.equal(n, 1);
});

test('#4628 afterOpening: never on a metered or slow connection (Save-Data, 2G/3G, cellular); a 4G or Wi-Fi one downloads', () => {
  for (const [connection, runs] of [[{ saveData: true }, 0], [{ effectiveType: '3g' }, 0], [{ effectiveType: 'slow-2g' }, 0], [{ type: 'cellular' }, 0],
    [{ effectiveType: '4g', type: 'wifi' }, 1], [undefined, 1]]) {
    const w = fakeWindow({ readyState: 'complete', connection });
    let n = 0;
    afterOpening(() => n++, { win: w, delay: 1 });
    w.tick(); w.idleNow();
    assert.equal(n, runs, JSON.stringify(connection));
  }
});

test('#4628 afterOpening: cancelled (another project opened) before the load, the delay or the idle moment: nothing', () => {
  for (const stage of ['load', 'delay', 'idle']) {
    const w = fakeWindow();
    let n = 0;
    const cancel = afterOpening(() => n++, { win: w, delay: 5 });
    if (stage !== 'load') w.fire('load');
    if (stage === 'idle') w.tick();
    cancel();
    w.fire('load'); w.tick(); w.idleNow();
    assert.equal(n, 0, stage);
  }
});

test('#4628 afterOpening: the delay by default, PREFETCH_DELAY and up to PREFETCH_SPREAD more at random; SILINX_PREPARE_DELAY (the tests\') in its place', () => {
  assert.equal(PREFETCH_DELAY, 15000);
  assert.equal(PREFETCH_SPREAD, 30000);
  const delays = [];
  for (let i = 0; i < 50; i++) {
    const w = fakeWindow({ readyState: 'complete' });
    afterOpening(() => {}, { win: w });
    delays.push(w.timers[0].ms);
  }
  assert.ok(delays.every(d => d >= PREFETCH_DELAY && d < PREFETCH_DELAY + PREFETCH_SPREAD), delays.join(' '));
  assert.ok(new Set(delays).size > 1, 'spread');
  const w = fakeWindow({ readyState: 'complete' });
  w.SILINX_PREPARE_DELAY = 7;
  afterOpening(() => {}, { win: w });
  assert.equal(w.timers[0].ms, 7);
});

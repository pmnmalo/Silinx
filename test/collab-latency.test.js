// The latency benchmark of a shared project (#4647, scripts/collab-latency-lib.mjs), short: its summary, its delay (a
// round trip added, half each way, the messages' order kept), and its key numbers under a threshold on each path, with
// no delay: a keystroke and a drawing's edit a few ms (no timer between the owner's change and the follower's
// document), the owner's cursor moved and its activity within a frame and the owner's pace (they waited for the
// page's look every 300 ms and a view every 250 ms: 140 ms and more, 300 ms at worst); with 40 ms of round trip, the
// delay on top, once per hop. And each stage's cost, on its own, measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
import { measure, stages, summary, delayed, PACES, PATHS, CASES } from '../scripts/collab-latency-lib.mjs';
import { SOON_MS, OWNER_VIEW_MS } from '../core/collab-pace.js';

test('summary(): the median, the 95th percentile, the largest, in 0.1 ms', () => {
  assert.deepEqual(summary([3, 1, 2]), { n: 3, median: 2, p95: 3, max: 3 });
  assert.deepEqual(summary(Array.from({ length: 100 }, (_, i) => i + 0.04)), { n: 100, median: 49, p95: 94, max: 99 });
  assert.deepEqual(summary([1.23456], 4), { n: 1, median: 1.2346, p95: 1.2346, max: 1.2346 });
  assert.deepEqual(PATHS, ['p2p', 'node', 'cloudflare']);
  assert.deepEqual(CASES, ['keystroke', 'drawing', 'cursor', 'editor', 'activity', 'paste', 'file']);
  assert.deepEqual(PACES.before, { track: 300, soon: null, owner: 250, view: 250 });
});

test('delayed(): a WebSocket whose messages go and come that much later, in their order; none: the class itself', async () => {
  assert.equal(delayed(WebSocket, 0), WebSocket);
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(r => wss.on('listening', r));
  wss.on('connection', ws => ws.on('message', d => ws.send(d)));
  try {
    const ws = new (delayed(WebSocket, 30))(`ws://127.0.0.1:${wss.address().port}`);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    assert.equal(ws.readyState, 1);
    const got = [];
    ws.addEventListener('message', e => got.push([String(e.data), performance.now()]));
    const t0 = performance.now();
    for (const m of ['a', 'b', 'c']) ws.send(m);
    while (got.length < 3) await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(got.map(g => g[0]), ['a', 'b', 'c']);
    assert.ok(got[0][1] - t0 >= 59, `a round trip of 60 ms at least (${got[0][1] - t0})`);
    ws.close();
    await new Promise(r => ws.addEventListener('close', r, { once: true }));
    assert.equal(ws.readyState, 3);
  } finally { wss.close(); }
});

test('on each path, no delay: a keystroke, a drawing\'s edit and an editor\'s keystroke in a few ms; the cursor and the activity within the owner\'s pace', async () => {
  for (const path of PATHS) {
    const r = await measure({ path, rtt: 0, cases: ['keystroke', 'drawing', 'editor', 'cursor', 'activity', 'file'], n: 10 });
    for (const c of ['keystroke', 'drawing', 'editor']) assert.ok(r[c].median < 15, `${path} ${c}: ${JSON.stringify(r[c])}`);
    assert.ok(r.file.median < 60, `${path} file: ${JSON.stringify(r.file)}`);
    // (a frame after the event, then at once: the views are 50 to 150 ms apart, more than OWNER_VIEW_MS; before #4647:
    // 140 ms and more)
    for (const c of ['cursor', 'activity']) assert.ok(r[c].median < SOON_MS + OWNER_VIEW_MS, `${path} ${c}: ${JSON.stringify(r[c])}`);
  }
});

test('with 40 ms of round trip: once per hop (p2p: one, a relay: two)', async () => {
  const p2p = await measure({ path: 'p2p', rtt: 40, cases: ['keystroke'], n: 5 });
  const relay = await measure({ path: 'node', rtt: 40, cases: ['keystroke'], n: 5 });
  // (Windows' timers tick every 15.6 ms: each hop's setTimeout of 20 ms takes up to 31; the scheduled CI's 68.8 ms, #4819)
  const tick = process.platform === 'win32' ? 16 : 0;
  assert.ok(p2p.keystroke.median >= 20 && p2p.keystroke.median < 40 + tick, JSON.stringify(p2p));
  assert.ok(relay.keystroke.median >= 40 && relay.keystroke.median < 60 + 2 * tick, JSON.stringify(relay));
});

test('the pace before #4647: the cursor waited for the page\'s look', async () => {
  const r = await measure({ path: 'node', rtt: 0, cases: ['cursor'], n: 12, pace: PACES.before });
  assert.ok(r.cursor.median > 60, JSON.stringify(r));
});

test('stages(): each case\'s update, its size and parts, and what each stage costs', async () => {
  const st = await stages(5);
  assert.deepEqual(Object.keys(st), ['keystroke', 'drawing', 'paste', 'file']);
  for (const [c, s] of Object.entries(st)) {
    assert.deepEqual(Object.keys(s), ['bytes', 'update', 'seal', 'open', 'sign', 'check', 'split', 'apply', 'parts'], c);
    for (const k of ['update', 'seal', 'open', 'sign', 'check', 'split', 'apply']) assert.ok(s[k] >= 0 && s[k] < 50, `${c} ${k}: ${s[k]}`);
  }
  assert.ok(st.keystroke.bytes < 64);
  assert.equal(st.keystroke.parts, 1);
  assert.ok(st.paste.bytes > 8192 && st.paste.parts === 1, 'a pasted piece: one part of a data channel');
  assert.ok(st.file.bytes > 512 << 10);
  assert.equal(st.file.parts, Math.ceil((st.file.bytes + 13 + 16) / ((16 << 10) - 2)), 'a large file: in 16 KB parts');
});

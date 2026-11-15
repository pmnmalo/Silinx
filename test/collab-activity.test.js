// A shared project's owner's activity (#4002, part 1): its frames (core/collab-activity.js), the channels a follower's
// page follows (core/collab-channels.js), and the protocol on the relay of Silinx's own server: the owner's activity
// reaches its followers, each channel's latest value is sent again to one that joins (and to every follower when the
// owner's room is resumed, #3835), an unchanged value is not sent again; a follower's or an editor's activity is refused
// by the relay (read only) and reaches nobody; past the limits, refused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { scratchEnv } from './server-helpers.js';
import { closable } from './server-close.js';
import { activityBytes, activityOf, activityStore, ACTIVITY_LIMITS } from '../core/collab-activity.js';
import { designActivity, followedDesign, followedUi, activityLines } from '../core/collab-channels.js';
import { encodeUi } from '../core/design-link.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';
import { shareRoom, followRoom, KIND } from '../core/collab-client.js';
import { relayUrl } from '../core/collab-link.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };

let tmp, srv, base, closeSrv;
before(async () => {
  tmp = await scratchEnv('silinx-collab-activity-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => { await closeSrv(); const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }); });

const FILES = { 'src/top.vhd': 'entity top is end;\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' }, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const share = (doc, o = {}) => shareRoom({ url: relayUrl(base, 'share'), token: 'the-token', doc, user: { name: 'Ana' }, ...o });
const follow = (owner, o = {}) => followRoom({ url: relayUrl(base, 'follow'), room: owner.room, key: owner.key, user: { name: 'Rui' }, ...o });

test('frames: a channel\'s value round trips; a bad channel, a value too large refused; bytes that are no activity read as none', () => {
  assert.deepEqual(activityOf(activityBytes('design', { sel: 'm:top', open: [] })), { ch: 'design', v: { sel: 'm:top', open: [] } });
  assert.deepEqual(activityOf(activityBytes('ui', undefined)), { ch: 'ui', v: null });
  assert.throws(() => activityBytes('Design', 1), /not an activity channel: 'Design'/);
  assert.throws(() => activityBytes('a'.repeat(17), 1), /not an activity channel/);
  assert.throws(() => activityBytes('ui', 'x'.repeat(ACTIVITY_LIMITS.value)), /the activity 'ui' is too large \(\d+ bytes, at most 1048576\)/);
  const t = s => new TextEncoder().encode(s);
  for (const bad of ['', 'nope', '[1]', '{"ch":"ui"}', '{"ch":"UI","v":1}', '{"ch":7,"v":1}']) assert.equal(activityOf(t(bad)), null, bad);
  assert.equal(activityOf(new Uint8Array([0xff, 0xfe])), null, 'not UTF-8');
  assert.equal(activityOf('{"ch":"ui","v":1}'), null, 'a string, not bytes');
});

test('store: a value kept by channel, an unchanged one not set again, the channels\' number capped', () => {
  const s = activityStore({ channels: 2 });
  assert.equal(s.get('ui'), null);
  assert.equal(s.set('ui', 'a'), true);
  assert.equal(s.set('ui', 'a'), false, 'unchanged');
  assert.equal(s.set('design', { sel: null, open: [] }), true);
  assert.equal(s.set('runs', 1), false, 'a third channel past the cap');
  assert.equal(s.set('ui', 'b'), true, 'a known channel still changes');
  assert.deepEqual(s.all(), [['ui', 'b'], ['design', { sel: null, open: [] }]]);
});

test('channels: the Design pane\'s state made and taken back; untrusted values left out where they are not one', () => {
  const d = designActivity('m:top', new Map([['project', true], ['m:top', false], ['', true], [5, true]]));
  assert.deepEqual(d, { sel: 'm:top', open: [['project', true], ['m:top', false]] });
  assert.deepEqual(followedDesign(d), d);
  assert.deepEqual(designActivity(null, null), { sel: null, open: [] });
  assert.deepEqual(followedDesign({ sel: 'x'.repeat(301), open: [['a', 'yes'], ['b', true], 'c', [7, true]] }), { sel: null, open: [['a', false], ['b', true]] });
  for (const bad of [null, 1, 'x', []]) assert.equal(followedDesign(bad), null);
  // (the `ui` channel: a design link's view, through its checks: a document of no kind left out, said)
  const ui = encodeUi({ open: ['file:src/top.vhd', 'isim:tb', 'bogus:x'], active: 'isim:tb', page: 'design', view: 'sim', split: null }, { task: 'sim', side: true, console: false, max: false });
  const u = followedUi(ui);
  assert.deepEqual(u.view, { open: ['file:src/top.vhd', 'isim:tb'], active: 'isim:tb', split: null, page: 'design', view: 'sim' });
  assert.deepEqual(u.layout, { task: 'sim', side: true, console: false, max: false });
  assert.equal(followedUi('not base64 !'), null);
  assert.equal(followedUi({ open: [] }), null);
  const get = ch => ({ ui, design: d })[ch] ?? null;
  assert.deepEqual(activityLines(get), [
    'The owner is in the Simulate task, the Simulation view, the design page.',
    'Their open documents: file:src/top.vhd, isim:tb (in front).',
    'Selected in their Design pane: m:top.',
  ]);
  assert.deepEqual(activityLines(() => null), []);
});

test('the owner\'s activity reaches its followers; one that joins gets each channel\'s latest value; an unchanged value is not sent again', async () => {
  const doc = owned();
  const owner = await share(doc);
  const evs = [];
  const fol = await follow(owner, { onEvent: e => { if (e.type === 'activity') evs.push(e.ch); } });
  await fol.ready;
  assert.equal(fol.activity('design'), null);
  assert.equal(owner.publish('design', { sel: 'm:top', open: [['m:top', true]] }), true);
  await until(() => fol.activity('design'), 'the activity');
  assert.deepEqual(fol.activity('design'), { sel: 'm:top', open: [['m:top', true]] });
  assert.equal(owner.publish('design', { sel: 'm:top', open: [['m:top', true]] }), false, 'unchanged: not sent');
  assert.equal(owner.publish('ui', 'abc'), true);
  await until(() => fol.activity('ui') === 'abc', 'the second channel');
  assert.deepEqual(evs, ['design', 'ui']);
  // (a newcomer: the latest value of each, after the project)
  owner.publish('design', { sel: 'm:other', open: [] });
  const late = await follow(owner, { user: { name: 'Eva' } });
  await late.ready;
  await until(() => late.activity('ui') === 'abc' && late.activity('design')?.sel === 'm:other', 'the newcomer\'s activity');
  await until(() => fol.activity('design')?.sel === 'm:other', 'the first follower\'s');
  assert.throws(() => owner.publish('No', 1), /not an activity channel/);
  await owner.close();
  await until(() => fol.closed() && late.closed(), 'closed');
  assert.equal(owner.publish('ui', 'after'), false, 'its sharing ended: nothing sent');
});

test('read only: a follower\'s activity and an editor\'s are refused by the relay and reach neither the owner\'s followers nor the owner', async () => {
  const doc = owned();
  const owner = await share(doc, { editors: true });
  owner.publish('ui', 'the owner\'s');
  const errors = { v: [], e: [] };
  const viewer = await follow(owner, { onEvent: e => { if (e.type === 'error') errors.v.push(e.message); } });
  const editor = await follow(owner, { user: { name: 'Bo' }, sign: owner.editKey, onEvent: e => { if (e.type === 'error') errors.e.push(e.message); } });
  const other = await follow(owner, { user: { name: 'Eva' } });
  await Promise.all([viewer.ready, editor.ready, other.ready]);
  await until(() => other.activity('ui') === 'the owner\'s', 'the owner\'s activity');
  viewer.send(KIND.activity, activityBytes('ui', 'forged by a viewer'));
  editor.send(KIND.activity, activityBytes('ui', 'forged by an editor'));
  await until(() => errors.v.length && errors.e.length, 'the refusals');
  assert.deepEqual(errors.v, ['read only: a follower cannot change the shared project']);
  assert.deepEqual(errors.e, ['read only: a follower cannot change the shared project']);
  await sleep(150);
  assert.equal(other.activity('ui'), 'the owner\'s', 'no forged activity applied');
  assert.equal(viewer.activity('ui'), 'the owner\'s');
  await owner.close();
  await until(() => viewer.closed() && editor.closed() && other.closed(), 'every follower closed');
});

test('#3835 the owner\'s room resumed: every follower gets the latest activity again (what changed while it was lost)', async () => {
  const doc = owned();
  let ownerWs = null;
  class Spy extends WebSocket { constructor(...a) { super(...a); ownerWs = this; } }
  const owner = await share(doc, { WebSocket: Spy, reconnect: { delays: [50], for: 10_000 } });
  owner.publish('design', { sel: 'm:a', open: [] });
  const fol = await follow(owner);
  await fol.ready;
  await until(() => fol.activity('design')?.sel === 'm:a', 'the first');
  ownerWs.close();   // (the owner's connection lost: the relay keeps its room for its resume)
  await until(() => !owner.connected(), 'lost');
  owner.publish('design', { sel: 'm:b', open: [] });   // (sent into nothing: kept)
  await until(() => owner.connected(), 'resumed', 5000);
  await until(() => fol.activity('design')?.sel === 'm:b', 'the activity again after the resume', 5000);
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
});

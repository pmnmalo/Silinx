// The browser edition's relay kept as the GitHub sign-in (#4737, web/js/relay-setting.js): in this browser
// (localStorage) by default, in this tab only (sessionStorage) when the user unticks Remember; at file: (the single
// file opened from the disk) in this tab only, Remember or not, and a relay an older Silinx left in localStorage moved
// to the tab when read (#3530); an empty address forgets it wherever it was kept.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { savedRelay, keepRelay, canRememberRelay } from '../web/js/relay-setting.js';

const K = 'silinx.collab.relay';
const area = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
let store, session, keep, had;
beforeEach(() => {
  store = new Map(); session = new Map();
  keep = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.localStorage = area(store);
  globalThis.sessionStorage = area(session);
});
afterEach(() => {
  Object.assign(globalThis, keep);
  if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location;
});
const atFile = () => Object.defineProperty(globalThis, 'location', { value: { protocol: 'file:' }, configurable: true });
const R = { address: 'https://silinx-relay.x.workers.dev', key: 'k'.repeat(43) };

test('#4737 the relay remembered in this browser by default; unticked, in this tab only; forgotten from both', () => {
  assert.deepEqual(savedRelay(), { address: '', key: '', remembered: false });
  keepRelay(R);
  assert.deepEqual(JSON.parse(store.get(K)), R);
  assert.equal(session.size, 0);
  assert.deepEqual(savedRelay(), { ...R, remembered: true });
  keepRelay({ ...R, remember: false });
  assert.equal(store.size, 0, 'the remembered copy cleared');
  assert.deepEqual(JSON.parse(session.get(K)), R);
  assert.deepEqual(savedRelay(), { ...R, remembered: false });
  keepRelay({ ...R, remember: true });
  assert.equal(session.size, 0, 'the tab copy cleared');
  assert.deepEqual(savedRelay(), { ...R, remembered: true });
  keepRelay({ address: '', key: '' });
  assert.equal(store.size + session.size, 0);
  assert.deepEqual(savedRelay(), { address: '', key: '', remembered: false });
  // (a relay switched off by an older Silinx: none)
  store.set(K, JSON.stringify({ ...R, on: false }));
  assert.equal(savedRelay().address, '');
  store.set(K, '{not json');
  assert.deepEqual(savedRelay(), { address: '', key: '', remembered: false });
});

test('#4737 regression: at file: the relay is kept in this tab only, Remember or not; one left in localStorage moved to the tab', () => {
  assert.equal(canRememberRelay(), true);
  atFile();
  assert.equal(canRememberRelay(), false);
  keepRelay({ ...R, remember: true });
  assert.equal(store.size, 0, 'never in localStorage at file:');
  assert.deepEqual(savedRelay(), { ...R, remembered: false });
  session.clear();
  store.set(K, JSON.stringify(R));   // (kept by an older Silinx)
  assert.deepEqual(savedRelay(), { ...R, remembered: false });
  assert.equal(store.size, 0, 'moved out of localStorage');
  assert.deepEqual(JSON.parse(session.get(K)), R);
});

test('#4737 storage refused (a private window, blocked site data): nothing kept, none read, no throw', () => {
  const refuse = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  globalThis.localStorage = refuse; globalThis.sessionStorage = refuse;
  keepRelay(R);
  assert.deepEqual(savedRelay(), { address: '', key: '', remembered: false });
});

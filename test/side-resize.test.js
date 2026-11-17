// The side panels' widths (#4316, web/js/side-resize.js): clamped between the minimum and the maximum and to the room the
// canvas leaves, kept in localStorage per panel, forgotten by the reset; storage unavailable or garbage kept: no width.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clampWidth, readWidth, saveWidth, forgetWidth, SIDE_MIN, SIDE_MAX } from '../web/js/side-resize.js';

class Store { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
beforeEach(() => { globalThis.localStorage = new Store(); });

test('#4316 clampWidth: between the minimum and the maximum, at most the room, never under the minimum', () => {
  assert.deepEqual([SIDE_MIN, SIDE_MAX], [160, 720]);
  assert.equal(clampWidth(300), 300);
  assert.equal(clampWidth(300.6), 301);
  assert.equal(clampWidth(20), 160);
  assert.equal(clampWidth(-50), 160);
  assert.equal(clampWidth(5000), 720);
  assert.equal(clampWidth(500, { room: 400 }), 400);
  assert.equal(clampWidth(500, { room: 100 }), 160, 'the minimum wins over a room too small');
  assert.equal(clampWidth(90, { min: 80, max: 120 }), 90);
  assert.equal(clampWidth(130, { min: 80, max: 120 }), 120);
  assert.equal(clampWidth(500, { room: Infinity }), 500);
});

test('#4316 the width kept per panel, read back, forgotten by the reset', () => {
  assert.equal(readWidth('silinx.asm.props.width'), null);
  saveWidth('silinx.asm.props.width', 333.4);
  saveWidth('silinx.sch.symbols.width', 210);
  assert.equal(localStorage.getItem('silinx.asm.props.width'), '333');
  assert.equal(readWidth('silinx.asm.props.width'), 333);
  assert.equal(readWidth('silinx.sch.symbols.width'), 210, 'each panel its own');
  forgetWidth('silinx.asm.props.width');
  assert.equal(readWidth('silinx.asm.props.width'), null);
  assert.equal(readWidth('silinx.sch.symbols.width'), 210);
});

test('#4316 a width kept as garbage, or 0, or the old CSS form: read as none or its number', () => {
  localStorage.setItem('k1', 'wide'); localStorage.setItem('k2', '0'); localStorage.setItem('k3', '280px'); localStorage.setItem('k4', '-5');
  assert.deepEqual(['k1', 'k2', 'k3', 'k4'].map(readWidth), [null, null, 280, null]);
});

test('#4316 storage unavailable: no width read, nothing thrown', () => {
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readWidth('k'), null);
  assert.doesNotThrow(() => saveWidth('k', 200));
  assert.doesNotThrow(() => forgetWidth('k'));
  delete globalThis.localStorage;
  assert.equal(readWidth('k'), null);
  assert.doesNotThrow(() => saveWidth('k', 200));
});

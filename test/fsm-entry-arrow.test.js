// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The reset's arrow into a state diagram's initial state (#4903): where it comes from, entryAngle (degrees, 180 the left
// when none), kept to 5° as a self-loop's angle, saved with the diagram, shared live, dropped by Arrange (autoLayout);
// the HDL the same wherever it is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { normalizeFsm, generateFsm, validateFsm, autoLayout } from '../core/fsm.js';
import { putDrawing, drawingModel } from '../core/collab-model.js';

const machine = (extra = {}) => ({
  name: 'ea', lang: 'vhdl', inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 300, y: 160 }, { id: 'b', name: 'B', x: 80, y: 160, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'a', cond: '' }], initial: 'a', ...extra,
});

test('#4903 entryAngle: none (the left) by default, kept to 5° in (−180, 180], a value not a number dropped', () => {
  assert.equal('entryAngle' in normalizeFsm(machine()), false);
  for (const [v, want] of [[-90, -90], [93, 95], ['47', 45], [270, -90], [-180, 180], [0, 0], [361, 0]]) assert.equal(normalizeFsm(machine({ entryAngle: v })).entryAngle, want, String(v));
  for (const v of [null, '', 'up', NaN, Infinity, {}]) assert.equal('entryAngle' in normalizeFsm(machine({ entryAngle: v })), false, String(v));
  // saved and read back
  const m = normalizeFsm(machine({ entryAngle: -90 }));
  assert.deepEqual(normalizeFsm(JSON.parse(JSON.stringify(m))), m);
});

test('#4903 the HDL and Check the same wherever the arrow is drawn; Arrange puts it back on the left', () => {
  const base = normalizeFsm(machine()), up = normalizeFsm(machine({ entryAngle: -90 }));
  for (const lang of ['vhdl', 'verilog']) assert.equal(generateFsm({ ...up, lang }, lang).code, generateFsm({ ...base, lang }, lang).code, lang);
  assert.deepEqual(validateFsm(up), validateFsm(base));
  assert.deepEqual(validateFsm(up).map((d) => `${d.severity}: ${d.message}`), ['info: State A: no transition is true when go=0; the machine stays in A']);
  assert.equal('entryAngle' in autoLayout(up), false);
});

test('#4903 shared live: the arrow moved by one participant, read by the others; put back on the left', () => {
  const doc = new Y.Doc(), P = 'src/ea.fsm.json';
  const m0 = normalizeFsm(machine());
  putDrawing(doc, P, m0);
  const m1 = normalizeFsm(machine({ entryAngle: 90 }));
  putDrawing(doc, P, m1, { base: m0 });
  assert.equal(drawingModel(doc, P).model.entryAngle, 90);
  putDrawing(doc, P, m0, { base: m1 });
  assert.equal('entryAngle' in drawingModel(doc, P).model, false);
});

// The simulations a shared project's owner has open, as its followers follow them (#4002, part 3: core/collab-sim.js):
// a simulation's state as it is sent (its panels' sizes left out), the `sim` value (SSim documents only, their number
// capped), taken back as untrusted input (rows, forces, times that are not one left out), the stimuli's key, and the
// simulations in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIM_LIMITS, simDocActivity, simActivity, followedSim, stimKey, simLines } from '../core/collab-sim.js';

const STATE = {
  rows: [{ kind: 'sig', path: 'tb.clk', radix: 'default', expanded: false }, { kind: 'group', name: 'bus', expanded: true }, { kind: 'sig', path: 'tb.q(3)', radix: 'hex', expanded: false, group: 1 }, { kind: 'div', name: '--' }],
  cursor: 120000, markers: [5000, 9000], t0: 0, scale: 500, fit: false, nameW: 180, valW: 120, leftW: 300, consoleH: 140,
  runTime: { value: '1', unit: 'us' }, curInst: 'tb',
  forces: [{ path: 'tb.rst', start: 0, repeat: null, end: 20000, endRelease: true, desc: 'reset', pattern: [{ off: 0, bits: '1' }] }],
};

test('a simulation\'s state as it is sent: its time, stimuli, forces and view; its panels\' sizes left out', () => {
  const d = simDocActivity(STATE, 1_000_000, 'k');
  assert.deepEqual(Object.keys(d), ['now', 'stim', 'forces', 'view']);
  assert.equal(d.now, 1_000_000);
  assert.equal(d.stim, 'k');
  assert.deepEqual(d.forces, STATE.forces);
  assert.deepEqual(Object.keys(d.view).sort(), ['curInst', 'cursor', 'fit', 'markers', 'rows', 'runTime', 'scale', 't0']);
  assert.deepEqual(simDocActivity(null, NaN), { now: 0, stim: null, forces: [], view: {} });
});

test('the sim value: SSim documents only, at most SIM_LIMITS.docs; taken back as it was sent', () => {
  const docs = [['isim:tb', simDocActivity(STATE, 10)], ['isim:tb@postsynth', simDocActivity(STATE, 20)], ['file:src/x.vhd', {}], ['isim:../x', {}]];
  const v = simActivity(docs);
  assert.deepEqual(Object.keys(v.docs), ['isim:tb', 'isim:tb@postsynth']);
  const many = simActivity(Array.from({ length: 12 }, (_, i) => [`isim:m${i}`, simDocActivity({}, i)]));
  assert.equal(Object.keys(many.docs).length, SIM_LIMITS.docs);
  const back = followedSim(v);
  assert.deepEqual(back.docs['isim:tb'], { now: 10, stim: null, forces: STATE.forces, view: { rows: STATE.rows, cursor: 120000, markers: [5000, 9000], t0: 0, scale: 500, fit: false, curInst: 'tb', runTime: { value: '1', unit: 'us' } } });
});

test('taken back as untrusted input: rows, forces, markers and times that are not one left out; not one at all: null', () => {
  const v = followedSim({ docs: {
    'isim:tb': {
      now: -5, stim: 7,
      forces: [{ path: 'tb.a', start: 0, pattern: [{ off: 0, bits: '10' }, { off: 'x', bits: '1' }] }, { path: 'tb.b', start: 0, pattern: [{ off: 0, bits: '<script>' }] }, { path: '../x', start: 0, pattern: [{ off: 0, bits: '1' }] }],
      view: { rows: [{ kind: 'sig', path: 'tb.a' }, { kind: 'sig', path: 'a b' }, { kind: 'nope' }, null, { kind: 'div', name: 'x'.repeat(201) }], cursor: 'x', markers: [1, -1, 'a', 3], scale: 0, fit: 'yes', curInst: 5, runTime: { value: 1, unit: 'us' } },
    },
    'emulator:top': { now: 1 },
    'isim:t2': { now: SIM_LIMITS.now + 1 },
  } });
  assert.deepEqual(v.docs['isim:tb'], {
    now: 0, stim: null,
    forces: [{ path: 'tb.a', start: 0, repeat: null, end: null, endRelease: true, desc: '', pattern: [{ off: 0, bits: '10' }] }],
    view: { rows: [{ kind: 'sig', path: 'tb.a', radix: 'default', expanded: false }], cursor: 0, markers: [1, 3], t0: 0, scale: 1000, fit: false, curInst: null },
  });
  assert.deepEqual(Object.keys(v.docs), ['isim:tb', 'isim:t2']);
  assert.equal(v.docs['isim:t2'].now, 0, 'a time past the limit: none');
  for (const bad of [null, 1, [], { docs: [] }, { docs: 'x' }]) assert.equal(followedSim(bad), null, JSON.stringify(bad));
});

test('the stimuli\'s key: the same model the same key, another model another; none: null', () => {
  const m = { ports: { a: [[0, '1'], [100, '0']] } };
  assert.equal(stimKey(m), stimKey(structuredClone(m)));
  assert.notEqual(stimKey(m), stimKey({ ports: { a: [[0, '1'], [200, '0']] } }));
  assert.match(stimKey(m), /^\d+\.[0-9a-f]+$/);
  assert.equal(stimKey(null), null);
});

test('the simulations in words', () => {
  assert.deepEqual(simLines(simActivity([['isim:tb', simDocActivity(STATE, 1_000_000)]])), ['Their simulation tb: run to 1000 ns, the cursor at 120 ns, 2 signal(s) shown, 1 force(s).']);
  assert.deepEqual(simLines(null), []);
});

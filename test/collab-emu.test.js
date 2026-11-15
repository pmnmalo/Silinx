// The Board Emulators a shared project's owner has open, as its followers follow them (#4002, part 4:
// core/collab-emu.js): an emulator's state as it is sent, the `emu` value (emulator documents only, their number and a
// board's inputs capped), taken back as untrusted input (a rate that is not one: real time), and in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMU_LIMITS, emuDocActivity, emuActivity, followedEmu, emuLines } from '../core/collab-emu.js';

test('an emulator as it is sent: its inputs as booleans, its power, run and rate (a rate that is not one: real time)', () => {
  assert.deepEqual(emuDocActivity({ inputs: [1, 0, 'x', null], powered: 1, running: 0, speed: 1000 }), { inputs: [true, false, true, false], powered: true, running: false, speed: 1000 });
  assert.deepEqual(emuDocActivity({ speed: 'max' }).speed, 'max');
  for (const bad of [0, -1, Infinity, 'fast', EMU_LIMITS.rate * 2]) assert.equal(emuDocActivity({ speed: bad }).speed, 'real', String(bad));
  assert.deepEqual(emuDocActivity(), { inputs: [], powered: false, running: false, speed: 'real' });
  assert.equal(emuDocActivity({ inputs: Array(EMU_LIMITS.inputs + 9).fill(true) }).inputs.length, EMU_LIMITS.inputs);
});

test('the emu value: emulator documents only, at most EMU_LIMITS.docs; taken back as it was sent', () => {
  const v = emuActivity([['emulator:top', { inputs: [true], powered: true, running: true, speed: 'real' }], ['emulator:top@postsynth', {}], ['isim:tb', {}], ['emulator:../x', {}]]);
  assert.deepEqual(Object.keys(v.docs), ['emulator:top', 'emulator:top@postsynth']);
  assert.deepEqual(followedEmu(v), v);
  assert.equal(Object.keys(emuActivity(Array.from({ length: 9 }, (_, i) => [`emulator:m${i}`, {}])).docs).length, EMU_LIMITS.docs);
});

test('taken back as untrusted input: inputs that are not true are off, a document of no emulator\'s left out; not one at all: null', () => {
  assert.deepEqual(followedEmu({ docs: { 'emulator:top': { inputs: [true, 1, 'on', false], powered: 'yes', running: true, speed: () => 1 }, 'emulator:x': { inputs: 'no' }, 'file:a': { inputs: [] } } }),
    { docs: { 'emulator:top': { inputs: [true, false, false, false], powered: false, running: true, speed: 'real' } } });
  for (const bad of [null, 'x', [], { docs: [] }, { docs: 1 }]) assert.equal(followedEmu(bad), null, JSON.stringify(bad));
});

test('the emulators in words', () => {
  const v = (o) => emuActivity([['emulator:top', o]]);
  assert.deepEqual(emuLines(v({ inputs: [true, false, true], powered: true, running: true, speed: 'real' })), ['Their Board Emulator top: running at real time, 2 of 3 switches and buttons on.']);
  assert.deepEqual(emuLines(v({ inputs: [false], powered: true, running: true, speed: 1000 })), ['Their Board Emulator top: running at 1000 Hz, 0 of 1 switches and buttons on.']);
  assert.deepEqual(emuLines(v({ inputs: [], powered: true, running: false, speed: 'max' })), ['Their Board Emulator top: paused, 0 of 0 switches and buttons on.']);
  assert.deepEqual(emuLines(v({ inputs: [], powered: false })), ['Their Board Emulator top: powered off, 0 of 0 switches and buttons on.']);
  assert.deepEqual(emuLines(null), []);
});

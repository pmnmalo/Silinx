// A VCD read back (core/vcd.js, #4699): its timescale, its signals by their scopes' path, their changes (bits, x and z,
// vectors); the simulator's VCD of a design simulated (toVCD) read back as its waves; what is not a VCD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVcd } from '../core/vcd.js';
import { toVCD } from '../core/simulator.js';
import * as V from '../core/values.js';

test('a VCD: its scopes, its signals and their changes, an id shared by two signals', () => {
  const r = readVcd(['$date today $end', '$version x $end', '$timescale 1 ns $end', '$comment two words $end',
    '$scope module top $end', '$var wire 1 ! clk $end', '$var reg 4 " q [3:0] $end', '$scope module sub $end', '$var wire 1 ! c $end',
    '$upscope $end', '$upscope $end', '$enddefinitions $end', '$dumpvars', '0!', 'b0 "', '$end', '#5', '1!', '#10', '0!', 'b1010 "', 'x!', '#15', 'z!', ''].join('\n'));
  assert.equal(r.timescale, '1ns');
  assert.deepEqual([...r.signals.keys()], ['top.clk', 'top.q', 'top.sub.c']);
  assert.deepEqual(r.signals.get('top.clk'), { width: 1, type: 'wire', changes: [0, 0, 5, 1, 10, 0, 10, null, 15, null] });
  assert.deepEqual(r.signals.get('top.q'), { width: 4, type: 'reg', changes: [0, '0', 10, '1010'] });
  assert.deepEqual(r.signals.get('top.sub.c').changes, r.signals.get('top.clk').changes, 'the same id: the same changes');
});

test('the simulator\'s VCD read back: the waves it wrote', () => {
  const sig = (name, w, t, v) => ({ name, t: { kind: 'logic', w }, net: 'wire', wave: { t, v } });
  const a = sig('a', 1, [0, 10, 30], [V.mk(1, 0n), V.mk(1, 1n), V.allX(1)]);
  const b = sig('b', 3, [0, 20], [V.mk(3, 5n), V.mk(3, 2n)]);
  const design = { top: { name: 'tb', ports: [{ name: 'a', sig: a }], signals: [b], children: [] }, signals: [a, b] };
  const r = readVcd(toVCD(design, null, { signals: design.signals }));
  assert.equal(r.timescale, '1ps');
  assert.deepEqual(r.signals.get('tb.a'), { width: 1, type: 'wire', changes: [0, 0, 10, 1, 30, null] });
  assert.deepEqual(r.signals.get('tb.b'), { width: 3, type: 'wire', changes: [0, '101', 20, '10'] });
});

test('not a VCD', () => {
  assert.throws(() => readVcd('hello'), /^Error: not a VCD: 'hello' before \$enddefinitions$/);
  assert.throws(() => readVcd('$timescale 1ps $end'), /^Error: not a VCD: no \$enddefinitions$/);
  assert.throws(() => readVcd('$enddefinitions $end #x'), /^Error: not a VCD time: '#x'$/);
  assert.throws(() => readVcd('$enddefinitions $end ?!'), /^Error: not a VCD value: '\?!'$/);
  assert.deepEqual([...readVcd('$enddefinitions $end').signals], []);
});

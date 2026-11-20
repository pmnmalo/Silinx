// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's schematic (core/fsm-schematic.js): its gate-level implementation, not the RTL. A D flip-flop per
// state bit (FDR for a synchronous reset, FDC for an asynchronous one: the initial state's code, 0; an inverter before
// them for an active-low reset), the next-state and output logic in gates, the state bits as labels, a
// bus as its marker and labels of its bits. Its HDL, in VHDL and in Verilog, compiled and elaborated with no warnings and
// simulated cycle by cycle against the diagram's model and its own HDL (random inputs). A machine that cannot be drawn
// has none, why said: one-hot encoding, errors, too many bits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fsmSchematic } from '../core/fsm-schematic.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { generateHdl, normalizeDoc, netlist } from '../core/schdoc.js';
import { compile, elaborate } from '../core/compile.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const TRAFFIC = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8'));
// a Mealy machine: a 2-bit input, an active-low asynchronous reset, the gray encoding, its initial state C
const MEALY = {
  version: 1, kind: 'fsm', name: 'det', lang: 'vhdl', clock: 'ck', reset: { name: 'rst_n', active: 'low', sync: false }, encoding: 'gray',
  inputs: [{ name: 'x', width: 1 }, { name: 'sel', width: 2 }], outputs: [{ name: 'y', width: 1, default: '0' }, { name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 100, y: 100, outputs: { z: '1' } }, { id: 'b', name: 'B', x: 300, y: 100, outputs: {} }, { id: 'c', name: 'C', x: 200, y: 300, outputs: {} }],
  transitions: [
    { id: 't1', from: 'a', to: 'b', cond: 'x', outputs: { y: '1' } },
    { id: 't2', from: 'b', to: 'c', cond: 'sel == 2', outputs: {} },
    { id: 't3', from: 'b', to: 'a', cond: '!x', outputs: { y: '1' } },
    { id: 't4', from: 'c', to: 'a', cond: 'x && sel[0]', outputs: {} },
  ],
  initial: 'c',
};

const types = (doc) => doc.symbols.map((s) => s.type);
const ff = (doc) => doc.symbols.filter((s) => /^fd/.test(s.type)).map((s) => `${s.type}:${s.params.init}`);

test('the traffic example\'s schematic: three FDR (a synchronous reset, the initial state 000), gates, the phase bus', () => {
  const r = fsmSchematic(TRAFFIC);
  assert.equal(r.error, undefined);
  assert.deepEqual([r.doc.name, r.doc.lang], ['traffic', 'vhdl']);
  assert.deepEqual(ff(r.doc), ['fdr:0', 'fdr:0', 'fdr:0']);
  assert.ok(types(r.doc).some((t) => /^and/.test(t)) && types(r.doc).some((t) => /^or/.test(t)), types(r.doc).join(' '));
  assert.deepEqual(r.doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['req:in:1', 'done:in:1', 'night:in:1', 'clk:in:1', 'rst:in:1', 'phase:out:3']);
  const nets = new Set(r.doc.labels.map((l) => l.net));
  for (const n of ['q2', 'q1', 'q0', 'd2', 'd1', 'd0', 'phase(2)', 'phase(1)', 'phase(0)', 'phase(2:0)', 'clk', 'rst']) assert.ok(nets.has(n), n);
  assert.deepEqual(netlist(r.doc).diagnostics.filter((d) => d.severity !== 'info').map((d) => d.message), []);
});

test('a Mealy machine\'s: FDC (an asynchronous reset), an inverter for the active-low reset', () => {
  const r = fsmSchematic(MEALY);
  assert.equal(r.error, undefined);
  assert.deepEqual(ff(r.doc), ['fdc:0', 'fdc:0']);
  assert.ok(types(r.doc).includes('inv'));
  assert.ok(r.doc.labels.some((l) => l.net === 'rst_n_i'));
  assert.deepEqual(r.doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['x:in:1', 'y:out:1', 'z:out:1', 'ck:in:1', 'rst_n:in:1', 'sel:in:2']);
  const sync = fsmSchematic({ ...MEALY, reset: { name: 'rst', active: 'high', sync: true } }).doc;
  assert.deepEqual([ff(sync), types(sync).includes('inv')], [['fdr:0', 'fdr:0'], false]);
});

for (const lang of ['vhdl', 'verilog']) {
  for (const [what, model] of [['the traffic example', TRAFFIC], ['the Mealy machine', MEALY], ['the Mealy machine, from B with a synchronous reset', { ...MEALY, initial: 'b', reset: { name: 'r', active: 'high', sync: true } }]]) {
    test(`${what}'s schematic in ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: compiled and elaborated with no warnings, simulated as the diagram`, () => {
      const m = normalizeFsm({ ...model, lang });
      const g = generateHdl(normalizeDoc(fsmSchematic(m).doc), { lang });
      assert.deepEqual(g.diagnostics.map((d) => `${d.severity}: ${d.message}`), []);
      const path = lang === 'vhdl' ? `${m.name}.vhd` : `${m.name}.v`;
      const lib = compile([{ path, lang, text: g.code }]);
      assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), []);
      assert.deepEqual(elaborate(lib, m.name).diags.map((e) => `${e.severity}: ${e.message}`), []);
      const vectors = randomVectors(m, 200, lang === 'vhdl' ? 11 : 12);
      const want = runModel(m, vectors);
      assert.deepEqual(runHdl(generateFsm(m, lang).code, lang, m, vectors), want);
      assert.deepEqual(runHdl(g.code, lang, m, vectors), want);
    });
  }
}

test('no schematic, why said: one-hot, a diagram with errors, too many bits, a signal named as a state bit', () => {
  assert.deepEqual(fsmSchematic({ ...TRAFFIC, encoding: 'onehot' }), { error: 'No schematic: the encoded table is made for the binary and gray encodings (choose one of them)' });
  assert.deepEqual(fsmSchematic({ ...TRAFFIC, states: TRAFFIC.states.map((x) => ({ ...x, name: 'S' })) }), { error: 'No schematic: correct the errors of the diagram first' });
  assert.deepEqual(fsmSchematic({ ...MEALY, inputs: [...MEALY.inputs, { name: 'w', width: 8 }] }),
    { error: 'No schematic: too many bits for a table: 2 state bit(s) + 11 input bit(s) (at most 10)' });
  assert.deepEqual(fsmSchematic({ ...MEALY, clock: 'q1' }), { error: 'No schematic: the signal q1 is named as a state bit' });
});

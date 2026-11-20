// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's schematic (core/fsm-schematic.js): its gate-level implementation, not the RTL. A D flip-flop per
// state bit (FDR for a synchronous reset, FDC for an asynchronous one: the initial state's code, 0; an inverter before
// them for an active-low reset), the next-state and output logic in gates, the state bits as labels, a
// bus as its marker and labels of its bits. Its HDL, in VHDL and in Verilog, compiled and elaborated with no warnings and
// simulated cycle by cycle against the diagram's model and its own HDL (random inputs); the schematic itself stepped in
// the schematic's simulator (its Try it, core/schlive.js) against the model, from reset (#4911's check, merged here):
// Moore and Mealy, binary and gray, every kind of reset, buses. A machine that cannot be drawn has none, why said:
// enumerated, one-hot, errors, too many bits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fsmSchematic } from '../core/fsm-schematic.js';
import { newFsm, normalizeFsm, generateFsm, simulateFsm } from '../core/fsm.js';
import { buildLiveSim } from '../core/schlive.js';
import { toBin } from '../core/values.js';
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

// a Mealy machine with a bus input and a bus output (#4911's)
const BUSES = {
  name: 'mealy', encoding: 'binary', inputs: [{ name: 'a', width: 2 }], outputs: [{ name: 'y', width: 2, default: '0' }],
  states: [{ id: 's1', name: 'A', outputs: {} }, { id: 's2', name: 'B', outputs: {} }, { id: 's3', name: 'C', outputs: { y: '1' } }],
  transitions: [{ from: 's1', to: 's2', cond: 'a == 1', outputs: { y: '2' } }, { from: 's2', to: 's3', cond: 'a[1]' },
    { from: 's3', to: 's1', cond: 'a == 3', outputs: { y: '3' } }],
  initial: 's1',
};

function rng(seed) { let s = seed; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
// the schematic stepped in the schematic's simulator from reset against the model: every cycle's outputs (#4911)
function stepped(model, cycles = 200) {
  const m = normalizeFsm(model);
  const { doc, error } = fsmSchematic(m);
  assert.equal(error, undefined);
  assert.deepEqual(netlist(doc).diagnostics, [], 'no schematic diagnostic');
  const r = buildLiveSim(doc, {});
  assert.deepEqual([r.ok, r.errors, r.warnings], [true, [], []], 'simulated, no warning');
  const live = r.live;
  const port = (name) => doc.ports.find((p) => p.name === name).id;
  const on = m.reset.active === 'low' ? 0n : 1n;
  live.set(port(m.reset.name), on);
  if (m.reset.sync) live.cycles([port(m.clock)], 1);
  live.set(port(m.reset.name), 1n - on);
  const next = rng(4911);
  const vectors = Array.from({ length: cycles }, () => Object.fromEntries(m.inputs.map((i) => [i.name, BigInt(next() % (1 << i.width))])));
  const want = simulateFsm(m, vectors);
  vectors.forEach((v, k) => {
    for (const i of m.inputs) live.set(port(i.name), v[i.name]);
    for (const o of m.outputs) {
      assert.equal(toBin(live.portValue(port(o.name))).padStart(o.width, '0'), want[k].outputs[o.name].toString(2).padStart(o.width, '0'), `cycle ${k}, ${o.name} in ${want[k].state}`);
    }
    live.cycles([port(m.clock)], 1);
  });
  return doc;
}

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
  for (const [what, model] of [['the traffic example', TRAFFIC], ['the traffic example in gray', { ...TRAFFIC, encoding: 'gray' }],
    ['the Mealy machine, a synchronous active-low reset', { ...MEALY, reset: { name: 'rst_n', active: 'low', sync: true } }], ['the Mealy machine', MEALY], ['the Mealy machine, from B with a synchronous reset', { ...MEALY, initial: 'b', reset: { name: 'r', active: 'high', sync: true } }]]) {
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

test('a synchronous active-low reset: FDR, after an inverter', () => {
  const doc = fsmSchematic({ ...MEALY, reset: { name: 'rst_n', active: 'low', sync: true } }).doc;
  assert.deepEqual([ff(doc), types(doc).filter((t) => t === 'inv').length > 0, doc.labels.some((l) => l.net === 'rst_n_i')], [['fdr:0', 'fdr:0'], true, true]);
});

test('#4911 the schematic stepped in its simulator as the model: Moore and Mealy, binary and gray, every kind of reset, buses', () => {
  stepped(TRAFFIC);
  stepped({ ...TRAFFIC, encoding: 'gray' });
  // (the user's codes, #4908: the states' codes in the other order)
  stepped({ ...TRAFFIC, encoding: 'user', states: TRAFFIC.states.map((x, i) => ({ ...x, code: (TRAFFIC.states.length - 1 - i).toString(2).padStart(3, '0') })) });
  assert.deepEqual(ff(stepped(newFsm('seq'))), ['fdc:0', 'fdc:0']);
  assert.ok(types(stepped({ ...newFsm('seq'), reset: { name: 'rst_n', active: 'low', sync: false } })).includes('inv'));
  stepped({ ...newFsm('seq'), reset: { name: 'rst_n', active: 'low', sync: true } });
  stepped(MEALY);
  stepped({ ...MEALY, reset: { name: 'r', active: 'high', sync: true } });
  stepped(BUSES);
});

test('no schematic, why said: one-hot, enumerated, a diagram with errors, too many bits, a signal named as a state bit', () => {
  assert.deepEqual(fsmSchematic({ ...TRAFFIC, encoding: 'enum' }), { error: 'No schematic: the enumerated encoding has no state codes: choose binary or gray to see the schematic' });
  assert.deepEqual(fsmSchematic({ ...TRAFFIC, encoding: 'onehot' }), { error: 'No schematic: the encoded table is made for the binary, gray and user-defined encodings (choose one of them)' });
  assert.deepEqual(fsmSchematic({ ...TRAFFIC, states: TRAFFIC.states.map((x) => ({ ...x, name: 'S' })) }), { error: 'No schematic: correct the errors of the diagram first' });
  assert.deepEqual(fsmSchematic({ ...MEALY, inputs: [...MEALY.inputs, { name: 'w', width: 8 }] }),
    { error: 'No schematic: too many bits for a table: 2 state bit(s) + 11 input bit(s) (at most 10)' });
  assert.deepEqual(fsmSchematic({ ...MEALY, clock: 'q1' }), { error: 'No schematic: the signal q1 is named as a state bit' });
});

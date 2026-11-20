// The schematic of a state diagram (#4911, core/fsm-sch.js): its classic implementation, a D flip-flop per state bit
// and its next-state and output logic in minimal gates. Simulated (core/schlive.js, the schematic's own HDL, in VHDL and
// in Verilog) against the diagram's model (core/fsm.js simulateFsm) from reset over random inputs: the same outputs
// every cycle. The examples' state diagram (traffic) and machines of every kind of reset, Moore and Mealy, binary and
// gray; none for the encodings with no codes and past the tables' limits, with why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fsmSchematic } from '../core/fsm-sch.js';
import { newFsm, normalizeFsm, simulateFsm } from '../core/fsm.js';
import { netlist } from '../core/schdoc.js';
import { buildLiveSim } from '../core/schlive.js';
import { toBin } from '../core/values.js';

const traffic = () => normalizeFsm(JSON.parse(readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8')));

function rng(seed) { let s = seed; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

// the schematic simulated from reset against the model: every cycle's outputs (each output bit a port of its own)
function check(m, cycles = 200) {
  const { doc, error } = fsmSchematic(m);
  assert.equal(error, undefined);
  assert.deepEqual(netlist(doc).diagnostics, [], 'no schematic diagnostic');
  const r = buildLiveSim(doc, {});
  assert.deepEqual([r.ok, r.errors, r.warnings], [true, [], []], 'simulated, no warning');
  const live = r.live;
  const port = (name) => doc.ports.find((p) => p.name === name);
  const clk = port(m.clock).id, rst = port(m.reset.name).id;
  const on = m.reset.active === 'low' ? 0n : 1n;
  live.set(rst, on);
  if (m.reset.sync) live.cycles([clk], 1);
  live.set(rst, 1n - on);
  const next = rng(4911);
  const vectors = Array.from({ length: cycles }, () => Object.fromEntries(m.inputs.map((i) => [i.name, BigInt(next() % (1 << i.width))])));
  const model = simulateFsm(m, vectors);
  vectors.forEach((v, k) => {
    for (const i of m.inputs) {
      if (i.width === 1) live.set(port(i.name).id, v[i.name]);
      else for (let b = 0; b < i.width; b++) live.set(port(`${i.name}_${b}`).id, (v[i.name] >> BigInt(b)) & 1n);
    }
    for (const o of m.outputs) {
      const want = model[k].outputs[o.name].toString(2).padStart(o.width, '0');
      const got = o.width === 1 ? toBin(live.portValue(port(o.name).id))
        : Array.from({ length: o.width }, (_, j) => toBin(live.portValue(port(`${o.name}_${o.width - 1 - j}`).id))).join('');
      assert.equal(got, want, `cycle ${k}, ${o.name} in ${model[k].state}`);
    }
    live.cycles([clk], 1);
  });
  return doc;
}

test('#4911 FSM schematic: the traffic example simulated equal to its model, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = check({ ...traffic(), lang });
    assert.equal(doc.lang, lang);
    // (3 state bits: 3 flip-flops with a synchronous reset to S_0's code, 000; its outputs a port a bit)
    assert.deepEqual(doc.symbols.filter((s) => /^fd/.test(s.type)).map((s) => s.type), ['fdr', 'fdr', 'fdr']);
    assert.deepEqual(doc.ports.map((p) => `${p.dir} ${p.name}`), ['in clk', 'in rst', 'in req', 'in done', 'in night', 'out phase_2', 'out phase_1', 'out phase_0']);
    assert.deepEqual(doc.labels.map((l) => l.net).filter((n) => /^[qd]\d$/.test(n)).sort(), ['d0', 'd0', 'd1', 'd1', 'd2', 'd2', 'q0', 'q0', 'q1', 'q1', 'q2', 'q2']);
  }
});

test('#4911 FSM schematic: gray encoding, Moore and Mealy, every kind of reset', () => {
  check({ ...traffic(), encoding: 'gray' });
  // (the new diagram's Moore machine; asynchronous resets: FDC, an active-low one through an inverter)
  const doc = check(newFsm('seq'));
  assert.deepEqual(doc.symbols.filter((s) => /^fd/.test(s.type)).map((s) => s.type), ['fdc', 'fdc']);
  const low = check({ ...newFsm('seq'), reset: { name: 'rst_n', active: 'low', sync: false } });
  assert.ok(low.symbols.some((s) => s.type === 'inv'));
  check({ ...newFsm('seq'), reset: { name: 'rst_n', active: 'low', sync: true } });
  // a Mealy machine with a bus input and a bus output
  check(normalizeFsm({
    name: 'mealy', encoding: 'binary', inputs: [{ name: 'a', width: 2 }], outputs: [{ name: 'y', width: 2, default: '0' }],
    states: [{ id: 's1', name: 'A', outputs: {} }, { id: 's2', name: 'B', outputs: {} }, { id: 's3', name: 'C', outputs: { y: '1' } }],
    transitions: [{ from: 's1', to: 's2', cond: 'a == 1', outputs: { y: '2' } }, { from: 's2', to: 's3', cond: 'a[1]' },
      { from: 's3', to: 's1', cond: 'a == 3', outputs: { y: '3' } }],
    initial: 's1',
  }));
});

test('#4911 FSM schematic: none for the encodings with no codes and past the tables\' limits, with why', () => {
  assert.deepEqual(fsmSchematic({ ...newFsm('seq'), encoding: 'enum' }), { error: 'The enumerated encoding has no state codes: choose binary or gray to see the schematic' });
  assert.deepEqual(fsmSchematic({ ...newFsm('seq'), encoding: 'onehot' }), { error: 'The encoded table is made for the binary and gray encodings (choose one of them)' });
  assert.deepEqual(fsmSchematic({ ...newFsm('seq'), inputs: [{ name: 'x', width: 9 }] }), { error: 'Too many bits for a table: 2 state bit(s) + 9 input bit(s) (at most 10)' });
  const bad = newFsm('seq'); bad.transitions[0].to = 'nowhere'; bad.transitions[0].cond = 'x +';
  assert.deepEqual(fsmSchematic(bad), { error: 'Correct the errors of the diagram first' });
});

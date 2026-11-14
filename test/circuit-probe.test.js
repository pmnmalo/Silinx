// The logic probe and the waveforms of the digital circuits (#3900): a probe's level (0, 1, Z open, X), no port of the
// HDL, a net only a probe watches a signal of it (no warnings); a Try it session replayed by the circuit's HDL in the
// simulator (core/circuit-replay.js, the waveform viewer's and the MCP's): its probes' waves the same, time for time, as
// the engine's own (a 7404's, a 74161 counter's clocked by its clock source, its time moved on by its half period).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCircuit, circuitPorts } from '../core/circuit.js';
import * as E from '../core/circuit-edit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { circuitReplay, probeWaves } from '../core/circuit-replay.js';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

// a circuit built by the edits (the MCP's and the editor's), failing on a refused one
function build(name, ops) {
  let m = newCircuit(name);
  for (const [f, a] of ops) { const r = E[f](m, a); assert.equal(r.error, undefined, `${f} ${JSON.stringify(a)}`); m = r.model; }
  return m;
}
const POWER = (u, col, gnd) => [['addWire', { from: `${u}.14`, to: `BB1.tp${col}` }], ['addWire', { from: `${u}.${gnd}`, to: `BB1.bn${col + gnd - 1}` }]];
// a 7404 on f5, its 1A from the switch a, its 1Y watched by the probe y (nothing else reads it)
const inverter = () => build('inv', [['addPart', { type: '7404', at: 'BB1.f5' }], ...POWER('U1', 5, 7), ['addWire', { from: 'BB1.tn2', to: 'BB1.bn2', via: [[-2, -3], [-2, 14]] }],
  ['addPart', { type: 'logic-switch', at: [-6, 9], label: 'a' }], ['addWire', { from: 'S1.out', to: 'U1.1' }],
  ['addPart', { type: 'probe', at: [6, 20], label: 'y' }], ['addWire', { from: 'U1.2', to: 'LP1.tip' }],
  ['addPart', { type: 'probe', at: [12, 20], label: 'open' }], ['addWire', { from: 'LP2.tip', to: 'BB1.j20' }]]);
// the engine's own trace of the probes' nets, the session's inputs' changes kept as the editor keeps them
function session(m, steps) {
  const nets = circuitNets(m), net = new Map(m.parts.filter((p) => p.type === 'probe').map((p) => [nets.pinNet.get(`${p.id}.1`), p.label || p.id]));
  const trace = Object.fromEntries([...net.values()].map((l) => [l, []]));
  const sim = createCircuitSim(m, { nets, onLevel: (n, level, t) => { if (net.has(n)) trace[net.get(n)].push([t, level]); } });
  const ports = new Map(circuitPorts(m).inputs.map((i) => [i.name, i]));
  const events = [];
  sim.run();
  for (const s of steps) {
    if (s.wait) { sim.advance(s.wait); continue; }
    const i = ports.get(s.port);
    sim.set(i.part, !!s.v, i.index);
    events.push({ t: sim.time, port: s.port, v: s.v });
    sim.run();
  }
  return { sim, events, trace };
}

test('a logic probe: its tip\'s level (0, 1, Z open, X), no port of the HDL; a net only a probe watches a signal, with no warnings', () => {
  const m = inverter();
  assert.deepEqual(checkCircuit(m), []);
  assert.deepEqual(circuitPorts(m), { inputs: [{ name: 'a', part: 'S1', type: 'logic-switch', index: 0, kind: 'level' }], outputs: [] });
  const { sim } = session(m, []);
  assert.deepEqual(sim.probes(), { LP1: '1', LP2: 'Z' });
  sim.set('S1', true); sim.run();
  assert.equal(sim.probes().LP1, '0');
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(m, lang);
    assert.deepEqual(g.probes, [{ part: 'LP1', label: 'y', signal: g.probes[0].signal }, { part: 'LP2', label: 'open', signal: g.probes[1].signal }]);
    assert.ok(g.probes.every((p) => /^n\d+$/.test(p.signal)), 'the open probe\'s net a signal too (a wire on it): floating');
    assert.match(g.code, lang === 'vhdl' ? new RegExp(`-- silinx: ignore unused-signal \\(watched by a logic probe\\)\\n {2}signal ${g.probes.map((p) => p.signal).join(', ')} : std_logic := 'X';`)
      : new RegExp(`// silinx: ignore unused-signal \\(watched by a logic probe\\)\\n {2}wire ${g.probes.map((p) => p.signal).join(', ')};`));
    const lib = compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', text: g.code }]), d = elaborate(lib, 'inv');
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${lang}: no warnings`);
  }
  // advance: the time moved on, nothing pending
  const t0 = sim.time;
  assert.equal(sim.advance(5000).time, t0 + 5000);
});

test('a Try it replayed by the HDL (VHDL and Verilog): the probe\'s waves the engine\'s, time for time; the replay\'s test bench', () => {
  const m = inverter();
  const { events, trace } = session(m, [{ port: 'a', v: 1 }, { wait: 200 }, { port: 'a', v: 0 }, { wait: 37 }, { port: 'a', v: 1 }]);
  assert.deepEqual(events, [{ t: 10, port: 'a', v: 1 }, { t: 220, port: 'a', v: 0 }, { t: 267, port: 'a', v: 1 }]);
  const r = circuitReplay(m, events, { lang: 'vhdl' });
  assert.equal(r.top, 'inv_tryit');
  assert.deepEqual(r.files.map((f) => f.path), ['inv.vhd', 'inv_tryit.v']);
  assert.match(r.files[1].text, /reg a;\n {2}inv dut \(\.a\(a\)\);\n {2}initial begin\n {4}a = 1'b0;\n {4}#10 a = 1'b1;\n {4}#210 a = 1'b0;\n {4}#47 a = 1'b1;\n {4}#1000 \$finish;/);
  for (const lang of ['vhdl', 'verilog']) {
    const w = probeWaves(m, events, { lang });
    assert.deepEqual(w.y, [[0, 'X'], ...trace.y.slice(1).map(([t, v]) => [t, v])], `${lang}: the engine's trace`);
    assert.deepEqual(w.open, [[0, 'Z']], 'the open probe: Z (the engine\'s starts so, no change)');
  }
  assert.deepEqual(trace.y.map(([t]) => t), [0, 10, 20, 230, 277]);
});

test('a clocked counter: a 74161 on a clock source, its ticks moving the time on; the replay\'s waves the engine\'s', () => {
  // CLR̅ from the switch clr; ENP, ENT, LOAD̅ on +; the clock clk on CLK; QA and QB probed
  const m = build('cnt', [['addPart', { type: '74161', at: 'BB1.f5' }], ['addWire', { from: 'U1.16', to: 'BB1.tp5' }], ['addWire', { from: 'U1.8', to: 'BB1.bn12' }],
    ['addWire', { from: 'BB1.tn2', to: 'BB1.bn2', via: [[-2, -3], [-2, 14]] }],
    ['addWire', { from: 'U1.7', to: 'BB1.bp11', via: [[10, 13], [8, 13]] }].slice(0, 2),
    ['addWire', { from: 'U1.9', to: 'BB1.tp13' }], ['addWire', { from: 'U1.10', to: 'BB1.tp14' }], ['addWire', { from: 'BB1.bp1', to: 'BB1.tp1', via: [[-3, 15], [-3, -4]] }],
    ['addPart', { type: 'logic-switch', at: [-6, 8], label: 'clr_n', id: 'S1' }], ['addWire', { from: 'S1.out', to: 'U1.1' }],
    ['addPart', { type: 'clock', at: [-6, 20], label: 'clk', id: 'CK1' }], ['addWire', { from: 'CK1.out', to: 'U1.2' }],
    ['addPart', { type: 'probe', at: [30, 20], label: 'qa' }], ['addWire', { from: 'U1.14', to: 'LP1.tip' }],
    ['addPart', { type: 'probe', at: [33, 20], label: 'qb' }], ['addWire', { from: 'U1.13', to: 'LP2.tip' }]]);
  assert.deepEqual(checkCircuit(m).filter((d) => d.severity === 'error'), []);
  // cleared, then 1 kHz: a tick every 500 µs of simulated time
  const steps = [{ port: 'clr_n', v: 0 }, { port: 'clr_n', v: 1 }];
  for (let k = 0; k < 8; k++) steps.push({ wait: 500000 }, { port: 'clk', v: (k + 1) % 2 });
  const s = session(m, steps);
  assert.deepEqual(s.trace.qa.map(([, v]) => v), ['X', '0', '1', '0', '1', '0'], 'QA: X, cleared, then each rising edge');
  assert.deepEqual(s.trace.qb.map(([, v]) => v), ['X', '0', '1', '0']);
  for (const lang of ['vhdl', 'verilog']) {
    const w = probeWaves(m, s.events, { lang });
    assert.deepEqual(w.qa, s.trace.qa, `${lang}: qa`);
    assert.deepEqual(w.qb, s.trace.qb, `${lang}: qb`);
  }
});

// The logic probe of the digital circuits (#3900): a probe's level (0, 1, Z open, X), no port of the HDL, a net only a
// probe watches a signal of it (no warnings). (A circuit's waveforms are its test bench's simulation's, #4068.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCircuit, circuitPorts } from '../core/circuit.js';
import * as E from '../core/circuit-edit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { generateCircuit } from '../core/circuit-hdl.js';
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

// A circuit as a System's node (#5215, core/system-circuit.js, core/system-check-circuit.js, core/system-sim-circuit.js):
// its boards the nodes their labels name, the pins it wires each a node's pin (an Arduino's both ways, an FPGA's the way
// its port goes); its check (its fields, its boards, its pins, a 5 V pin on a 3.3 V input, a pin both a link's and the
// circuit's); the plan's wires; a run between an Uno and the uart example's FPGA (the Uno's D2 lights an LED and presses
// the FPGA's button: its message; the FPGA's LD0 lights another and is read on the Uno's D8; an AVR's pull-up a weak 1, a
// short said); its edits and its description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSystem } from '../core/system-doc.js';
import { normalizeCircuit } from '../core/circuit.js';
import { PARTS } from '../core/circuit-parts.js';
import { circuitNodePins, boardNodeId } from '../core/system-circuit.js';
import { analyzeSystem } from '../core/system-check.js';
import { systemPlan } from '../core/system-build.js';
import { systemInputs, systemFromInputs, systemReport } from '../core/system-run.js';
import { addNode, changeNode, addInterface, describeSystem, editSystem } from '../core/system-edit.js';
import { CircuitNode } from '../core/system-sim-circuit.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { intelHex, avrAssemble } from './avr-asm.mjs';
import { uartNetlist } from './system-sim-lib.mjs';

await loadAvr8js();

const PORTS = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 }, { name: 'btn', dir: 'in', width: 1 }, { name: 'led', dir: 'out', width: 8 }] };
const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { clk: 'B8', rx: 'J3', tx: 'A3', btn: 'C6', 'led<0>': 'C5' },
  interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }] };
const TERM = { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/p.hex', interfaces: [] };
const BENCH = { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] };
const system = (nodes = [FPGA, TERM, UNO, BENCH], links = [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }]) => normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes, links });

// the bench: the Uno (labelled uno) above, the Basys2 (fpga) below; the Uno's D2 to the Basys2's JB1 (the FPGA's btn, C6)
// and to the LED D1 (its cathode on the Uno's GND); the Basys2's JB3 (the FPGA's led<0>, C5) to the Uno's D8 and to the
// LED D2 (its cathode on the Basys2's GND); the Uno's D3 to a logic switch S1 (off: a strong 0), unless `noSwitch`
function bench({ more = [], wires = [], noSwitch = false } = {}) {
  return normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' },
    { id: 'D1', type: 'led', x: 20, y: -5 }, { id: 'D2', type: 'led', x: 12, y: 26 }, ...(noSwitch ? [] : [{ id: 'S1', type: 'logic-switch', x: 15, y: -8 }]), ...more],
  wires: [{ id: 'w1', points: [[16, 0], [9, 30]] }, { id: 'w2', points: [[16, 0], [20, -5]] }, { id: 'w3', points: [[21, -5], [3, 0]] },
    { id: 'w4', points: [[11, 30], [9, 0]] }, { id: 'w5', points: [[11, 30], [12, 26]] }, { id: 'w6', points: [[13, 26], [4, 30]] },
    ...(noSwitch ? [] : [{ id: 'w7', points: [[15, -8], [15, 0]] }]), ...wires] });
}
const HOT = 'bench: A1 D2 (uno\'s, 5 V) and F1 JB1 (fpga\'s btn, pin C6, a 3.3 V input) are on one net: a level shifter or a divider on the real boards';

test('#5215 a circuit node\'s boards and pins: an Arduino\'s both ways, an FPGA\'s the way its port goes; the 5 V warning', () => {
  const r = circuitNodePins(system(), BENCH, bench(), { ports: PORTS });
  assert.deepEqual(r.boards, [{ part: 'A1', title: 'Arduino Uno', node: 'uno' }, { part: 'F1', title: 'Digilent Basys2', node: 'fpga' }]);
  assert.deepEqual(r.pins.map((p) => [p.name, p.node, p.nodePin, p.to, p.volts]), [
    ['A1:D8', 'uno', 'D8', 'both', 5], ['A1:D3', 'uno', 'D3', 'both', 5], ['A1:D2', 'uno', 'D2', 'both', 5],
    ['F1:JB1', 'fpga', 'btn', 'node', 3.3], ['F1:JB3', 'fpga', 'led[0]', 'circuit', 3.3]]);
  assert.deepEqual(r.pins.filter((p) => p.loc).map((p) => [p.port, p.loc]), [['btn', 'C6'], ['led<0>', 'C5']]);
  assert.deepEqual(r.problems, [{ severity: 'warning', message: HOT }]);
  // (a board's label its node; no label: its id)
  assert.deepEqual([boardNodeId({ id: 'A1', label: 'uno' }), boardNodeId({ id: 'A1' })], ['uno', 'A1']);
  // (the ports not known: an FPGA's pin read by the node, its port as the UCF names it)
  assert.deepEqual(circuitNodePins(system(), BENCH, bench()).pins.filter((p) => p.node === 'fpga').map((p) => [p.nodePin, p.to]), [['btn', 'node'], ['led[0]', 'node']]);
});

test('#5215 a circuit node\'s problems: a board naming no node, or a node of another board; an FPGA pin on no port, on an inout one; SDA once', () => {
  const sys = system();
  const of = (m, ports = PORTS) => circuitNodePins(sys, BENCH, normalizeCircuit({ name: 'b', parts: m.parts, wires: m.wires }), { ports }).problems.map((p) => `${p.severity}: ${p.message}`);
  assert.deepEqual(of({ parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'mega' }], wires: [] }), ['error: bench: its circuit\'s A1 (Arduino Uno) names no node: its label, mega, is to be a node\'s id']);
  assert.deepEqual(of({ parts: [{ id: 'A1', type: 'arduino-nano', x: 0, y: 0, label: 'uno' }, { id: 'F1', type: 'fpga-nexys2', x: 0, y: 30, label: 'fpga' }, { id: 'X', type: 'arduino-uno', x: 0, y: 60, label: 'term' }], wires: [] }),
    ['error: bench: its circuit\'s A1 is an Arduino Nano, the node uno is on arduino-uno', 'error: bench: its circuit\'s F1 is a Digilent Nexys2, the node fpga is on basys2', 'error: bench: its circuit\'s X is an Arduino Uno, the node term is a terminal node']);
  // JB2 (B6): no port of the module on it; JA1 (B2) named in the UCF as a port the module does not have; an inout port
  const f = { parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'D1', type: 'led', x: 0, y: 20 }], wires: [{ id: 'a', points: [[10, 30], [0, 20]] }, { id: 'b', points: [[0, 30], [1, 20]] }] };
  const sys2 = system([{ ...FPGA, pins: { ...FPGA.pins, ghost: 'B2' } }, TERM, UNO, BENCH]);
  assert.deepEqual(circuitNodePins(sys2, BENCH, normalizeCircuit(f), { ports: PORTS }).problems.map((p) => p.message), [
    'bench: F1 JA1 is fpga\'s ghost (pin B2), no port of uart', 'bench: F1 JB2 (pin B6) is wired in the circuit, but no port of fpga\'s module is on that pin']);
  assert.deepEqual(circuitNodePins(sys2, BENCH, normalizeCircuit(f), { ports: { uart: [...PORTS.uart, { name: 'ghost', dir: 'inout', width: 1 }] } }).problems.map((p) => p.message)[0],
    'bench: F1 JA1 is fpga\'s ghost, an inout port: not joined to the circuit yet (an input or an output)');
  // the Uno's SDA and its A4 (joined inside it) both wired: the node's A4 once
  const u = { parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'D1', type: 'led', x: 0, y: -4 }, { id: 'D2', type: 'led', x: 14, y: 23 }], wires: [{ id: 'a', points: [[1, 0], [0, -4]] }, { id: 'b', points: [[17, 19], [14, 23]] }] };
  assert.deepEqual(circuitNodePins(sys, BENCH, normalizeCircuit(u)).pins.map((p) => [p.name, p.nodePin]), [['A1:SDA', 'A4']]);
});

test('#5215 the check of a circuit node: its fields; its boards and pins with its circuit read; a pin both a link\'s and the circuit\'s; the nodes it reaches join something', () => {
  const lines = (sys, ctx) => analyzeSystem(sys, { modules: PORTS, files: ['src/bench.circ.json', 'fw/p.hex'], ...ctx }).diags.map((d) => `${d.severity}: ${d.message}`);
  // (its circuit not read: its fields only; the Uno joins nothing)
  assert.deepEqual(lines(system()), ['warning: uno joins nothing: no link reaches it', 'warning: bench joins nothing: no link reaches it']);
  assert.deepEqual(lines(system(), { circuits: { 'src/bench.circ.json': bench() } }), [`warning: ${HOT}`]);
  assert.deepEqual(lines(system([FPGA, TERM, UNO, { ...BENCH, circuit: null }])), ['error: bench: a circuit node with no circuit (a .circ.json of the project)', 'warning: uno joins nothing: no link reaches it', 'warning: bench joins nothing: no link reaches it']);
  assert.deepEqual(lines(system([FPGA, TERM, UNO, { ...BENCH, circuit: 'src/b.sch.json' }])).slice(0, 1), ['error: bench: its circuit src/b.sch.json is not a .circ.json']);
  assert.deepEqual(lines(system([FPGA, TERM, UNO, { ...BENCH, circuit: 'src/none.circ.json' }])).slice(0, 1), ['error: bench: no circuit src/none.circ.json in the project']);
  assert.deepEqual(lines(system([FPGA, TERM, UNO, { ...BENCH, interfaces: [{ name: 'x', kind: 'gpio', pins: ['a'], dir: 'in' }] }])).slice(0, 1), ['error: bench: a circuit node has no interfaces: its boards\' pins it wires are its links']);
  // the FPGA's btn also a GPIO link's, from the Uno's D5
  const linked = system([{ ...FPGA, interfaces: [...FPGA.interfaces, { name: 'press', kind: 'gpio', pins: ['btn'], dir: 'in' }] }, TERM, { ...UNO, interfaces: [{ name: 'out', kind: 'gpio', pins: ['D5'], dir: 'out' }] }, BENCH],
    [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }, { id: 'p', kind: 'gpio', a: 'uno.out', b: 'fpga.press' }]);
  assert.deepEqual(lines(linked, { circuits: { 'src/bench.circ.json': bench() } }), ['warning: p: uno\'s D5, a 5 V output, drives fpga\'s btn (pin C6), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards',
    `warning: ${HOT}`, 'error: bench: fpga\'s btn is both the link p\'s and the circuit\'s (F1 JB1)']);
});

test('#5215 the plan of a circuit node: a wire each way to an Arduino\'s pin, one to or from an FPGA\'s port; its errors', () => {
  const plan = systemPlan(system(), { ports: PORTS, circuits: { bench: bench() } });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.wires.filter((w) => w.link === 'bench').map((w) => [w.name, w.from, w.to]), [
    ['bench_A1_D8', 'uno.D8', 'bench.A1:D8'], ['bench_A1_D8_back', 'bench.A1:D8', 'uno.D8'],
    ['bench_A1_D3', 'uno.D3', 'bench.A1:D3'], ['bench_A1_D3_back', 'bench.A1:D3', 'uno.D3'],
    ['bench_A1_D2', 'uno.D2', 'bench.A1:D2'], ['bench_A1_D2_back', 'bench.A1:D2', 'uno.D2'],
    ['bench_F1_JB1', 'bench.F1:JB1', 'fpga.btn'], ['bench_F1_JB3', 'fpga.led[0]', 'bench.F1:JB3']]);
  assert.deepEqual(plan.fpga[0].pins, ['tx', 'led[0]']);
  assert.deepEqual(plan.circuits.map((c) => [c.id, c.pins.map((p) => p.name)]), [['bench', ['A1:D8', 'A1:D3', 'A1:D2', 'F1:JB1', 'F1:JB3']]]);
  assert.deepEqual(systemPlan(system([FPGA, TERM, UNO, { ...BENCH, circuit: null }]), { ports: PORTS }).errors, ['bench: no circuit: a .circ.json of the project']);
  assert.deepEqual(systemPlan(system(), { ports: PORTS }).errors, ['bench: its circuit src/bench.circ.json not read']);
  const wrong = normalizeCircuit({ name: 'b', parts: [{ id: 'A1', type: 'arduino-nano', x: 0, y: 0, label: 'uno' }] });
  assert.deepEqual(systemPlan(system(), { ports: PORTS, circuits: { bench: wrong } }).errors, ['bench: its circuit\'s A1 is an Arduino Nano, the node uno is on arduino-uno']);
});

// the Uno: D2 an output, high; D3 an input with its pull-up (a weak 1); D8 an input
const PROG = ['ldi r16, 0x04', 'out 0x0a, r16', 'ldi r16, 0x0c', 'out 0x0b, r16', 'loop:', 'rjmp loop'];

async function run(circuit, { ms = 60 } = {}) {
  const sys = system();
  const inputs = await systemInputs(sys, { ports: PORTS, netlist: () => uartNetlist(), firmware: async () => intelHex(avrAssemble(PROG)), circuit: async (p) => { assert.equal(p, 'src/bench.circ.json'); return JSON.stringify(circuit); } });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(sys, inputs);
  assert.equal(r.error, undefined);
  r.terminals.get('term').send([0x41]);
  r.sim.run(ms * 1e9);
  return { r, rep: systemReport(r) };
}

test('#5215 a circuit node simulated between an AVR and an FPGA: the Uno\'s D2 lights D1 and presses the FPGA\'s button; its LD0 lights D2 and is read on D8', async () => {
  const { r, rep } = await run(bench());
  // (the button pressed: the uart design's message, after the echo of A)
  assert.equal(rep.terminals.term, 'HAello from Silinx!\r\n');
  assert.deepEqual(rep.circuits, { bench: { D1: { on: true, times: 1 }, D2: { on: true, times: 1 } } });
  assert.equal(rep.lines.find((l) => l.startsWith('circuit ')), 'circuit bench: D1 on, lit 1 time(s); D2 on, lit 1 time(s)');
  const uno = r.sim.nodes.get('uno'), c = r.sim.nodes.get('bench');
  assert.equal(uno.inVals.get('D8'), 1, 'LD0 (A\'s bit 0) read on D8');
  // the switch's strong 0 against the pull-up's weak 1: 0, no short
  assert.deepEqual([c.value('A1:D3'), uno.inVals.get('D3')], [0, 0]);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  assert.deepEqual(rep.traffic.filter((t) => t.link === 'bench').map((t) => [t.wire, t.changes]), [
    ['bench_A1_D8', 1], ['bench_A1_D8_back', 3], ['bench_A1_D3', 2], ['bench_A1_D3_back', 1], ['bench_A1_D2', 3], ['bench_A1_D2_back', 3], ['bench_F1_JB1', 3], ['bench_F1_JB3', 2]]);
});

test('#5215 a short in a circuit node: the Uno\'s D2 (high) and a switch\'s 0 on one net, said once', async () => {
  const { rep } = await run(bench({ more: [{ id: 'S2', type: 'logic-switch', x: 25, y: -8 }], wires: [{ id: 'w8', points: [[25, -8], [16, 0]] }] }), { ms: 5 });
  assert.deepEqual(rep.warnings, ['bench: a short circuit at 2.188 µs: A1 D2, F1 JB1, D1 A, S2 out driven to 0 and 1 at once']);
});

test('#5215 the circuit\'s adapter alone: its pins, set strong or weak, its values, its changes in time', () => {
  // the Uno's D2 into a 7404's 1A, its 1Y on D3; the 7404 powered by the Uno's 5V and GND
  const at = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return { n: q.n, xy: [q.dx, q.dy] }; };
  const m = normalizeCircuit({ name: 'c', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0 }, { id: 'U1', type: '7404', x: 20, y: 5 }],
    wires: [{ id: 'a', points: [at('D2').xy, [20, 5]] }, { id: 'b', points: [at('D3').xy, [21, 5]] }, { id: 'c', points: [at('5V').xy, [20, 2]] }, { id: 'd', points: [[9, 19], [26, 5]] }] });
  const c = new CircuitNode({ model: m, pins: [{ name: 'A1:D2', part: 'A1', n: at('D2').n }, { name: 'A1:D3', part: 'A1', n: at('D3').n }] });
  assert.deepEqual([c.inputs, c.outputs, c.value('A1:D2'), c.value('A1:D3')], [['A1:D2', 'A1:D3'], ['A1:D2', 'A1:D3'], null, 0], 'D2 open: a 74LS input reads it high');
  c.setPin('A1:D2', 0);
  assert.deepEqual(c.advanceTo(100000), [{ pin: 'A1:D2', t: 0, value: 0 }, { pin: 'A1:D3', t: 10000, value: 1 }], 'the 7404\'s 10 ns');
  c.weakWhile('A1:D2', () => true);
  c.setPin('A1:D2', 1);
  assert.deepEqual(c.advanceTo(200000), [{ pin: 'A1:D2', t: 100000, value: 1 }, { pin: 'A1:D3', t: 110000, value: 0 }]);
  assert.throws(() => c.setPin('A1:D9', 1), /'A1:D9' is not a pin of the circuit/);
  assert.throws(() => c.advanceTo(0), /the node is at 200000 ps, not back at 0/);
});

test('#5215 a circuit node edited: added with its circuit, changed, no interface; described; read refused', async () => {
  const s0 = system([FPGA, TERM, UNO]);
  const a = addNode(s0, { kind: 'circuit', circuit: 'circuit/bench.circ.json', x: 40, y: 10 });
  assert.deepEqual([a.id, a.system.nodes.at(-1)], ['circuit', { id: 'circuit', kind: 'circuit', circuit: 'circuit/bench.circ.json', interfaces: [], x: 40, y: 10 }]);
  const b = changeNode(a.system, 'circuit', { id: 'bench', circuit: 'bench/b2.circ.json' });
  assert.deepEqual(b.system.nodes.at(-1), { id: 'bench', kind: 'circuit', circuit: 'bench/b2.circ.json', interfaces: [], x: 40, y: 10 });
  assert.deepEqual(changeNode(b.system, 'bench', { board: 'x' }), { error: 'bench: a Circuit node has no field \'board\' (id, circuit, spiHz, x, y)' });
  assert.deepEqual(addInterface(b.system, 'bench', { kind: 'gpio' }), { error: 'bench: a circuit node has no interfaces: its boards\' pins it wires are its links' });
  assert.equal(editSystem(s0, { action: 'add_node', fields: { kind: 'circuit', id: 'mid', circuit: 'mid/m.circ.json' } }).id, 'mid');
  assert.ok(describeSystem(b.system).includes('node bench: circuit bench/b2.circ.json'));
  // (renamed with its node, #5488; one outside its folder refused)
  assert.equal(changeNode(a.system, 'circuit', { id: 'board2' }).system.nodes.at(-1).circuit, 'board2/bench.circ.json');
  assert.deepEqual(addNode(s0, { kind: 'circuit', circuit: 'src/bench.circ.json' }), { error: "circuit: its circuit 'src/bench.circ.json' is not in its folder circuit/" });
  const bad = await systemInputs(system(), { ports: PORTS, netlist: () => uartNetlist(), firmware: async () => '', circuit: async () => { throw new Error('no such file'); } });
  assert.deepEqual(bad, { error: 'bench: its circuit src/bench.circ.json cannot be read: no such file' });
});

// #5322: the bench of the System Emulator: the Basys2 (fpga) alone, its JB1 (the FPGA's btn) driven by a logic switch S1
// (off), its JB3 (led<0>) lighting D2; a clock CK1 at 50 Hz lighting D3
const EMU_BENCH = normalizeCircuit({ name: 'bench', parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 30, label: 'fpga' }, { id: 'S1', type: 'logic-switch', x: 8, y: 25 },
  { id: 'D2', type: 'led', x: 12, y: 26 }, { id: 'CK1', type: 'clock', x: 20, y: 20, hz: 50 }, { id: 'D3', type: 'led', x: 22, y: 22 }],
wires: [{ id: 'w1', points: [[8, 25], [9, 30]] }, { id: 'w5', points: [[11, 30], [12, 26]] }, { id: 'w6', points: [[13, 26], [4, 30]] },
  { id: 'w7', points: [[20, 20], [22, 22]] }, { id: 'w8', points: [[23, 22], [4, 30]] }] });

test('#5322 a circuit node emulated: its switch set at 5 ms (the FPGA\'s message), its LEDs\' states, its clock ticking; its inputs; a wrong one refused', async () => {
  const { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } = await import('../core/system-emu.js');
  const sys = system([FPGA, TERM, BENCH]);
  const inputs = await systemInputs(sys, { ports: PORTS, netlist: () => uartNetlist(), firmware: async () => '', circuit: async () => JSON.stringify(EMU_BENCH) });
  const boards = emulationBoards(sys, inputs);
  const c = boards.find((b) => b.kind === 'circuit');
  assert.deepEqual([c.id, c.inputs, c.outputs], ['bench', [{ pin: 'S1', part: 'S1', index: 0, kind: 'level' }], []]);
  const r = systemFromInputs(sys, withBoards(inputs, boards));
  watchBoards(r.sim, boards);
  r.sim.run(5e9);
  setBoardInput(r.sim, c, 'S1', 1);
  r.sim.run(55e9);
  const s = boardStates(r.sim, boards, 0, r.sim.now);
  assert.equal(systemReport(r).terminals.term, 'Hello from Silinx!\r\n', 'S1 on: the button held');
  assert.deepEqual(s.bench.inputs, { S1: true, CK1: r.sim.nodes.get('bench').sim.inputs().CK1 });
  assert.deepEqual(s.bench.leds.D2, 'off', 'LD0: the last byte sent is CR LF\'s LF, its bit 0 a 0');
  assert.ok(systemReport(r).circuits.bench.D3.times >= 2, 'the clock\'s LED lit at 50 Hz');
  assert.ok(Array.isArray(s.bench.lit));
  assert.throws(() => setBoardInput(r.sim, c, 'S9', 1), /'S9' is not a switch or a button of the circuit bench/);
});

test('#5322 a circuit\'s clock ticks at its frequency in the node; a DIP switch\'s levers its inputs', async () => {
  const m = normalizeCircuit({ name: 'c', parts: [{ id: 'CK1', type: 'clock', x: 0, y: 0, hz: 10 }, { id: 'DIP1', type: 'dip-4', x: 10, y: 10 }, { id: 'D1', type: 'led', x: 0, y: 3 }],
    wires: [{ id: 'a', points: [[0, 0], [0, 3]] }] });
  const n = new CircuitNode({ model: m, pins: [] });
  const states = [];
  for (let k = 1; k <= 6; k++) { n.advanceTo(k * 25e9); states.push(n.sim.inputs().CK1); }
  assert.deepEqual(states, [false, true, true, false, false, true], 'its edges at 50, 100, 150 ms');
  n.setInput('DIP1', true, 2);
  assert.deepEqual(n.sim.inputs().DIP1, [false, false, true, false]);
  const { emulationBoards } = await import('../core/system-emu.js');
  const b = emulationBoards(system([{ ...BENCH }]), { plan: { wires: [], circuits: [{ id: 'bench', model: m, pins: [] }] }, netlists: {} });
  assert.deepEqual(b[0].inputs.map((x) => x.pin), ['DIP1:1', 'DIP1:2', 'DIP1:3', 'DIP1:4']);
});

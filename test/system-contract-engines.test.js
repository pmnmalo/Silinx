// Every engine against the node contract (#5485, core/system-contract.js): a shared conformance test. Each engine
// behind the contract (the FPGA's compiled engine and event-driven simulator on the `uart` example's design, the AVR on
// the echo program, the circuit on a 7404, the serial terminal, the PIC24's Pic24Node, a stimulus) meets it: its typed
// ports and fidelity notes; run in windows, its inputs at their times, its outputs at theirs; its state saved mid-run and
// restored on a new node giving the same run after it; no warnings. A node of the contract only in the scheduler
// (core/system-sim.js NodeEngine), and a node's lookahead bounding its windows.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ContractNode, StimulusNode, contractProblems, fidelityProblem, adapterPorts, NodeEngine } from '../core/system-contract.js';
import { port } from '../core/system-ports.js';
import { SystemSim } from '../core/system-sim.js';
import { compiledContract, CompiledNode, COMPILED_FIDELITY } from '../core/system-sim-compiled.js';
import { eventContract, EVENT_FIDELITY } from '../core/system-sim-event.js';
import { avrContract, loadAvr8js, CYCLE_PS, AVR_FIDELITY } from '../core/system-sim-avr.js';
import { circuitContract, CIRCUIT_FIDELITY } from '../core/system-sim-circuit.js';
import { terminalContract, TerminalNode, TERMINAL_FIDELITY } from '../core/system-sim-terminal.js';
import { PARTS } from '../core/circuit-parts.js';
import { normalizeCircuit } from '../core/circuit.js';
import { Pic24Node } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';
import { intelHex, echoProgram } from './avr-asm.mjs';
import { uartModel, uartDesign, MESSAGE } from './system-sim-lib.mjs';

before(() => loadAvr8js());

// a byte's frame (8N1) on a pin from t, a bit `bit` ps: its events
const frame = (byte, t, bit, pin) => [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), 1].map((value, i) => ({ pin, t: t + i * bit, value }));

// the node run from `from` to `to` in windows of `step`, each with the events of [its start, its end) (the last's end too)
function runWindows(node, events, from, to, step) {
  const outs = [];
  for (let t = from; t < to; t += step) {
    const t1 = Math.min(t + step, to);
    outs.push(...node.run(t1, events.filter(e => e.t >= t && (e.t < t1 || (t1 === to && e.t === to)))).outputs);
  }
  return outs;
}

// the conformance of the nodes `make()` makes: the contract met; a run in windows; saved at `mid`, restored on a new
// node, the run after it the same as the first node's; no warnings, no errors
function conforms(make, { events, end, mid, step, fidelity = true }) {
  const a = make();
  assert.deepEqual(contractProblems(a), [], 'the contract met');
  if (fidelity) assert.ok(a.fidelity.length && a.fidelity.every(f => f.text), 'its fidelity notes');
  const before = runWindows(a, events, 0, mid, step);
  const s = a.save();
  const b = make();
  b.restore(s);
  const after = runWindows(a, events, mid, end, step), again = runWindows(b, events, mid, end, step);
  assert.deepEqual(again, after, 'restored, the same run');
  assert.deepEqual([...a.messages(), ...b.messages()], [], 'no warnings, no errors');
  return { a, b, outputs: [...before, ...after] };
}

test('the compiled engine behind the contract: the uart design echoes a byte, restored mid-byte', async () => {
  const BIT = 1e6;   // (1 Mbaud at 50 MHz)
  const m = await uartModel({ hz: 50e6, baud: 1e6 });
  const make = () => compiledContract({ ...m, period: 20000 }, { volts: 3.3 });
  const n = make();
  assert.deepEqual(n.ports.map(p => [p.name, p.dir, p.volts]), [['tx', 'out', 3.3], ['rx', 'in', 3.3], ['btn', 'in', 3.3]]);
  const events = [{ pin: 'rx', t: 0, value: 1 }, ...frame(0x41, 2 * BIT, BIT, 'rx')];
  const { outputs, b } = conforms(make, { events, end: 30 * BIT, mid: 6 * BIT, step: BIT / 4 });
  assert.ok(outputs.length >= 2, 'its echo on tx');
  assert.deepEqual(outputs.at(-1).value, 1, 'tx idle at the end');
  assert.equal(b.value('tx'), 1);
  // (the outputs the adapter alone gives, in one run: the same)
  const alone = new CompiledNode({ ...m, period: 20000 });
  const out = [];
  for (const e of events) { out.push(...alone.advanceTo(e.t)); alone.setPin(e.pin, e.value); }
  out.push(...alone.advanceTo(30 * BIT));
  assert.deepEqual(outputs, out);
});

test('the event-driven simulator behind the contract: the uart design echoes a byte, restored mid-byte', () => {
  const BIT = 1e6;
  const make = () => eventContract({ design: () => uartDesign({ hz: 50e6, baud: 1e6 }), clocks: [{ port: 'clk', period: 20000 }], pins: ['tx'] });
  const events = [{ pin: 'rx', t: 0, value: 1 }, ...frame(0x5a, BIT, BIT, 'rx')];
  const { outputs } = conforms(make, { events, end: 22 * BIT, mid: 5 * BIT, step: 2 * BIT });
  // (its echo: 0x5A's frame on tx, after the byte received)
  assert.ok(outputs.filter(o => o.pin === 'tx').length >= 4, 'its echo on tx');
});

test('the AVR behind the contract: the echo program\'s "Hi", a byte received and sent back plus one, restored mid-byte', () => {
  const BIT = 1664 * CYCLE_PS;   // (9600 baud)
  const make = () => avrContract({ board: 'arduino-uno', firmware: { name: 'fw/echo.hex', data: intelHex(echoProgram()) } });
  const n = make();
  assert.deepEqual(n.ports.find(p => p.name === 'D1'), port({ name: 'D1', dir: 'inout', volts: 5 }));
  assert.equal(n.ports.length, 20);
  const events = [{ pin: 'D0', t: 0, value: 1 }, ...frame(0x30, 30 * BIT, BIT, 'D0')];
  const { outputs } = conforms(make, { events, end: 60 * BIT, mid: 34 * BIT, step: 3 * BIT });
  assert.ok(outputs.some(o => o.pin === 'D1'), 'its USART on D1');
  assert.ok(outputs.some(o => o.pin === 'D8'), 'the byte shown on port B');
});

test('the circuit behind the contract: a 7404 inverts D2 onto D3, restored between two changes', () => {
  const at = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return { n: q.n, xy: [q.dx, q.dy] }; };
  const model = normalizeCircuit({ name: 'c', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0 }, { id: 'U1', type: '7404', x: 20, y: 5 }],
    wires: [{ id: 'a', points: [at('D2').xy, [20, 5]] }, { id: 'b', points: [at('D3').xy, [21, 5]] }, { id: 'c', points: [at('5V').xy, [20, 2]] }, { id: 'd', points: [[9, 19], [26, 5]] }] });
  const make = () => circuitContract({ model, pins: [{ name: 'A1:D2', part: 'A1', n: at('D2').n }, { name: 'A1:D3', part: 'A1', n: at('D3').n }] });
  const events = [{ pin: 'A1:D2', t: 0, value: 0 }, { pin: 'A1:D2', t: 300000, value: 1 }, { pin: 'A1:D2', t: 700000, value: 0 }];
  const { outputs } = conforms(make, { events, end: 1e6, mid: 500000, step: 100000 });
  assert.deepEqual(outputs.filter(o => o.pin === 'A1:D3').map(o => [o.t, o.value]), [[10000, 1], [310000, 0], [710000, 1]], 'the 7404\'s 10 ns');
});

test('the terminal behind the contract: its bytes typed on tx, those on rx decoded, restored mid-byte', () => {
  const BIT = 1e6;
  const make = () => terminalContract({ baud: 1e6 }, { send: [0x4f, 0x4b] });
  const events = [{ pin: 'rx', t: 0, value: 1 }, ...frame(0x21, 3 * BIT, BIT, 'rx')];
  const { a, b, outputs } = conforms(make, { events, end: 25 * BIT, mid: 7 * BIT, step: BIT });
  assert.deepEqual(b.engine.received.map(x => x.byte), [0x21]);
  assert.deepEqual(a.engine.received, b.engine.received);
  assert.equal(outputs.filter(o => o.pin === 'tx').at(-1).t, 19 * BIT, 'OK\'s last stop bit');
});

test('the PIC24\'s Pic24Node behind the contract: its run of its own, an input answered on an output, restored', () => {
  const make = () => new ContractNode({
    make: () => {
      const node = new Pic24Node({ program: pic24Assemble(['loop: inc w0, w0', 'bra loop']).words, fcy: 1e6 });
      node.onInput('RD6', (v) => node.drive('RA0', v ? 0 : 1));
      return node;
    },
    ports: [port({ name: 'RD6', dir: 'in', volts: 3.3 }), port({ name: 'RA0', dir: 'out', volts: 3.3 })],
    fidelity: [{ kind: 'models', text: 'the PIC24F core, instruction by instruction, at Fcy' }],
  });
  const events = [2e6, 5e6, 9e6, 14e6].map((t, i) => ({ pin: 'RD6', t, value: i % 2 ? 0 : 1 }));
  const { a, b, outputs } = conforms(make, { events, end: 20e6, mid: 7e6, step: 1e6 });
  assert.deepEqual(outputs.map(o => [o.t, o.value]), [[3e6, 0], [6e6, 1], [9e6, 0], [15e6, 1]], 'each answered at its instruction\'s end (inc 1 cycle, bra 2: 9 µs a boundary)');
  assert.equal(b.engine.cpu.W(0), a.engine.cpu.W(0), 'the same registers');
});

test('a stimulus meets the contract: its events, saved and restored', () => {
  const make = () => new StimulusNode({ ports: [port({ name: 'o', dir: 'out' })], events: [1, 3, 6, 8].map((t, i) => ({ pin: 'o', t: t * 1000, value: i % 2 })) });
  const { outputs } = conforms(make, { events: [], end: 10000, mid: 4000, step: 1500, fidelity: false });
  assert.deepEqual(outputs.map(o => o.t), [1000, 3000, 6000, 8000]);
});

test('each engine\'s fidelity notes: what it models first, then what it approximates and leaves out', () => {
  for (const notes of [COMPILED_FIDELITY, EVENT_FIDELITY, AVR_FIDELITY, CIRCUIT_FIDELITY, TERMINAL_FIDELITY]) {
    assert.equal(notes[0].kind, 'models');
    assert.equal(fidelityProblem(notes), null);
  }
  assert.deepEqual(AVR_FIDELITY.map(n => n.kind), ['models', 'approximates', 'omits']);
  assert.equal(AVR_FIDELITY[2].text, 'SPI and TWI as a peripheral (master only)');
  assert.equal(terminalContract().fidelity, TERMINAL_FIDELITY);
});

test('an adapter\'s pins as typed ports: an output, an input, both an inout one', () => {
  assert.deepEqual(adapterPorts({ inputs: ['rx', 'btn'], outputs: ['tx'] }).map(p => [p.name, p.dir, p.volts]), [['tx', 'out', null], ['rx', 'in', null], ['btn', 'in', null]]);
  assert.deepEqual(adapterPorts({ inputs: ['D0'], outputs: ['D0'] }, { volts: 5 }).map(p => [p.name, p.dir, p.volts]), [['D0', 'inout', 5]]);
  assert.deepEqual(adapterPorts({ inputs: [], outputs: [] }), []);
});

// ---------------------------------------------------------------- the scheduler

test('the scheduler with nodes of the contract only: a stimulus\'s UART frames to a terminal behind the contract, the same bytes as the terminal\'s adapter', () => {
  const BIT = 1e6, bytes = [...'Hi!'].map(c => c.charCodeAt(0));
  const run = (term) => {
    const sys = new SystemSim();
    const st = sys.addNode('st', new StimulusNode({ ports: [port({ name: 'tx', dir: 'out' })], events: [{ pin: 'tx', t: 0, value: 1 }, ...bytes.flatMap((b, i) => frame(b, (2 + 11 * i) * BIT, BIT, 'tx'))] }));
    assert.ok(st instanceof NodeEngine, 'put behind an adapter');
    sys.addNode('term', term);
    sys.link({ from: 'st.tx', to: 'term.rx', kind: 'uart', baud: 1e6, latency: BIT / 16 });
    sys.run(40 * BIT);
    assert.deepEqual(sys.log, [], 'no warnings, no errors');
    return sys;
  };
  const raw = new TerminalNode({ baud: 1e6 });
  const a = run(raw);
  const c = terminalContract({ baud: 1e6 });
  const b = run(c);
  assert.deepEqual(raw.received.map(x => x.byte), bytes);
  assert.deepEqual(c.engine.received, raw.received, 'byte for byte, at the same times');
  assert.deepEqual(b.links.get('st.tx>term.rx').trace, a.links.get('st.tx>term.rx').trace);
  assert.equal(b.stats.windows, a.stats.windows);
});

test('the scheduler: a node\'s lookahead bounds its windows; a contract node\'s at(t), its inputs set and its errors', () => {
  const sys = new SystemSim({ wide: 100e6 });
  const st = new StimulusNode({ ports: [port({ name: 'o', dir: 'out' }), port({ name: 'i', dir: 'in' })], events: [{ pin: 'o', t: 0, value: 0 }] });
  st.lookahead = 7e6;
  const e = sys.addNode('st', st);
  const ends = [];
  e.at(20e6, (x) => { ends.push(x.now); x.setPin('i', 1); });
  sys.run(50e6);
  assert.equal(sys.stats.windows, 8, 'windows of 7 µs at most (and one to the event at 20 µs)');
  assert.deepEqual(ends, [20e6]);
  assert.deepEqual(st.received, [{ pin: 'i', t: 20e6, value: 1 }]);
  assert.equal(e.value('i'), 1);
  assert.equal(e.value('o'), 0);
  assert.throws(() => e.setPin('o', 1), /^Error: 'o' is not an input of the node$/);
  assert.throws(() => e.advanceTo(0), /the node is at 50000000 ps, not back at 0/);
  assert.throws(() => new NodeEngine({ ports: [] }), /^Error: no run\(\)$/);
  // (a node that ends a run past t1: its next run from there, its inputs at its time)
  const pic = new ContractNode({ make: () => { const n = new Pic24Node({ program: pic24Assemble(['loop: inc w0, w0', 'bra loop']).words, fcy: 1e6 }); n.onInput('RD6', v => n.drive('RA0', v)); return n; },
    ports: [port({ name: 'RD6', dir: 'in' }), port({ name: 'RA0', dir: 'out' })] });
  const pe = new NodeEngine(pic);
  pe.advanceTo(2.5e6);
  pe.setPin('RD6', 1);
  assert.deepEqual([...pe.advanceTo(2.7e6), ...pe.advanceTo(5e6)], [{ pin: 'RA0', t: 3e6, value: 1 }], 'as the instruction under way ends');
});

test('the scheduler unchanged by the contract: the uart example\'s message on a UART link the same through ContractNode', async () => {
  const BIT = 1e6;
  const m = await uartModel({ hz: 50e6, baud: 1e6 });
  const run = (a) => {
    const sys = new SystemSim();
    sys.addNode('a', a);
    const t = sys.addNode('t', new TerminalNode({ baud: 1e6 }));
    sys.link({ name: 'ab', from: 'a.tx', to: 't.rx', kind: 'uart', baud: 1e6, latency: BIT / 16 });
    a.setPin('rx', 1);
    sys.at(10e6, () => a.setPin('btn', 1));
    sys.at(12e6, () => a.setPin('btn', 0));
    sys.run(300 * BIT);
    return { sys, t };
  };
  const x = run(new CompiledNode({ ...m, period: 20000 }));
  const y = run(new NodeEngine(compiledContract({ ...m, period: 20000 })));
  assert.deepEqual(x.t.received.map(b => b.byte), MESSAGE);
  assert.deepEqual(y.t.received, x.t.received);
  assert.deepEqual(y.sys.links.get('ab').trace, x.sys.links.get('ab').trace);
  assert.deepEqual([x.sys.log, y.sys.log], [[], []]);
});

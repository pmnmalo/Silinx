// A System node's contract (#5485, core/system-contract.js), its typed ports (core/system-ports.js) and its link kinds
// (core/system-links.js): the ports' fields and their errors; the link kinds, their protocols, their lookahead (as the
// scheduler's links have it, core/system-build.js) and the ends they join; an engine's adapter run to t1 with its input
// events at their times; an engine behind the contract, its state saved and restored giving the same run; a stimulus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { port, portProblem, portsProblems, PORT_KINDS, PORT_DIRS, PORT_ROLES, LEVELS, drives, reads } from '../core/system-ports.js';
import { LINK_TYPES, LINK_TYPE_NAMES, BUS_PINS, linkTypeOf, lookahead, endsProblem, NETWORK_LATENCY, BUS_HZ, ANALOG_HZ } from '../core/system-links.js';
import { ContractNode, StimulusNode, runEngine, contractProblems, fidelityProblem, FIDELITY_KINDS } from '../core/system-contract.js';
import { TerminalNode } from '../core/system-sim-terminal.js';
import { FINE, UART_DIV } from '../core/system-sim.js';

// ---------------------------------------------------------------- typed ports

test('a port: its defaults, frozen; its direction, kind, level, width, protocol and role checked', () => {
  const p = port({ name: 'tx', dir: 'out' });
  assert.deepEqual({ ...p }, { name: 'tx', dir: 'out', kind: 'pin', volts: null, width: 1, protocol: null, role: null });
  assert.ok(Object.isFrozen(p));
  assert.deepEqual(PORT_KINDS, ['pin', 'transaction', 'memory', 'analog', 'message']);
  assert.deepEqual(PORT_DIRS, ['in', 'out', 'inout']);
  assert.deepEqual(LEVELS, [3.3, 5]);
  assert.deepEqual(PORT_ROLES, ['master', 'peripheral', 'peer', 'manager', 'subordinate', 'client', 'broker']);
  const bus = port({ name: 'Serial', dir: 'inout', kind: 'transaction', protocol: 'uart', role: 'peer', volts: 5 });
  assert.equal(bus.volts, 5);
  assert.equal(port({ name: 'led', dir: 'out', width: 8, volts: 2.5 }).width, 8);   // (an FPGA bank's 2.5 V: a level too)
  assert.ok(drives(p) && !reads(p));
  assert.ok(drives(bus) && reads(bus));
  assert.ok(reads(port({ name: 'rx', dir: 'in' })) && !drives(port({ name: 'rx', dir: 'in' })));
  assert.throws(() => port({ name: 'x', dir: 'up' }), /^Error: x: its direction 'up' is not in, out, inout$/);
  assert.throws(() => port({ name: 'x', dir: 'in', kind: 'wire' }), /^Error: x: no port kind 'wire' \(the kinds: pin, transaction, memory, analog, message\)$/);
  assert.throws(() => port({ name: 'x', dir: 'in', volts: -3 }), /^Error: x: its level '-3' is not a voltage \(V\)$/);
  assert.throws(() => port({ name: 'x', dir: 'in', volts: '5' }), /its level '5' is not a voltage/);
  assert.throws(() => port({ name: 'x', dir: 'in', width: 0 }), /^Error: x: its width '0' is not 1 or more$/);
  assert.throws(() => port({ name: 'x', dir: 'in', role: 'boss' }), /^Error: x: no role 'boss'/);
  assert.throws(() => port({ name: 'x', dir: 'in', protocol: 'uart' }), /^Error: x: a pin has no protocol/);
  assert.throws(() => port({ name: '', dir: 'in' }), /^Error: a port with no name$/);
  assert.equal(portProblem(null), 'a port is an object { name, dir, kind }');
});

test('a node\'s ports: each checked, two of one name said, not a list said', () => {
  assert.deepEqual(portsProblems([port({ name: 'a', dir: 'in' }), port({ name: 'b', dir: 'out' })]), []);
  assert.deepEqual(portsProblems([]), []);
  assert.deepEqual(portsProblems([port({ name: 'a', dir: 'in' }), port({ name: 'a', dir: 'out' }), { name: 'c', dir: 'in', kind: 'pin', width: 1, volts: 0 }]),
    ['two ports are named a', "c: its level '0' is not a voltage (V)"]);
  assert.deepEqual(portsProblems(null), ['the ports are a list']);
});

// ---------------------------------------------------------------- link kinds

test('the link kinds: their protocols, the ports they join, a protocol\'s kind', () => {
  assert.deepEqual(LINK_TYPE_NAMES, ['pin', 'transaction', 'memory', 'analog', 'network']);
  assert.deepEqual(LINK_TYPES.transaction.protocols, ['uart', 'spi', 'i2c', 'onewire', 'can']);
  assert.deepEqual(LINK_TYPES.memory.protocols, ['axi-lite', 'axi-stream']);
  assert.deepEqual(LINK_TYPES.network.protocols, ['wifi', 'mqtt', 'ble']);
  assert.ok(Object.isFrozen(LINK_TYPES));
  const kinds = { wire: 'pin', gpio: 'pin', uart: 'transaction', spi: 'transaction', i2c: 'transaction', onewire: 'transaction', can: 'transaction', 'axi-lite': 'memory', 'axi-stream': 'memory', analog: 'analog', wifi: 'network', mqtt: 'network', ble: 'network' };
  for (const [p, k] of Object.entries(kinds)) assert.equal(linkTypeOf(p), k, p);
  assert.equal(linkTypeOf('usb'), null);
  assert.equal(linkTypeOf(undefined), null);
  // (every protocol of one kind only; a bus's pins as its adapter makes them)
  const all = LINK_TYPE_NAMES.flatMap(k => LINK_TYPES[k].protocols);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(Object.keys(BUS_PINS), LINK_TYPES.transaction.protocols);
  assert.deepEqual(BUS_PINS.spi, ['sck', 'mosi', 'miso', 'ss']);
});

test('a link\'s lookahead: the scheduler\'s latencies (a UART\'s sixteenth of a bit, SPI\'s and I²C\'s of a clock\'s period, a wire\'s FINE)', () => {
  // (as core/system-build.js gives its wires' latencies)
  assert.equal(lookahead({ protocol: 'uart', baud: 9600 }), Math.round(1e12 / 9600 / UART_DIV));
  assert.equal(lookahead({ protocol: 'uart', baud: 115200 }), 542535);
  assert.equal(lookahead({ protocol: 'spi', hz: 125000 }), Math.round(1e12 / 125000 / 16));
  assert.equal(lookahead({ protocol: 'i2c', hz: 100000 }), 625000);
  assert.equal(lookahead({ protocol: 'wire' }), FINE);
  assert.equal(lookahead(), FINE);
  assert.equal(lookahead({ protocol: 'gpio' }), FINE);
  assert.equal(lookahead({ protocol: 'onewire' }), FINE);
  assert.equal(lookahead({ protocol: 'can', baud: 500000 }), 125000);
  assert.equal(BUS_HZ, 100e6);
  assert.equal(lookahead({ protocol: 'axi-lite' }), 10000);              // (one period of 100 MHz)
  assert.equal(lookahead({ protocol: 'axi-stream', hz: 50e6 }), 20000);
  assert.equal(ANALOG_HZ, 1e6);
  assert.equal(lookahead({ protocol: 'analog' }), 1e6);                  // (1 MHz sampling)
  assert.equal(lookahead({ protocol: 'analog', hz: 10e3 }), 1e8);
  assert.equal(lookahead({ protocol: 'mqtt' }), NETWORK_LATENCY);
  assert.equal(lookahead({ protocol: 'uart', baud: 9600, latency: 1234.4 }), 1234);   // (a fixed latency, given)
  assert.throws(() => lookahead({ protocol: 'uart', baud: 0 }), /^Error: a uart link needs its baud rate$/);
  assert.throws(() => lookahead({ protocol: 'spi' }), /^Error: a spi link needs its clock \(hz\)$/);
  assert.throws(() => lookahead({ protocol: 'analog', hz: -1 }), /needs its sampling rate/);
  assert.throws(() => lookahead({ protocol: 'usb' }), /^Error: no link of protocol 'usb'$/);
  assert.throws(() => lookahead({ latency: 0.5 }), /^Error: a link's latency: 1 ps or more$/);
});

test('a link\'s ends: the port kinds its kind joins, a bus\'s protocol, a driver and a driven end', () => {
  const out = port({ name: 'uno.D1', dir: 'out', volts: 5 }), inp = port({ name: 'fpga.rx', dir: 'in', volts: 3.3 });
  assert.equal(endsProblem('gpio', out, inp), null);
  assert.equal(endsProblem('uart', out, inp), null);   // (a bus's pins: its adapter's)
  const serial = port({ name: 'term.Serial', dir: 'inout', kind: 'transaction', protocol: 'uart' });
  assert.equal(endsProblem('uart', serial, inp), null);
  assert.equal(endsProblem('spi', serial, inp), 'term.Serial is a uart port, the link spi');
  assert.equal(endsProblem('gpio', serial, inp), 'term.Serial is a port of kind transaction: a gpio link joins pin ports');
  assert.equal(endsProblem('gpio', inp, out), 'fpga.rx is an input: it drives no link');
  assert.equal(endsProblem('gpio', out, port({ name: 'x.o', dir: 'out' })), 'x.o is an output: the link cannot drive it');
  const axi = port({ name: 'ps.M_AXI', dir: 'inout', kind: 'memory', protocol: 'axi-lite', role: 'manager' });
  assert.equal(endsProblem('axi-lite', axi, port({ name: 'pl.S_AXI', dir: 'inout', kind: 'memory', protocol: 'axi-lite', role: 'subordinate' })), null);
  assert.equal(endsProblem('axi-lite', axi, inp), 'fpga.rx is a port of kind pin: a axi-lite link joins memory ports');
  assert.equal(endsProblem('analog', port({ name: 'pot.w', dir: 'out', kind: 'analog' }), port({ name: 'uno.A0', dir: 'in' })), null);
  assert.equal(endsProblem('mqtt', port({ name: 'esp.net', dir: 'inout', kind: 'message' }), port({ name: 'broker.net', dir: 'inout', kind: 'message' })), null);
  assert.equal(endsProblem('usb', out, inp), 'no link of protocol \'usb\' (the link kinds: pin, transaction, memory, analog, network)');
});

// ---------------------------------------------------------------- the node contract

const BAUD = 1e6, BIT = 1e12 / BAUD;
// a byte's frame (8N1) on a pin from t: its events
const frame = (byte, t, pin = 'rx') => [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), 1].map((value, i) => ({ pin, t: t + i * BIT, value }));
const termPorts = [port({ name: 'rx', dir: 'in' }), port({ name: 'tx', dir: 'out' })];
const terminal = () => new ContractNode({ make: () => new TerminalNode({ baud: BAUD }), ports: termPorts,
  fidelity: [{ kind: 'models', text: 'a UART at its baud and frame' }] });

test('the contract: a node\'s methods, ports, lookahead and fidelity notes checked', () => {
  assert.deepEqual(contractProblems(terminal()), []);
  assert.deepEqual(contractProblems(new StimulusNode({ ports: termPorts })), []);
  assert.deepEqual(contractProblems({ ports: [] }), ['no run()', 'no save()', 'no restore()', 'no messages()']);
  assert.deepEqual(contractProblems({ run() {}, save() {}, restore() {}, messages() {}, ports: [], lookahead: 0, fidelity: [{ kind: 'maybe', text: 'x' }] }),
    ["its lookahead '0' is not a time (ps, 1 or more)", "a fidelity note's kind 'maybe' is not models, approximates, omits"]);
  assert.deepEqual(contractProblems(null), ['a node is an object']);
  assert.deepEqual(FIDELITY_KINDS, ['models', 'approximates', 'omits']);
  assert.equal(fidelityProblem([{ kind: 'omits', text: '' }]), 'a fidelity note with no text');
  assert.equal(fidelityProblem('x'), 'the fidelity notes are a list');
  assert.equal(fidelityProblem([]), null);
  assert.throws(() => new ContractNode({ make: () => new TerminalNode(), ports: [port({ name: 'rx', dir: 'in' }), port({ name: 'rx', dir: 'out' })] }), /^Error: two ports are named rx$/);
  assert.throws(() => new ContractNode({ ports: termPorts }), /a function that makes it/);
  assert.throws(() => new ContractNode({ make: () => new TerminalNode(), ports: termPorts, lookahead: -1 }), /its lookahead '-1'/);
});

test('an engine\'s adapter run to t1: its inputs at their times (in time order, one time in its order), its outputs and time', () => {
  const t = new TerminalNode({ baud: BAUD });
  t.send([0x55]);
  const events = [...frame(0x41, 2 * BIT)].reverse();   // (given in any order)
  const r = runEngine(t, 20 * BIT, [{ pin: 'rx', t: 0, value: 1 }, ...events]);
  assert.equal(r.t, 20 * BIT);
  // (0x55's frame on tx: 0 1 0 1 0 1 0 1 0 1, each change at its bit)
  assert.deepEqual(r.outputs.map(o => [o.t / BIT, o.value]), [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0], [7, 1], [8, 0], [9, 1]]);
  assert.deepEqual(t.received.map(b => [b.byte, b.error]), [[0x41, null]]);
  assert.deepEqual(t.messages(), [], 'no warnings');
  assert.throws(() => runEngine(t, 5), /^Error: run\(t1\): a time from now \(20000000 ps\) on, not 5$/);
  assert.throws(() => runEngine(t, 30 * BIT, [{ pin: 'rx', t: 40 * BIT, value: 0 }]), /^Error: an input event at 40000000 ps: from now \(20000000 ps\) to t1 \(30000000 ps\)$/);
  assert.throws(() => runEngine(t, 30 * BIT, 'x'), /the input events are a list/);
});

test('an engine behind the contract: run in windows, its state saved and restored gives the same run, byte for byte', () => {
  const bytes = [0x48, 0x69, 0x21, 0x0d];
  const events = [{ pin: 'rx', t: 0, value: 1 }, ...bytes.flatMap((b, i) => frame(b, (1 + 12 * i) * BIT))];
  // run(t1, the events of [now, t1]) window after window
  const runAll = (node, from, to, step) => {
    const outs = [];
    for (let t = from; t < to; t += step) {
      const t1 = Math.min(t + step, to);
      outs.push(...node.run(t1, events.filter(e => e.t >= t && (e.t < t1 || (t1 === to && e.t === to)))).outputs);
    }
    return outs;
  };
  const whole = terminal();
  runAll(whole, 0, 60 * BIT, 3 * BIT);
  assert.deepEqual(whole.engine.received.map(b => b.byte), bytes);
  assert.deepEqual(whole.messages(), [], 'no warnings');

  const a = terminal();
  runAll(a, 0, 18 * BIT, 3 * BIT);          // (into the second byte's frame: mid-byte)
  const s = a.save();
  assert.equal(s.t, 18 * BIT);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'its state plain data');
  const b = terminal();
  b.restore(s);
  assert.equal(b.now, 18 * BIT);
  assert.deepEqual(b.messages(), [], 'the replay\'s messages dropped');
  runAll(a, 18 * BIT, 60 * BIT, 3 * BIT);
  runAll(b, 18 * BIT, 60 * BIT, 7 * BIT);   // (in other windows)
  assert.deepEqual(a.engine.received, whole.engine.received);
  assert.deepEqual(b.engine.received, whole.engine.received);
  // (restored on itself, back in time: the run from there again the same)
  a.restore(s);
  runAll(a, 18 * BIT, 60 * BIT, 5 * BIT);
  assert.deepEqual(a.engine.received, whole.engine.received);
  assert.throws(() => b.restore({ t: 1 }), /^Error: not a node's saved state \(\{ t, events \}\)$/);
});

test('an engine behind the contract: its outputs, its value, its inputs\' errors', () => {
  const n = new ContractNode({ make: () => { const t = new TerminalNode({ baud: BAUD }); t.send([0xff]); return t; }, ports: termPorts });
  assert.equal(n.value('tx'), 1);
  assert.deepEqual(n.run(12 * BIT).outputs.map(o => [o.pin, o.t, o.value]), [['tx', 0, 0], ['tx', BIT, 1]]);
  assert.equal(n.value('tx'), 1);
  assert.deepEqual(n.fidelity, []);
  assert.equal(n.lookahead, null);
  assert.throws(() => n.run(20 * BIT, [{ pin: 'tx', t: 13 * BIT, value: 0 }]), /^Error: 'tx' is not an input of the node$/);
  assert.throws(() => n.run(5 * BIT), /not 5000000/);
  // (an engine with no value(): null)
  const bare = new ContractNode({ make: () => ({ now: 0, advanceTo(t) { this.now = t; return []; }, setPin() {}, messages: () => [] }), ports: termPorts });
  assert.equal(bare.value('tx'), null);
  assert.deepEqual(bare.run(10), { outputs: [], t: 10 });
});

test('an engine of its own run() behind the contract (as the PIC24\'s Pic24Node): run, saved and restored', () => {
  // (a counter: its output toggles every 1000 ps from its input's rising edge on; its run may end past t1)
  class Toggler {
    constructor() { this.now = 0; this.on = false; this.level = 0; this.next = Infinity; this.calls = 0; }
    value() { return this.level; }
    run(t1, events) {
      this.calls++;
      const out = [];
      const to = (t) => { while (this.next <= t) { this.level ^= 1; out.push({ pin: 'o', t: this.next, value: this.level }); this.next += 1000; } };
      for (const e of events) { to(e.t); if (e.value && !this.on) { this.on = true; this.next = e.t + 1000; } }
      to(t1);
      this.now = t1 + 1;   // (past t1)
      return { outputs: out, t: this.now };
    }
    messages() { return []; }
  }
  const ports = [port({ name: 'i', dir: 'in' }), port({ name: 'o', dir: 'out' })];
  const a = new ContractNode({ make: () => new Toggler(), ports, lookahead: 1000 });
  assert.deepEqual(a.run(2500, [{ pin: 'i', t: 500, value: 1 }]), { outputs: [{ pin: 'o', t: 1500, value: 1 }, { pin: 'o', t: 2500, value: 0 }], t: 2501 });
  assert.equal(a.now, 2501);
  const s = a.save();
  assert.equal(s.t, 2500, 'the last run\'s t1, its engine past it');
  const b = new ContractNode({ make: () => new Toggler(), ports });
  b.restore(s);
  assert.equal(b.now, 2501);
  assert.deepEqual(b.run(4000), a.run(4000));
  assert.throws(() => a.run(2600), /not 2600/);
});

test('a stimulus: its outputs\' events at their times, its inputs recorded; saved and restored', () => {
  const st = new StimulusNode({ ports: [port({ name: 'btn', dir: 'out' }), port({ name: 'led', dir: 'in' })],
    events: [{ pin: 'btn', t: 3000, value: 0 }, { pin: 'btn', t: 0, value: 1 }, { pin: 'btn', t: 3000, value: 1 }] });
  assert.deepEqual(contractProblems(st), []);
  assert.deepEqual(st.run(0).outputs, [{ pin: 'btn', t: 0, value: 1 }]);
  assert.equal(st.value('btn'), 1);
  const s = st.save();
  assert.deepEqual(st.run(5000, [{ pin: 'led', t: 4000, value: 1 }]), { outputs: [{ pin: 'btn', t: 3000, value: 0 }, { pin: 'btn', t: 3000, value: 1 }], t: 5000 });
  assert.deepEqual(st.received, [{ pin: 'led', t: 4000, value: 1 }]);
  assert.equal(st.value('led'), 1);
  st.restore(s);
  assert.deepEqual(st.received, []);
  assert.equal(st.value('btn'), 1);
  assert.equal(st.run(5000).outputs.length, 2);
  assert.deepEqual(st.messages(), []);
  assert.throws(() => new StimulusNode({ ports: [port({ name: 'led', dir: 'in' })], events: [{ pin: 'led', t: 0, value: 1 }] }), /^Error: 'led' is not an output of the stimulus$/);
  assert.throws(() => new StimulusNode({ ports: [port({ name: 'b', dir: 'out' })], events: [{ pin: 'b', t: -1, value: 1 }] }), /a time of 0 or more/);
  assert.throws(() => st.run(6000, [{ pin: 'btn', t: 5500, value: 0 }]), /'btn' is not an input of the node/);
});

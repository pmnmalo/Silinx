// The co-design system's co-simulation scheduler (#4696, core/system-sim.js) and its adapters of the compiled engine
// (core/system-sim-compiled.js) and of the event-driven simulator (core/system-sim-event.js), on the `uart`
// example's modules (test/system-sim-lib.mjs): the bytes of a UART link the same at every quantum, a link with a
// latency exact, the runs deterministic, a node's events at their own times, each adapter against its engine run
// alone, the remote host (one Web Worker) and the errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { SystemSim, parsePin, FINE, UART_DIV, WIDE } from '../core/system-sim.js';
import { CompiledNode } from '../core/system-sim-compiled.js';
import { EventNode } from '../core/system-sim-event.js';
import { REMOTE_KINDS, hostSystem } from '../core/system-sim-remote.js';
import { CompiledSim, compileNetlist, netlistOf, portBit } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { MESSAGE, bytesOf, uartDesign, uartModel, uartNode, uartSystem } from './system-sim-lib.mjs';

const BAUD = 1e6, BIT = 1e12 / BAUD;   // (the uart design at 1 Mbaud: 50 and 40 clock cycles a bit)
const A = { hz: 50e6, baud: BAUD }, B = { hz: 40e6, baud: BAUD };
const ok = (bytes) => bytes.map((byte) => ({ byte, error: false }));
const noMessages = (sys) => assert.deepEqual(sys.log, [], 'no warnings, no errors');

// ---------------------------------------------------------------- the scheduler alone, on scripted nodes

// a node whose outputs change as its script says ({ t, pin, value }), its inputs' values recorded with their times
class Scripted {
  constructor({ outputs = ['o'], inputs = ['i'], script = [], init = 1 } = {}) {
    this.outputs = outputs; this.inputs = inputs; this.script = [...script];
    this.vals = new Map([...outputs, ...inputs].map((p) => [p, init]));
    this.now = 0; this.got = []; this.ends = []; this.log = []; this.finished = null; this.queue = [];
  }
  value(p) { return this.vals.get(p); }
  setPin(p, v) { this.vals.set(p, v); this.got.push(this.now, p, v); }
  at(t, fn) { this.queue.push({ t, fn }); this.queue.sort((a, b) => a.t - b.t); }
  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }
  advanceTo(t) {
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.now = e.t; e.fn(this); }
    this.ends.push(t);
    const out = [];
    while (this.script.length && this.script[0].t <= t) { const c = this.script.shift(); this.vals.set(c.pin, c.value); out.push(c); }
    this.now = t;
    return out;
  }
  messages() { return this.log.splice(0); }
}

test('the scheduler: the levels at 0, a burst delivered at its times plus its lag, the lag set again after an idle time', () => {
  const sys = new SystemSim({ wide: 100e6 });
  const a = sys.addNode('a', new Scripted({ script: [{ t: 30e6, pin: 'o', value: 0 }, { t: 31e6, pin: 'o', value: 1 }, { t: 33e6, pin: 'o', value: 0 }, { t: 33e6, pin: 'o', value: 0 }, { t: 900e6, pin: 'o', value: 1 }] }));
  const b = sys.addNode('b', new Scripted({ init: 0 }));
  const c = sys.addNode('c', new Scripted({ init: 0 }));
  const l = sys.link({ from: 'a.o', to: ['b.i', 'c.i'], fine: 1e6, hold: 10e6 });
  assert.equal(l.name, 'a.o>b.i,c.i');
  sys.run(1e9);
  // fine windows for the hold from the start (the link active from 0, #5130: to 10 µs), then wide; the first change
  // seen at the end of the wide window 10–110 µs: the lag 80 µs, the burst's changes 1 and 2 µs apart as they were;
  // fine windows to the last delivery (113 µs), wide ones from there; the change at 900 µs, 867 µs after the last
  // (idle: more than hold), seen at 913 µs: its own lag, 13 µs
  assert.deepEqual(l.sent, [0, 1, 30e6, 0, 31e6, 1, 33e6, 0, 900e6, 1]);
  assert.deepEqual(l.trace, [0, 1, 110e6, 0, 111e6, 1, 113e6, 0, 913e6, 1]);
  assert.deepEqual(b.got, [0, 'i', 1, 110e6, 'i', 0, 111e6, 'i', 1, 113e6, 'i', 0, 913e6, 'i', 1]);
  assert.deepEqual(c.got, b.got, 'every other end of the link');
  assert.equal(a.got.length, 0);
  assert.equal(sys.stats.late, 0);
  assert.equal(sys.stats.changes, 4, 'a change to the same value is none');
  noMessages(sys);
});

test('the scheduler: the quantum fine while a link is active (its fine quantum, the smallest), wide while idle', () => {
  const sys = new SystemSim({ wide: 50e6 });
  const a = sys.addNode('a', new Scripted({ script: [{ t: 110e6, pin: 'o', value: 0 }] }));
  sys.addNode('b', new Scripted());
  sys.link({ from: 'a.o', to: 'b.i', kind: 'uart', baud: 1e6 });   // fine: 62.5 ns, hold: 20 bits
  assert.equal(sys.quantum(), 50e6, 'before the run: idle');
  sys.run(300e6);
  // fine windows for the hold from the start (the link active from 0, #5130: to 20 µs), then wide ones to 120 µs (the
  // change seen there, delivered at once: its lag 10 µs), then fine ones to the hold's end (110 + 20 µs), then wide again
  const ends = a.ends, q = BIT / UART_DIV, first = 20e6 / q;
  assert.deepEqual(ends.slice(0, first).filter((t, i) => t !== (i + 1) * q), []);
  assert.deepEqual(ends.slice(first, first + 2), [70e6, 120e6]);
  assert.equal(ends.filter((t, i) => i > first && t - ends[i - 1] === q).length, 10e6 / q);
  assert.deepEqual(ends.slice(first + 2 + 10e6 / q - 1), [130e6, 180e6, 230e6, 280e6, 300e6]);
  const adaptiveOff = new SystemSim({ wide: 50e6, adaptive: false });
  adaptiveOff.addNode('a', new Scripted());
  adaptiveOff.addNode('b', new Scripted());
  adaptiveOff.link({ from: 'a.o', to: 'b.i', fine: 2e6 });
  adaptiveOff.run(20e6);
  assert.equal(adaptiveOff.stats.windows, 10, 'not adaptive: the fine quantum always');
  assert.equal(new SystemSim().quantum(), WIDE, 'no link: the wide quantum');
  assert.equal(WIDE, 100e6);
  const wire = new SystemSim();
  wire.addNode('a', new Scripted()); wire.addNode('b', new Scripted());
  assert.equal(wire.link({ from: 'a.o', to: 'b.i' }).fine, FINE);
  assert.equal(wire.link({ from: 'b.o', to: 'a.i', latency: 3e6 }).latency, 3e6);
  assert.equal(wire.quantum(), 3e6, 'at most a link\'s latency');
});

test('the scheduler: a link with a latency delivers every change at t + latency; a late change is counted, never before the window\'s end', () => {
  const sys = new SystemSim({ wide: 10e6 });
  sys.addNode('a', new Scripted({ script: [{ t: 1234567, pin: 'o', value: 0 }, { t: 7654321, pin: 'o', value: 1 }] }));
  sys.addNode('b', new Scripted());
  const l = sys.link({ from: 'a.o', to: 'b.i', latency: 4e6 });
  sys.run(20e6);
  assert.deepEqual(l.trace, [0, 1, 5234567, 0, 11654321, 1]);
  assert.equal(sys.stats.late, 0);
  // a node reporting a change long after its time (an adapter's own delay): delivered at the window's end, counted
  const s2 = new SystemSim({ wide: 10e6 });
  const a2 = s2.addNode('a', new Scripted());
  s2.addNode('b', new Scripted());
  const l2 = s2.link({ from: 'a.o', to: 'b.i', latency: 1e6 });
  a2.advanceTo = function (t) { this.now = t; return t === 3e6 ? [{ pin: 'o', t: 1e6, value: 0 }] : []; };
  s2.run(5e6);
  assert.deepEqual(l2.trace, [0, 1, 3e6, 0]);
  assert.equal(s2.stats.late, 1);
});

test('the scheduler: its own events and a node\'s at their times (the windows cut there), a node that stops stops the system', () => {
  const sys = new SystemSim({ wide: 1e9 });
  const a = sys.addNode('a', new Scripted());
  sys.addNode('b', new Scripted());
  sys.link({ from: 'a.o', to: 'b.i' });
  const seen = [];
  sys.at(3333, (s) => seen.push(['sys', s.now]));
  a.at(7777, (n) => seen.push(['a', n.now]));
  sys.at(7777, (s) => seen.push(['sys', s.now]));
  sys.run(1e6);
  assert.deepEqual(seen, [['sys', 3333], ['a', 7777], ['sys', 7777]]);
  assert.deepEqual(a.ends, [3333, 7777, 1e6]);
  assert.throws(() => sys.at(5, () => {}), /a time from now on \(1000000 ps\), not 5/);
  // a node that stops (its engine's error): the system stops at that window's end, its message in the log
  const s2 = new SystemSim({ wide: 1e6 });
  const n = s2.addNode('n', new Scripted());
  const adv = n.advanceTo.bind(n);
  n.advanceTo = (t) => { if (t >= 3e6) { n.finished = 'error'; n.log.push({ kind: 'error', text: 'boom', time: t }); } return adv(t); };
  assert.deepEqual(s2.run(10e6), { now: 3e6, finished: { node: 'n', why: 'error' } });
  assert.deepEqual(s2.messages('error'), ['n: boom']);
  assert.deepEqual(s2.messages('warning'), []);
  assert.deepEqual(s2.run(20e6).now, 3e6, 'stopped');
});

test('the scheduler\'s errors: the nodes, the links, the times', () => {
  const sys = new SystemSim();
  sys.addNode('a', new Scripted());
  sys.addNode('b', new Scripted());
  assert.throws(() => sys.addNode('a', new Scripted()), /a node 'a' already/);
  assert.throws(() => sys.addNode('x.y', new Scripted()), /'x.y' is not a node's name/);
  assert.throws(() => sys.addNode('', new Scripted()), /is not a node's name/);
  assert.throws(() => sys.link({ from: 'z.o', to: 'b.i' }), /no node 'z'/);
  assert.throws(() => sys.link({ from: 'a.i', to: 'b.i' }), /'i' is not an output of the node 'a'/);
  assert.throws(() => sys.link({ from: 'a.o', to: 'b.o' }), /'o' is not an input of the node 'b'/);
  assert.throws(() => sys.link({ from: 'a', to: 'b.i' }), /'a' is not a node's pin/);
  assert.throws(() => sys.link({ from: 'a.o', to: [] }), /goes nowhere/);
  assert.throws(() => sys.link({ from: 'a.o', to: 'b.i', kind: 'spi' }), /no link of kind 'spi'/);
  assert.throws(() => sys.link({ from: 'a.o', to: 'b.i', kind: 'uart', baud: 0 }), /needs its baud rate/);
  assert.throws(() => sys.link({ from: 'a.o', to: 'b.i', latency: 0 }), /latency: 1 ps or more/);
  sys.link({ name: 'w', from: 'a.o', to: 'b.i' });
  assert.throws(() => sys.link({ from: 'a.o', to: 'a.i' }), /'a.o' already drives a link/);
  assert.throws(() => sys.link({ from: 'b.o', to: 'b.i' }), /'b.i' is driven by two links/);
  assert.throws(() => sys.link({ name: 'w', from: 'b.o', to: 'a.i' }), /a link 'w' already/);
  assert.throws(() => new SystemSim({ wide: 0 }), /quanta are times above 0/);
  assert.throws(() => new SystemSim({ fine: -1 }), /quanta are times above 0/);
  assert.throws(() => sys.run(NaN), /a time in ps/);
  assert.throws(() => sys.run('1'), /a time in ps/);
  sys.run(1e6);
  assert.throws(() => sys.addNode('c', new Scripted()), /before the run/);
  assert.throws(() => sys.link({ from: 'b.o', to: 'a.i' }), /before the run/);
  assert.deepEqual(sys.run(5e5), { now: 1e6, finished: null }, 'a time before now: nothing to run');
  assert.deepEqual(parsePin('led[3]'), { port: 'led', bit: 3 });
  assert.deepEqual(parsePin('tx'), { port: 'tx', bit: null });
});

// ---------------------------------------------------------------- the uart example's nodes

const runs = (sys, end) => { sys.run(end); return Object.fromEntries([...sys.links].map(([n, l]) => [n, { sent: l.sent, trace: l.trace }])); };

test('two FPGA nodes, each with its own clock, a UART both ways: the message and its echo the same bytes at every quantum', async () => {
  // a sends the message (its button) to b, b echoes it to c, three nodes: no reply back, so that the bytes are
  // independent of the links' lags; the adaptive quantum and a fixed one, from finer than the bit to wider than a frame
  const end = 10e6 + 24 * 10 * BIT;
  let ref = null;
  for (const [wide, fine, adaptive] of [[100e6, null, true], [1e9, null, true], [BIT / 4, null, true], [100e6, BIT / 64, true], [100e6, BIT / 2, true], [100e6, BIT / 8, false]]) {
    const a = await uartNode('compiled', A), b = await uartNode('compiled', B), c = await uartNode('compiled', A);
    const sys = uartSystem({ a, b, baud: BAUD, wide, fine, adaptive });
    sys.addNode('c', c);
    sys.link({ name: 'bc', from: 'b.tx', to: 'c.rx', kind: 'uart', baud: BAUD });
    const r = runs(sys, end);
    const what = `wide ${wide}, fine ${fine}${adaptive ? '' : ', not adaptive'}`;
    assert.deepEqual(bytesOf(r.ab.trace, BAUD, end), ok(MESSAGE), `${what}: the message at b`);
    assert.deepEqual(bytesOf(r.bc.sent, BAUD, end), ok(MESSAGE), `${what}: its echo, b to c`);
    assert.deepEqual(bytesOf(r.bc.trace, BAUD, end), ok(MESSAGE), `${what}: at c`);
    assert.equal(b.value('led'), 0x0A, 'b\'s LEDs: the last byte, LF');
    assert.equal(c.value('led'), 0x0A);
    assert.equal(sys.stats.late, 0, what);
    noMessages(sys);
    ref ??= r.ab.sent;
    assert.deepEqual(r.ab.sent, ref, `${what}: a's line the same, at its own times`);
  }
});

test('a UART both ways with a fixed latency: the same run at every quantum, the echo back and forth exchanged pin by pin', async () => {
  const end = 300e6;
  let ref = null;
  for (const [wide, fine] of [[100e6, null], [BIT / 16, null], [1e9, BIT / 64], [100e6, BIT / 2]]) {
    const a = await uartNode('compiled', A), b = await uartNode('compiled', B);
    const sys = uartSystem({ a, b, baud: BAUD, twoWay: true, latency: BIT / 2, wide, fine });
    const r = runs(sys, end);
    ref ??= r;
    assert.deepEqual(r, ref, `wide ${wide}, fine ${fine}: the same changes at the same times`);
    assert.equal(sys.stats.late, 0);
    noMessages(sys);
  }
  // b echoes a's message back; a echoes the echo: the first bytes back at a, the message's, in order
  assert.deepEqual(bytesOf(ref.ba.sent, BAUD, end).slice(0, 2), ok(MESSAGE.slice(0, 2)));
  assert.ok(bytesOf(ref.ab.sent, BAUD, end).length > 25, 'the line kept busy both ways');
  // every change reaches the other end after the latency, exactly (those delivered by the end)
  const shifted = (s) => s.map((v, i) => (i % 2 === 0 && i ? v + BIT / 2 : v)).filter((v, i, a) => (i % 2 === 0 ? v : a[i - 1]) <= end);
  assert.deepEqual(ref.ab.trace, shifted(ref.ab.sent));
  assert.deepEqual(ref.ba.trace, shifted(ref.ba.sent));
});

test('deterministic: the same system run twice (adaptive, both ways) gives the same changes, times and windows', async () => {
  const once = async () => {
    const a = await uartNode('compiled', A), b = await uartNode('compiled', B);
    const sys = uartSystem({ a, b, baud: BAUD, twoWay: true, wide: 30e6 });
    sys.run(150e6);
    sys.run(250e6);   // (in two runs)
    return { links: runs(sys, 250e6), stats: sys.stats, lag: [...sys.links.values()].map((l) => l.lag), led: [a.value('led'), b.value('led')] };
  };
  const r1 = await once(), r2 = await once();
  assert.deepEqual(r2, r1);
  assert.ok(r1.stats.changes > 100);
  assert.equal(r1.stats.late, 0);
});

test('a node\'s events at its own times: a button pressed between two windows is seen by the clock edge after it', async () => {
  // a's button at a time on no window's edge (wide: 1 ms): its press, and so a's line, the same as with fine windows
  const T = 10_000_123;
  const line = async (wide) => {
    const a = await uartNode('compiled', A), b = await uartNode('compiled', B);
    const sys = uartSystem({ a, b, baud: BAUD, press: null, wide });
    const at = [];
    a.at(T, (n) => { at.push(n.now, n.cs.cycles); n.setPin('btn', 1); });
    a.at(T + 2e6, (n) => n.setPin('btn', 0));
    sys.run(40e6);
    return { at, sent: sys.links.get('ab').sent };
  };
  const wide = await line(1e9), fine = await line(BIT / 16);
  assert.deepEqual(wide.at, [T, Math.floor(T / 20000)], 'run at T, after the clock edges up to T');
  assert.deepEqual(wide.sent, fine.sent);
  // the event-driven node's events at their times as well
  const e = await uartNode('event', A);
  const seen = [];
  e.at(1234567, (n) => seen.push(n.sim.now));
  assert.equal(e.nextEventTime(), 1234567);
  e.advanceTo(2e6);
  assert.deepEqual(seen, [1234567]);
  assert.equal(e.nextEventTime(), Infinity);
});

test('the compiled adapter against the compiled engine run alone: the same changes, at the same cycles', async () => {
  const { model, pins } = await uartModel(A, ['tx', 'led[0]', 'led[1]']);
  const node = new CompiledNode({ model, pins, period: 20000 });
  assert.deepEqual(node.inputs, ['rx', 'btn'], 'a vector\'s bits by their names when it has more than one');
  assert.deepEqual(node.outputs, ['tx', 'led[0]', 'led[1]']);
  node.setPin('rx', 1);
  node.at(5e6, (n) => n.setPin('btn[0]', 1));
  node.at(7e6, (n) => n.setPin('btn', 0));
  const changes = [];
  for (const t of [1e6, 3e6 + 7, 3e6 + 7, 9e6, 31e6, 31e6 + 19999, 31e6 + 20000, 60e6]) changes.push(...node.advanceTo(t));
  // the engine alone, a cycle at a time, its pins read after each rising edge
  const cs = new CompiledSim(model);
  cs.set('rx', 1);
  const ref = [], last = [1, 0, 0];
  for (let k = 1; k <= 3000; k++) {
    if (k === 5e6 / 20000 + 1) cs.set('btn', 1);
    if (k === 7e6 / 20000 + 1) cs.set('btn', 0);
    cs.cycle(1);
    const v = [Number(cs.get('tx')), Number(cs.get('led') & 1n), Number((cs.get('led') >> 1n) & 1n)];
    v.forEach((x, i) => { if (x !== last[i]) { ref.push({ pin: pins[i], t: k * 20000, value: x }); last[i] = x; } });
  }
  assert.deepEqual(changes, ref);
  assert.ok(ref.length > 20 && ref.every((c, i) => !i || c.t >= ref[i - 1].t));
  assert.equal(node.value('led'), Number(cs.get('led')));
  assert.equal(node.value('btn[0]'), 0);
  assert.deepEqual(node.messages(), []);
  assert.deepEqual(model.warnings, [], 'no warnings');
  // its errors
  assert.throws(() => node.setPin('tx', 1), /'tx' is not an input of the node/);
  assert.throws(() => node.setPin('btn[1]', 1), /'btn\[1\]' is not an input/);
  assert.throws(() => node.advanceTo(1e6), /the node is at 60000000 ps, not back at 1000000/);
  assert.throws(() => node.value('nothing'), /no pin 'nothing'/);
  assert.throws(() => new CompiledNode({ model, pins, period: 0 }), /clock period/);
  await assert.rejects(uartModel(A, ['rx']), /'rx' is an input, not an output/);
  await assert.rejects(uartModel(A, ['nope']), /no port 'nope'/);
});

// (the uart netlist, for models with other watches)
let nl = null;
async function netlistJson() {
  nl ??= await netlistOf(uartDesign(A), { run: yosysNode });
  return nl.json;
}

test('the compiled engine\'s watch.pins: the same changes as the serial port\'s watch.uart, in runs of any length', async () => {
  const json = await netlistJson(), tx = portBit(json, 'uart', 'tx'), led = portBit(json, 'uart', 'led', 1);
  const cs = new CompiledSim(compileNetlist(json, { top: 'uart', clock: 'clk', watch: { uart: { tx }, pins: [led, tx] } }));
  const p = cs.pins.take();
  assert.deepEqual(p, [0, 0, 0, 0, 1, 1], 'the levels at the start (the reset\'s run of no cycle)');
  cs.set('rx', 1);
  cs.set('btn', 1);
  for (const n of [1, 2, 0, 997, 30000, 5]) cs.cycle(n);
  const u = cs.uart.take();
  p.push(...cs.pins.take());
  const pairs = (i) => p.flatMap((x, k) => (k % 3 === 0 && p[k + 1] === i ? [x, p[k + 2]] : []));
  // (the pins sampled at each run's end too: the last edge's change, which watch.uart records at the next run's start)
  const fromPins = pairs(1);
  assert.ok(u.length > 20);
  assert.deepEqual(fromPins.slice(0, u.length), u, 'the TX\'s changes');
  assert.ok(fromPins.length - u.length <= 2);
  assert.deepEqual(pairs(0), [0, 0], 'led(1): 0 from the start, no byte received');
  for (let k = 3; k < p.length; k += 3) assert.ok(p[k] >= p[k - 3], 'in time order');
});

test('the event-driven adapter against the simulator run alone: the same waves; and the same line as the compiled engine', async () => {
  const P = 20000, end = 40e6;
  const node = await uartNode('event', A, ['tx', 'led[0]']);
  assert.deepEqual(node.inputs, ['rx', 'btn']);
  node.setPin('rx', 1);
  node.at(5e6, (n) => n.setPin('btn[0]', 1));
  node.at(7e6, (n) => n.setPin('btn', 0));
  const changes = [];
  for (const t of [1e6, 5e6, 5e6 + 3, 22e6, end]) changes.push(...node.advanceTo(t));
  // the simulator alone, its clock and its forces as the adapter's
  const design = uartDesign(A);
  const sim = new Simulator(design);
  for (const s of design.signals) {
    if (!Array.isArray(s.val) && s.val?.w && s.val.x === V.mask(s.val.w)) s.val = V.withSign(V.fromInt(0, s.val.w, false), s.val.s);
    if (s.wave) s.wave.v[0] = s.val;
  }
  const port = (n) => design.top.ports.find((p) => p.name === n).sig;
  sim.addClock(port('clk'), { period: P, offset: P / 2 });
  sim.force(port('rx'), V.ONE);
  sim.at(5e6, () => sim.force(port('btn'), V.fromInt(1, 1, false)));
  sim.at(7e6, () => sim.force(port('btn'), V.fromInt(0, 1, false)));
  sim.run(end);
  for (const s of design.signals.filter((x) => x.wave)) {
    const mine = node.design.signals.find((x) => x.path === s.path && x.name === s.name);
    assert.deepEqual(mine.wave, s.wave, `the wave of ${s.path || s.name}`);
  }
  // its changes are those of its waveform before `end`, the tx's at the rising edges (k periods)
  const w = port('tx').wave;
  const ref = w.t.map((t, i) => ({ pin: 'tx', t, value: Number(w.v[i].v) })).filter((c, i) => i && c.t < end && c.value !== Number(w.v[i - 1].v));
  assert.deepEqual(changes.filter((c) => c.pin === 'tx'), ref);
  assert.ok(ref.length > 20 && ref.every((c) => c.t % P === 0));
  assert.deepEqual(node.messages(), [], 'no warnings');
  // the compiled adapter on the same stimulus: the same changes at the same times
  const cn = await uartNode('compiled', A, ['tx', 'led[0]']);
  cn.setPin('rx', 1);
  cn.at(5e6, (n) => n.setPin('btn', 1));
  cn.at(7e6, (n) => n.setPin('btn', 0));
  const cc = [...cn.advanceTo(22e6), ...cn.advanceTo(end)];
  assert.deepEqual(cc, changes);
  // an unknown value: null, both ways
  node.setPin('rx', null);
  assert.equal(node.value('rx'), null);
  node.setPin('btn[0]', null);
  assert.equal(node.value('btn'), null);
  // its errors
  assert.throws(() => node.setPin('led', 1), /'led' is not an input of the node/);
  assert.throws(() => node.setPin('clk', 1), /'clk' is not an input of the node/);
  assert.throws(() => node.value('nothing'), /no pin 'nothing'/);
  assert.throws(() => node.advanceTo(1), /not back at 1/);
  assert.throws(() => new EventNode({ design: uartDesign(A), clocks: [{ port: 'tx', period: P }] }), /'tx' is not an input to clock/);
  assert.throws(() => new EventNode({ design: uartDesign(A), clocks: [{ port: 'clk', period: 0 }] }), /a period \(ps\) above 0/);
  assert.throws(() => new EventNode({ design: uartDesign(A), pins: ['rx'] }), /'rx' is not an output of the node/);
});

test('a system of a compiled node and an event-driven one: the same bytes and line as two compiled nodes', async () => {
  const end = 10e6 + 22 * 10 * BIT;
  const line = async (kind) => {
    const a = await uartNode('compiled', A), b = await uartNode(kind, B);
    const sys = uartSystem({ a, b, baud: BAUD, twoWay: true, latency: BIT / 4 });
    sys.run(end);
    noMessages(sys);
    return [...sys.links.values()].map((l) => l.sent);
  };
  const [ab, ba] = await line('event');
  assert.deepEqual([ab, ba], await line('compiled'));
  assert.deepEqual(bytesOf(ba, BAUD, end).slice(0, 2), ok(MESSAGE.slice(0, 2)), 'the first bytes back at a: the message\'s');
});

test('the whole system behind a message port (one Web Worker, no SharedArrayBuffer): the same bytes; its errors', async () => {
  const { port1, port2 } = new MessageChannel();
  hostSystem(port2);
  const reply = (m) => new Promise((res) => { port1.once('message', res); port1.postMessage(m); });
  const ma = await uartModel(A), mb = await uartModel(B);
  const nodes = [{ name: 'a', kind: 'compiled', ...ma, period: 20000 }, { name: 'b', kind: 'compiled', ...mb, period: 25000 }];
  assert.deepEqual(await reply({ type: 'run', id: 0, until: 1 }), { type: 'error', id: 0, message: 'no system: init first' });
  assert.deepEqual(Object.keys(REMOTE_KINDS), ['compiled'], 'the AVR\'s with #4698');
  assert.deepEqual(await reply({ type: 'init', nodes: [{ name: 'z', kind: 'avr' }] }), { type: 'error', id: undefined, message: 'no node of kind \'avr\'' });
  const ready = await reply({ type: 'init', nodes, links: [{ name: 'ab', from: 'a.tx', to: 'b.rx', kind: 'uart', baud: BAUD }, { name: 'ba', from: 'b.tx', to: 'a.rx', kind: 'uart', baud: BAUD }] });
  assert.deepEqual(ready, { type: 'ready', warnings: [] });
  port1.postMessage({ type: 'set', t: 10e6, node: 'a', pin: 'btn', value: 1 });
  port1.postMessage({ type: 'set', t: 12e6, node: 'a', pin: 'btn', value: 0 });
  const s1 = await reply({ type: 'run', id: 1, until: 100e6 });
  const s2 = await reply({ type: 'run', id: 2, until: 300e6 });
  assert.deepEqual([s1.id, s1.now, s1.finished, s2.now], [1, 100e6, null, 300e6]);
  assert.deepEqual(s1.log, []);
  // the changes in two states, together those of the same system run here
  const a = await uartNode('compiled', A), b = await uartNode('compiled', B);
  const local = uartSystem({ a, b, baud: BAUD, twoWay: true });
  const r = runs(local, 300e6);
  for (const n of ['ab', 'ba']) {
    assert.deepEqual([...s1.links[n].sent, ...s2.links[n].sent], r[n].sent, n);
    assert.deepEqual([...s1.links[n].trace, ...s2.links[n].trace], r[n].trace, n);
  }
  assert.deepEqual(s2.stats, local.stats);
  assert.deepEqual(await reply({ type: 'set', t: 5, node: 'q', pin: 'btn', value: 1 }), { type: 'error', id: undefined, message: 'no node \'q\'' });
  port1.close();
});

test('#5212 the scheduler\'s watch: an output no link reads, its changes kept at their times from its value at the start; one linked too; a wrong pin refused', () => {
  const sys = new SystemSim({ wide: 10e6 });
  sys.addNode('a', new Scripted({ outputs: ['o', 'led'], script: [{ t: 3e6, pin: 'led', value: 0 }, { t: 5e6, pin: 'o', value: 0 }, { t: 7e6, pin: 'led', value: 1 }, { t: 7e6, pin: 'led', value: 1 }] }));
  sys.addNode('b', new Scripted());
  sys.link({ from: 'a.o', to: 'b.i', latency: 1e6 });
  sys.watch('a', ['led', 'o']);
  sys.run(20e6);
  assert.deepEqual(sys.watched.get('a.led'), [0, 1, 3e6, 0, 7e6, 1], 'a change to the same value is none');
  assert.deepEqual(sys.watched.get('a.o'), [0, 1, 5e6, 0]);
  assert.deepEqual(sys.links.get('a.o>b.i').trace, [0, 1, 6e6, 0], 'the link as before');
  assert.throws(() => sys.watch('a', ['i']), /^Error: 'i' is not an output of the node 'a'$/);
  assert.throws(() => sys.watch('z', ['o']), /^Error: no node 'z'$/);
  noMessages(sys);
});

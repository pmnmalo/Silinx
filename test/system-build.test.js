// A System simulated (#4701, core/system-build.js, core/system-sim-terminal.js): an FPGA node's clock from its board;
// the plan of a System (its FPGA nodes' modules, clocks and pins; a UART link's two wires, a GPIO link's wires; a UART's
// RX idle; what cannot be simulated); the scheduler's system built from it and run: the uart example's FPGA and an AVR
// echoing by UART ('HiIjJk', the decoded traffic of each wire, no warnings), a terminal typing to the FPGA and reading
// its echo; a terminal's frames (7E2) against the decoder, a wrong baud's framing errors as its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fpgaClock, systemPlan, buildSystem, wireFrames } from '../core/system-build.js';
import { TerminalNode } from '../core/system-sim-terminal.js';
import { linkTraffic, decodeUart } from '../core/system-decode.js';
import { normalizeSystem } from '../core/system-doc.js';
import { intelHex, echoProgram, avrAssemble } from './avr-asm.mjs';
import { uartModel, uartNetlist } from './system-sim-lib.mjs';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { loadAvr8js } from '../core/system-sim-avr.js';

await loadAvr8js();   // (avr8js, before an AvrNode is made: core/system-sim-avr.js, #4701)

const PORTS = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 }, { name: 'btn', dir: 'in', width: 1 }, { name: 'led', dir: 'out', width: 8 }] };
const fpgaNode = (over = {}) => ({ id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' },
  interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], ...over });
const system = (nodes, links) => normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes, links });
const uno = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/echo.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
const term = { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
const text = bytes => bytes.map(b => String.fromCharCode(b.byte)).join('');

test('#4701 an FPGA node\'s clock: the input on a clock pin of its board, else clk at its board\'s clock; none without one', () => {
  assert.deepEqual(fpgaClock(fpgaNode(), PORTS.uart), { port: 'clk', period: 20000, hz: 50e6 });
  assert.deepEqual(fpgaClock(fpgaNode({ pins: { mclk_in: 'B8' } }), [{ name: 'mclk_in', dir: 'in' }, ...PORTS.uart]), { port: 'mclk_in', period: 20000, hz: 50e6 });
  assert.deepEqual(fpgaClock(fpgaNode({ board: 'nexys3' }), PORTS.uart).period, 10000);
  assert.equal(fpgaClock(fpgaNode(), [{ name: 'a', dir: 'in' }]), null);
  assert.equal(fpgaClock(fpgaNode(), [{ name: 'clk', dir: 'in', width: 2 }]), null);
});

test('#4701 the plan: the FPGA node\'s module, clock and pins; a UART link\'s two wires; the RX no link drives idle; GPIO wires', () => {
  const p = systemPlan(system([fpgaNode(), uno, term], [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]), { ports: PORTS });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.fpga, [{ id: 'fpga', module: 'uart', clock: { port: 'clk', period: 20000, hz: 50e6 }, pins: ['tx'] }]);
  assert.deepEqual(p.wires, [
    { name: 'serial_uno', link: 'serial', kind: 'uart', from: 'uno.D1', to: 'fpga.rx', baud: 9600, frame: '8N1' },
    { name: 'serial_fpga', link: 'serial', kind: 'uart', from: 'fpga.tx', to: 'uno.D0', baud: 9600, frame: '8N1' }]);
  assert.deepEqual(p.idle, [{ node: 'term', pin: 'rx', value: 1 }]);
  assert.deepEqual(wireFrames(p.wires), { serial_uno: '8N1', serial_fpga: '8N1' });
  const g = systemPlan(system([fpgaNode({ interfaces: [{ name: 'leds', kind: 'gpio', pins: ['led<0>', 'led<1>'], dir: 'out' }] }),
    { ...uno, interfaces: [...uno.interfaces, { name: 'ins', kind: 'gpio', pins: ['D2', 'D3'], dir: 'in' }] }],
  [{ id: 'w', kind: 'gpio', a: 'uno.ins', b: 'fpga.leds' }]), { ports: PORTS });
  // (a bus's bits as the scheduler names them, led[0], #5213: led<0> was not a pin of the node)
  assert.deepEqual(g.wires.map(w => [w.name, w.from, w.to, w.kind]), [['w_0', 'fpga.led[0]', 'uno.D2', 'wire'], ['w_1', 'fpga.led[1]', 'uno.D3', 'wire']]);
  assert.deepEqual(g.idle, [{ node: 'uno', pin: 'D0', value: 1 }]);
});

test('#4701 what cannot be simulated: a node with no module, no clock, no firmware', () => {
  const p = systemPlan(system([fpgaNode({ module: null }), fpgaNode({ id: 'f2', module: 'noclk' }), { ...uno, firmware: null }], []), { ports: { noclk: [{ name: 'a', dir: 'in' }] } });
  assert.deepEqual(p.errors, ['fpga: no module', 'f2: the module noclk has no clock input (clk)', 'uno: no firmware: a .hex or an .elf of the project']);
  assert.throws(() => buildSystem(system([], []), p), /^Error: fpga: no module$/);
});

test('#4701 an AVR and the uart example\'s FPGA, built from a System: each byte echoed and answered plus one, no warnings', async () => {
  const sys = system([fpgaNode(), uno], [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }]);
  const plan = systemPlan(sys, { ports: PORTS });
  const fpga = { fpga: await uartModel({ hz: 50e6, baud: 9600 }, plan.fpga[0].pins) };
  const { sim, wires } = buildSystem(sys, plan, { fpga, firmware: { uno: { name: 'fw/echo.hex', data: intelHex(echoProgram()) } } });
  sim.run(8e9);
  const traffic = linkTraffic(sim, { frames: wireFrames(wires) });
  assert.deepEqual(traffic.map(t => t.link), ['serial_uno', 'serial_fpga']);
  assert.equal(text(traffic[0].bytes).slice(0, 6), 'HiIjJk');
  assert.equal(text(traffic[1].bytes).slice(0, 5), 'HiIjJ');
  assert.deepEqual([traffic.flatMap(t => t.warnings), sim.messages('warning'), sim.messages('error')], [[], [], []]);
});

test('#4701 a terminal typing to the FPGA: its echo read back', async () => {
  const sys = system([fpgaNode(), term], [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }]);
  const plan = systemPlan(sys, { ports: PORTS });
  const { sim, terminals } = buildSystem(sys, plan, { fpga: { fpga: await uartModel({ hz: 50e6, baud: 9600 }, plan.fpga[0].pins) } });
  sim.run(1e9);
  terminals.get('term').send([...'OK\n'].map(c => c.charCodeAt(0)));
  sim.run(6e9);
  assert.equal(text(terminals.get('term').received), 'OK\n');
  assert.deepEqual(sim.messages('warning'), []);
});

test('#4701 a terminal\'s frames: 7E2 sent as the decoder reads them; a wrong baud\'s framing errors its warnings', () => {
  const t = new TerminalNode({ baud: 19200, frame: '7E2' });
  t.send([0x41, 0x7f]);
  const ch = [0, 1];
  for (const c of t.advanceTo(2e9)) ch.push(c.t, c.value);
  assert.deepEqual(decodeUart(ch, { baud: 19200, frame: '7E2', end: 2e9 }).map(b => [b.byte, b.error]), [[0x41, null], [0x7f, null]]);
  // a terminal at 9600 reading 19200's frames
  const r = new TerminalNode({ baud: 9600 });
  r.setPin('rx', 1);
  for (let i = 2; i < ch.length; i += 2) { r.advanceTo(ch[i]); r.setPin('rx', ch[i + 1]); }
  r.advanceTo(3e9);
  assert.ok(r.received.length > 0);
  assert.ok(r.messages().every(m => m.kind === 'warning' && /^RX: a (framing|parity) error at 9600 baud$/.test(m.text)));
  assert.throws(() => r.setPin('tx', 1), /'tx' is not an input of the terminal/);
  assert.throws(() => new TerminalNode({ baud: 0 }), /a terminal's baud above 0/);
});

test('#5213 GPIO links simulated: the Uno\'s D2 presses the FPGA\'s BTN0 (its message to the terminal), the FPGA\'s LD0 (a bus\'s bit, led<0>) read on the Uno\'s D8', async () => {
  const sys = system([
    fpgaNode({ pins: { clk: 'B8', rx: 'J3', tx: 'A3', 'btn<0>': 'G12', 'led<0>': 'M5' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' },
      { name: 'press', kind: 'gpio', pins: ['btn'], dir: 'in' }, { name: 'ld0', kind: 'gpio', pins: ['led<0>'], dir: 'out' }] }),
    term,
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/p.hex', interfaces: [{ name: 'out', kind: 'gpio', pins: ['D2'], dir: 'out' }, { name: 'in', kind: 'gpio', pins: ['D8'], dir: 'in' }] },
  ], [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }, { id: 'p', kind: 'gpio', a: 'uno.out', b: 'fpga.press' }, { id: 'l', kind: 'gpio', a: 'fpga.ld0', b: 'uno.in' }]);
  const plan = systemPlan(sys, { ports: PORTS });
  // (the bus's bit as the scheduler names it: led[0])
  assert.deepEqual(plan.wires.filter((w) => w.kind === 'wire'), [{ name: 'p_uno', link: 'p', kind: 'wire', from: 'uno.D2', to: 'fpga.btn' }, { name: 'l_fpga', link: 'l', kind: 'wire', from: 'fpga.led[0]', to: 'uno.D8' }]);
  assert.deepEqual([plan.errors, plan.fpga[0].pins], [[], ['tx', 'led[0]']]);
  // the Uno: D2 an output, high (its button held: the FPGA's debouncer sees a press)
  const prog = ['ldi r16, 0x04', 'out 0x0a, r16', 'out 0x0b, r16', 'loop:', 'rjmp loop'];
  const r = systemFromInputs(sys, { plan, netlists: { fpga: await uartNetlist() }, firmware: { uno: { name: 'fw/p.hex', data: intelHex(avrAssemble(prog)) } } });
  assert.equal(r.error, undefined);
  r.terminals.get('term').send([0x41]);
  r.sim.run(60e9);
  const rep = systemReport(r);
  // (the FPGA's echo of A after the frame it was sending, H: the uart design's pending byte)
  assert.equal(rep.terminals.term, 'HAello from Silinx!\r\n');
  assert.equal(r.sim.nodes.get('uno').value('D8'), 1, 'LD0: A\'s bit 0');
  // (each wire's changes, its level at 0 among them: D2 floating, low, then high; LD0 low, then high)
  assert.deepEqual(rep.traffic.filter((t) => t.kind === 'wire').map((t) => [t.wire, t.from, t.to, t.changes]), [['p_uno', 'uno.D2', 'fpga.btn', 3], ['l_fpga', 'fpga.led[0]', 'uno.D8', 2]]);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

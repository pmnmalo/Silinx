// A System's I²C links (#5214): an Arduino Uno, the master (its TWI, Wire's SCL A5 and SDA A4), and an FPGA peripheral
// (examples/i2c-avr/src/i2c_leds.vhd, the i2c-avr example's: at the address 0x42, each byte written shown on its LEDs,
// a read answered with its switches), its SDA an inout port (the compiled engine's pads, #4709). The System document's
// I²C interface and its check (the master and the peripheral, one rate, SDA an inout port, its 5 V warnings); the plan's
// three wires (SCL, and SDA each way, each end pulling it low or releasing it, pulled up), each at a sixteenth of SCL's
// period; the run: the example's firmware writing its counts, reading the switches back (0x5A) at 100 kHz, the LEDs the
// last count, the Uno's D2..D7 the switches; the decoder against known waveforms (a write, a read, a repeated START, an
// address no one acknowledged, a byte cut short, the bus's level of two ends) and its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSystem } from '../core/system-doc.js';
import { checkSystem } from '../core/system-check.js';
import { systemPlan } from '../core/system-build.js';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { decodeI2c, i2cWarnings, wiredAnd } from '../core/system-decode.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { designOf } from './compiled-diff.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { avrAssemble, intelHex } from './avr-asm.mjs';
import { ROOT } from './examples-lib.mjs';

await loadAvr8js();
const EX = path.join(ROOT, 'examples/i2c-avr');
const SRC = fs.readFileSync(path.join(EX, 'src/i2c_leds.vhd'), 'utf8');
const FW = intelHex(avrAssemble(fs.readFileSync(path.join(EX, 'firmware/i2c.asm'), 'utf8').split('\n')));
const PORTS = { i2c_leds: [['clk', 'in', 1], ['scl', 'in', 1], ['sda', 'inout', 1], ['sw', 'in', 8], ['led', 'out', 8]].map(([name, dir, width]) => ({ name, dir, width })) };
const system = (over = {}) => normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'i2c_leds', board: 'basys2', variant: '250', pins: { clk: 'B8', scl: 'B2', sda: 'A3' }, interfaces: [{ name: 'bus', kind: 'i2c', scl: 'scl', sda: 'sda', ...over.fpga }] },
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/i2c.hex', interfaces: [{ name: 'Wire', kind: 'i2c', ...over.uno }] },
], links: [{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.bus' }] });
const W5 = (pin, port, loc) => `warning: i2c: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;
let netlist;
const fpgaNetlist = async () => (netlist ??= await netlistOf(designOf([{ path: 'src/i2c_leds.vhd', lang: 'vhdl', role: 'design', text: SRC }], 'i2c_leds'), { run: yosysNode }));

test('#5214 an I²C link checked: the master a microcontroller, the peripheral an FPGA; one rate; SDA an inout port; its 5 V warnings', () => {
  const run = (s, modules = PORTS) => checkSystem(s, { modules, files: ['fw/i2c.hex'] }).map((d) => `${d.severity}: ${d.message}`);
  const errors = (s, m) => run(s, m).filter((d) => d.startsWith('error'));
  assert.deepEqual(run(system()), [W5('A5', 'scl', 'B2'), W5('A4', 'sda', 'A3')]);
  assert.deepEqual(errors(system({ uno: { hz: 400000 } })), ['error: i2c: uno.Wire\'s SCL at 400000 Hz, fpga.bus\'s at 100000: an I²C bus\'s ends at one rate']);
  assert.deepEqual(errors(system({ uno: { hz: -1 } })), ['error: uno.Wire: its SCL rate \'-1\' is not a rate (Hz)']);
  assert.deepEqual(errors(system({ fpga: { sda: undefined } })), ['error: fpga.bus: an I²C bus with no sda port']);
  const asInput = { i2c_leds: PORTS.i2c_leds.map((p) => (p.name === 'sda' ? { ...p, dir: 'in' } : p)) };
  assert.deepEqual(errors(system(), asInput), ['error: fpga.bus: sda is an input of i2c_leds: an I²C bus\'s SDA is an inout port (pulled low or released, and read)']);
  assert.deepEqual(errors(system({ fpga: { scl: 'led' } })), ['error: fpga.bus: led is an output of i2c_leds, the interface an input']);
  const s = system();
  s.nodes[1].interfaces[0].name = 'Wire1';
  s.links[0].a = 'uno.Wire1';
  assert.deepEqual(errors(s), ['error: uno: the Arduino Uno has no I²C bus Wire1 (its I²C: Wire)']);
  const g = system();
  g.nodes[0].interfaces.push({ name: 'leds', kind: 'gpio', pins: ['led<0>'], dir: 'out' });
  g.nodes[0].pins['led<0>'] = 'M5';
  g.links[0].b = 'fpga.leds';
  assert.deepEqual(errors(g), ['error: i2c: an I²C link, fpga.leds is a GPIO interface']);
});

test('#5214 an I²C link run: the example\'s counts written at 100 kHz, the switches (0x5A) read back; three wires, the LEDs the last count, no warnings', async () => {
  const sys = system();
  const plan = systemPlan(sys, { ports: PORTS });
  assert.deepEqual(plan.wires.map((w) => [w.name, w.from, w.to, w.line, w.hz]), [
    ['i2c_scl', 'uno.A5', 'fpga.scl', 'scl', 100000], ['i2c_sda', 'uno.A4', 'fpga.sda', 'sda', 100000], ['i2c_sda_back', 'fpga.sda', 'uno.A4', 'sda_back', 100000]]);
  assert.deepEqual(plan.fpga[0].pins, ['sda'], 'the FPGA\'s SDA: what it drives');
  const r = systemFromInputs(sys, { plan, netlists: { fpga: await fpgaNetlist() }, firmware: { uno: { name: 'fw/i2c.hex', data: FW } } });
  assert.equal(r.error, undefined);
  assert.deepEqual([...r.sim.links.values()].map((l) => [l.latency, l.pull]), [[625000, 1], [625000, 1], [625000, 1]], 'a sixteenth of SCL\'s 10 µs; pulled up');
  const fpga = r.sim.nodes.get('fpga');
  assert.equal(fpga.value('sda'), null, 'released');
  fpga.setPin('sw', 0x5a);
  r.sim.run(120e6 * 1000);
  const rep = systemReport(r);
  const said = rep.i2c.map((s) => [s.link, s.from, s.to, s.hz, s.transfers.map((x) => [x.read ? 'R' : 'W', x.addr, x.ack, x.data.map((d) => [d.byte, d.ack])])]);
  assert.deepEqual(said, [['i2c', 'uno', 'fpga', 100000, [['W', 0x42, true, [[0, true]]], ['R', 0x42, true, [[0x5a, false]]],
    ['W', 0x42, true, [[1, true]]], ['R', 0x42, true, [[0x5a, false]]], ['W', 0x42, true, [[2, true]]], ['R', 0x42, true, [[0x5a, false]]]]]]);
  assert.ok(rep.lines.includes('i2c (I²C uno → fpga, 100000 Hz): 6 transfer(s): W 42: 00; R 42: 5A NACK; W 42: 01; R 42: 5A NACK; W 42: 02; R 42: 5A NACK'), rep.lines.join('\n'));
  assert.equal(fpga.value('led'), 2);
  assert.equal(r.sim.nodes.get('uno').cpu.data[0x2b] & 0xfc, 0x58, 'PORTD: the switches on D2..D7');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

// a transfer's waveform: a START, bytes (each with its ninth bit, its ACK when 0; `bits`: the first bits only, no ninth), a
// repeated START ('S'), a STOP; SDA set in the middle of SCL low, h a half period (ps)
function wave(items, h = 5e6) {
  const scl = [0, 1], sda = [0, 1];
  let t = 1e6;
  const start = () => { sda.push(t, 0); scl.push(t + h, 0); t += h; };
  const bit = (v) => { sda.push(t + h / 2, v); scl.push(t + h, 1, t + 2 * h, 0); t += 2 * h; };
  start();
  for (const x of items) {
    if (x === 'S') { sda.push(t + h / 2, 1); scl.push(t + h, 1); t += 1.5 * h; start(); continue; }
    const n = x.bits ?? 8;
    for (let i = 7; i > 7 - n; i--) bit((x.v >> i) & 1);
    if (n === 8) bit(x.ack ? 0 : 1);
  }
  sda.push(t + h / 2, 0); scl.push(t + h, 1); sda.push(t + 1.5 * h, 1);
  return { scl, sda };
}

test('#5214 the I²C decoder: a write and a read, a repeated START, an address no one acknowledged, a byte cut short; SCL\'s rate; the bus\'s level of two ends', () => {
  const t = (w) => decodeI2c(w).transfers.map((x) => [x.read ? 'R' : 'W', x.addr, x.ack, x.data.map((d) => [d.byte, d.ack])]);
  assert.deepEqual(t(wave([{ v: 0x84, ack: true }, { v: 0x3c, ack: true }, { v: 0xa5, ack: true }])), [['W', 0x42, true, [[0x3c, true], [0xa5, true]]]]);
  assert.deepEqual(t(wave([{ v: 0x84, ack: true }, { v: 0x07, ack: true }, 'S', { v: 0x85, ack: true }, { v: 0x5a, ack: false }])), [['W', 0x42, true, [[7, true]]], ['R', 0x42, true, [[0x5a, false]]]]);
  const nack = decodeI2c(wave([{ v: 0x86, ack: false }]));
  assert.deepEqual(t(wave([{ v: 0x86, ack: false }])), [['W', 0x43, false, []]]);
  assert.equal(nack.hz, 100000);
  assert.deepEqual(i2cWarnings('i2c', { ...nack, declared: 100000 }), ['i2c: no peripheral acknowledged the address 0x43 (1 time(s))']);
  assert.deepEqual(i2cWarnings('i2c', { hz: 400000, declared: 100000, transfers: [] }), ['i2c: SCL at 400000 Hz, faster than its interface\'s 100000 Hz: its peripheral\'s answers may be read late (the interface\'s SCL rate at least the program\'s)']);
  assert.deepEqual(i2cWarnings('i2c', { hz: 100000, declared: 100000, transfers: [] }), []);
  assert.deepEqual(t(wave([{ v: 0x84, ack: true }, { v: 0xff, bits: 5 }])), [['W', 0x42, true, []]], 'a STOP after 5 bits of a byte: the byte dropped');
  assert.deepEqual(wiredAnd([0, 1, 10, 0, 20, null], [0, null, 15, 0, 30, 1]), [0, 1, 10, 0, 30, 1], 'low while either end pulls it low');
});

test('#5214 an I²C interface added and changed as the editor and edit_system do: the Uno\'s its board\'s Wire, the FPGA\'s its ports; described; a link named i2c', async () => {
  const { addInterface, changeInterface, describeSystem, addLink } = await import('../core/system-edit.js');
  const s0 = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [
    { id: 'fpga', kind: 'fpga', module: 'i2c_leds', board: 'basys2', variant: '250', pins: { scl: 'B2', sda: 'A3' }, interfaces: [{ name: 'u', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }] },
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] }], links: [] });
  let r = addInterface(s0, 'uno', { kind: 'i2c' });
  assert.deepEqual([r.id, r.system.nodes[1].interfaces], ['uno.Wire', [{ name: 'Wire', kind: 'i2c', hz: 100000 }]]);
  assert.deepEqual(addInterface(s0, 'uno', { kind: 'i2c', name: 'Wire1' }), { error: 'uno: a microcontroller\'s I²C bus is its board\'s (Wire)' });
  r = addInterface(r.system, 'fpga', { kind: 'i2c', name: 'bus', scl: 'scl', sda: 'sda' });
  assert.deepEqual(r.system.nodes[0].interfaces[1], { name: 'bus', kind: 'i2c', scl: 'scl', sda: 'sda', hz: 100000 });
  assert.deepEqual(changeInterface(r.system, 'fpga', 'bus', { hz: 'fast' }), { error: 'fpga.bus: an I²C bus\'s SCL rate is a number of Hz, not \'fast\'' });
  assert.deepEqual(changeInterface(r.system, 'uno', 'Wire', { sda: 'D2' }), { error: 'uno.Wire: this interface has no field \'sda\' to change (hz)' });
  const s = changeInterface(r.system, 'uno', 'Wire', { hz: 400000 }).system;
  assert.deepEqual(describeSystem(s).filter((l) => /I²C/.test(l)), ['  bus: I²C 100000 Hz, SCL scl (B2), SDA sda (A3)', '  Wire: I²C 400000 Hz, SCL A5, SDA A4']);
  assert.deepEqual(addLink(s, { a: 'uno.Wire', b: 'fpga.bus' }).system.links, [{ id: 'i2c', kind: 'i2c', a: 'uno.Wire', b: 'fpga.bus' }]);
  assert.deepEqual(addLink(s, { a: 'uno.Wire', b: 'fpga.u' }), { error: 'uno.Wire is an I²C bus, fpga.u is a UART: a link joins two interfaces of one kind' });
});

test('#5214 an FPGA node\'s pad as a link\'s pin: what the design drives on it (null where its enable is 0), its value and enable changed in one cycle one change', async () => {
  const { compiledNodeModel, CompiledNode } = await import('../core/system-sim-compiled.js');
  const V = 'module p(input clk, input d, input e, inout io, output reg q); assign io = e ? d : 1\'bz; always @(posedge clk) q <= io; endmodule\n';
  const n = await netlistOf(designOf([{ path: 'p.v', lang: 'verilog', role: 'design', text: V }], 'p'), { run: yosysNode });
  const m = compiledNodeModel(n.json, { top: n.top, clock: 'clk', pins: ['io', 'q'] });
  assert.deepEqual(m.index, [[0, 1], [2]], 'io: its value and its enable');
  const node = new CompiledNode({ ...m, period: 20000 });
  assert.deepEqual([node.inputs, node.value('io')], [['d', 'e', 'io'], null]);
  node.setPin('io', 1);
  assert.deepEqual(node.advanceTo(100000).map((c) => [c.pin, c.value]), [['q', 1]], 'the outside\'s 1 read back');
  node.setPin('e', 1);   // (driven, its value 0: d)
  assert.deepEqual(node.advanceTo(200000).map((c) => [c.pin, c.value]), [['io', 0], ['q', 0]]);
  node.setPin('d', 1);
  assert.deepEqual(node.advanceTo(300000).map((c) => [c.pin, c.value]), [['io', 1], ['q', 1]]);
  node.setPin('e', 0);   // (its value 0 and its enable 0 in one cycle: one change, to null, not through 0)
  assert.deepEqual(node.advanceTo(400000).map((c) => [c.pin, c.value]), [['io', null]]);
});

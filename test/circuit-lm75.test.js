// The temperature sensor LM75 on I²C (#5342, core/circuit-lm75.js, core/circuit-i2c.js's reads): its registers against
// the datasheet (the temperature's 9 bits, two's complement; the pointer; THYST and TOS; the configuration's shutdown,
// OS's polarity, its fault queue; OS in comparator and in interrupt mode); in a circuit (its address 0x48 + A2..A0, a
// master made of a 7405 and two switches, open drain, pulled up): a write's pointer, a read's bytes sent bit by bit, the
// master's ACK and NACK, another address not acknowledged; its temperature set while running, its OS pulling low; its
// checks; its HDL compiled with no warnings, its bytes the live one's in VHDL and in Verilog; an Arduino reading it
// through a System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLm75, lm75Raw, LM75 } from '../core/circuit-lm75.js';
import { createI2cPeripheral } from '../core/circuit-i2c.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, partPins } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { setPartProps } from '../core/circuit-edit.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const reg = (s, ptr) => { s.start(false); s.write(ptr); s.start(true); return [s.read(), s.read()]; };

test('#5342 the registers: the temperature\'s 9 bits (two\'s complement, left-justified), the pointer kept, THYST and TOS, the configuration', () => {
  assert.deepEqual([25, 0.5, -0.5, -25, 125, 200, -100, 24.74].map((t) => lm75Raw(t).toString(16)), ['1900', '80', 'ff80', 'e700', '7d00', '7d00', 'c900', '1880']);
  const s = createLm75({ temp: 25 });
  assert.deepEqual(reg(s, 0), [0x19, 0x00]);
  s.start(true);   // (a read from the pointer kept: the temperature again, from its MSB)
  assert.deepEqual([s.read(), s.read(), s.read()], [0x19, 0x00, 0x19]);
  assert.deepEqual([reg(s, 2), reg(s, 3)], [[75, 0], [80, 0]], 'THYST 75 °C, TOS 80 °C at power-on');
  s.start(false); s.write(1); s.start(true);
  assert.deepEqual([s.read(), s.read()], [0, 0], 'the configuration: one byte, again');
  // TOS written (27.5 °C: 0x1B 0x80, its low byte's bit 7 only kept)
  s.start(false); for (const b of [3, 0x1b, 0xff]) s.write(b);
  assert.deepEqual(reg(s, 3), [0x1b, 0x80]);
  s.setTemp(-10.3);
  assert.deepEqual([reg(s, 0), s.state().temp], [[0xf5, 0x80], -10.5]);
});

test('#5342 OS: comparator mode (over TOS active, under THYST inactive, its fault queue), polarity, interrupt mode (until a read), shutdown', () => {
  const s = createLm75({ temp: 25 });
  const write = (ptr, ...bytes) => { s.start(false); s.write(ptr); for (const b of bytes) s.write(b); };
  write(3, 30, 0); write(2, 28, 0);   // (TOS 30 °C, THYST 28 °C)
  const os = [];
  for (const t of [29, 31, 29, 27, 26]) { s.setTemp(t); os.push(s.state().os); }
  assert.deepEqual(os, [false, true, true, false, false], 'over TOS, kept until under THYST');
  assert.deepEqual([s.osLow(), (write(1, 4), s.osLow())], [false, true], 'active low; active high (bit 2): inactive pulls low');
  // the fault queue: 2 conversions over TOS before OS goes active (bits 4..3 01)
  write(1, 0x08);
  s.setTemp(31); const one = s.state().os; s.setTemp(32);
  assert.deepEqual([one, s.state().os], [false, true]);
  // interrupt mode: active over TOS until a read; then active under THYST until a read
  const i = createLm75({ temp: 25 });
  const w = (ptr, ...bytes) => { i.start(false); i.write(ptr); for (const b of bytes) i.write(b); };
  w(3, 30, 0); w(2, 28, 0); w(1, 0x02);
  const seen = [];
  for (const step of [() => i.setTemp(31), () => i.start(true), () => i.setTemp(32), () => i.setTemp(27), () => i.start(true), () => i.setTemp(26)]) { step(); seen.push(i.state().os); }
  assert.deepEqual(seen, [true, false, false, true, false, false]);
  // shutdown: its last conversion kept
  w(1, 0x01); i.setTemp(50);
  assert.deepEqual([i.state().raw.toString(16), i.state().temp], ['1a00', 50], 'its last conversion, 26 °C');
  // (at power-on over TOS: active at its first conversion)
  assert.equal(createLm75({ temp: 90 }).state().os, true);
});

test('#5342 the I²C peripheral reads: its bytes MSB first as SCL falls, the master\'s ACK the next byte, its NACK the end', () => {
  const bytes = [0xa5, 0x3c];
  let k = 0;
  const bus = createI2cPeripheral(0x48, { onRead: () => bytes[k++ % 2] });
  let scl = '1', sda = '1';
  const set = (c, d) => { scl = c; sda = d; return bus.feed(c, d); };
  set('1', '1'); set('1', '0'); set('0', '0');   // (START)
  for (const v of [...(0x91).toString(2).padStart(8, '0')]) { set('0', v); set('1', v); set('0', v); }
  assert.equal(set('0', '1'), true, 'its address acknowledged');
  set('1', '1');
  const got = [];
  for (let n = 0; n < 2; n++) {
    let b = 0;
    for (let i = 0; i < 8; i++) { const low = set('0', '1'); set('1', low ? '0' : '1'); b = (b << 1) | (low ? 0 : 1); }
    got.push(b);
    set('0', '1'); set('0', n === 0 ? '0' : '1'); set('1', n === 0 ? '0' : '1');   // (the master's ACK, then its NACK)
  }
  assert.deepEqual(got, bytes);
  assert.equal(set('0', '1'), false, 'after the NACK: SDA released');
  // (a read with no onRead: not acknowledged)
  const w = createI2cPeripheral(0x48, {});
  w.feed('1', '1'); w.feed('1', '0'); w.feed('0', '0');
  let ack = false;
  for (const v of [...(0x91).toString(2).padStart(8, '0')]) { w.feed('0', v); w.feed('1', v); w.feed('0', v); }
  ack = w.feed('0', '1');
  assert.equal(ack, false);
});

// a circuit: the LM75 at 0x49 (A0 high), powered; a pull-up on SCL, SDA and OS; a 7405 (open collector) driving SCL and
// SDA low while S1 and S2 are on: the master
const bench = ({ noPull = false, power = true, temp = 25 } = {}) => normalizeCircuit({ name: 'lm75', parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 },
  { id: 'U1', type: 'lm75', x: 0, y: 0, temp }, ...(noPull ? [] : [{ id: 'R1', type: 'pull-up', x: 10, y: -6 }, { id: 'R2', type: 'pull-up', x: 12, y: -6 }, { id: 'R3', type: 'pull-up', x: 8, y: -6 }]),
  { id: 'U2', type: '7405', x: 20, y: 0 }, { id: 'S1', type: 'logic-switch', x: 14, y: 6 }, { id: 'S2', type: 'logic-switch', x: 16, y: 8 }],
wires: [...(power ? [{ id: 'wg', points: [[3, 0], [-6, -9]] }, { id: 'wv', points: [[0, -3], [-6, -10]] }] : []), { id: 'wa0', points: [[1, -3], [-6, -10]] }, { id: 'wa1', points: [[2, -3], [-6, -9]] }, { id: 'wa2', points: [[3, -3], [-6, -9]] },
  { id: 'wug', points: [[26, 0], [-6, -9]] }, { id: 'wuv', points: [[20, -3], [-6, -10]] },
  ...(noPull ? [] : [{ id: 'wr1', points: [[10, -6], [1, 0]] }, { id: 'wr2', points: [[12, -6], [0, 0]] }, { id: 'wr3', points: [[8, -6], [2, 0]] }]),
  { id: 'ws1', points: [[14, 6], [20, 0]] }, { id: 'wy1', points: [[21, 0], [1, 0]] }, { id: 'ws2', points: [[16, 8], [22, 0]] }, { id: 'wy2', points: [[23, 0], [0, 0]] }] });
// a master's transfers: { write: [address, bytes…] } or { read: address, n } (its bytes read, ACK each but the last), a
// START before each, a STOP after: [{ c, d, ack, rd }…] (1 released; ack: an ACK's clock high; rd: a read bit's)
function waveform(transfers) {
  const w = [{ c: 1, d: 1 }];
  const byte = (b) => { for (let k = 7; k >= 0; k--) { const v = (b >> k) & 1; w.push({ c: 0, d: v }, { c: 1, d: v }, { c: 0, d: v }); } w.push({ c: 0, d: 1 }, { c: 1, d: 1, ack: true }, { c: 0, d: 1 }); };
  for (const x of transfers) {
    w.push({ c: 1, d: 0 }, { c: 0, d: 0 });
    if (x.write) for (const b of x.write) byte(b);
    else {
      byte(x.read);
      for (let n = 0; n < x.n; n++) {
        for (let k = 0; k < 8; k++) w.push({ c: 0, d: 1 }, { c: 1, d: 1, rd: true }, { c: 0, d: 1 });
        const m = n < x.n - 1 ? 0 : 1;
        w.push({ c: 0, d: m }, { c: 1, d: m }, { c: 0, d: m });
      }
    }
    w.push({ c: 0, d: 0 }, { c: 1, d: 0 }, { c: 1, d: 1 });
  }
  return w;
}
// (the temperature read; THYST read; another address; the configuration and TOS written, TOS read back)
const TRANSFERS = [{ write: [0x92, 0] }, { read: 0x93, n: 2 }, { write: [0x92, 2] }, { read: 0x93, n: 2 }, { write: [0x90, 0] }, { write: [0x92, 1, 0x04] }, { write: [0x92, 3, 24, 0x80] }, { read: 0x93, n: 2 }];
const BYTES = [0x19, 0x00, 75, 0, 24, 0x80];

function liveRun(m, { at = {} } = {}) {
  const sim = createCircuitSim(m);
  sim.run();
  const acks = [], got = [];
  let bits = [], k = 0;
  for (const st of waveform(TRANSFERS)) {
    if (at[k]) at[k](sim);
    sim.set('S1', !st.c); sim.set('S2', !st.d); sim.run(); sim.run();
    if (st.ack) acks.push(sim.pin('U1', 1) === '0' ? 'A' : 'N');
    if (st.rd) { bits.push(sim.pin('U1', 1) === '1' ? 1 : 0); if (bits.length === 8) { got.push(bits.reduce((v, b) => (v << 1) | b, 0)); bits = []; } }
    k++;
  }
  return { sim, acks: acks.join(''), got };
}

test('#5342 the LM75 in a circuit: its address 0x49 (A0 high), its bytes read, the ACKs, another address not; its temperature set while running, OS', () => {
  const { sim, acks, got } = liveRun(bench());
  assert.equal(acks, 'AA' + 'A' + 'AA' + 'A' + 'NN' + 'AAA' + 'AAAA' + 'A');
  assert.deepEqual(got, BYTES);
  assert.deepEqual(sim.shorts(), []);
  // OS: its polarity active high (written above): inactive, pulled low; the temperature set over TOS (24.5 °C): released
  assert.equal(sim.pin('U1', 3), '0');
  sim.setTemp('U1', 30); sim.run();
  assert.deepEqual([sim.pin('U1', 3), sim.sensors().U1.temp, sim.sensors().U1.os], ['1', 30, true]);
  assert.throws(() => sim.setTemp('U2', 30), /U2 is not a temperature sensor of the circuit/);
  // the temperature read after it was set: 30 °C
  const r = liveRun(bench(), { at: { 0: (s) => s.setTemp('U1', 30) } });
  assert.deepEqual(r.got.slice(0, 2), [30, 0]);
  // its saved temperature, its Properties: in 0.5 °C, -55 to 125
  assert.equal(normalizeCircuit({ parts: [{ id: 'U1', type: 'lm75', temp: 21.3 }] }).parts[0].temp, 21.5);
  assert.equal(setPartProps(bench(), 'U1', { temp: 40 }).model.parts.find((p) => p.id === 'U1').temp, 40);
  assert.deepEqual(setPartProps(bench(), 'U1', { temp: 200 }), { error: 'temp: a temperature from -55 to 125 °C' });
});

test('#5342 the LM75\'s checks: powered, its pull-ups (SCL, SDA; OS an open drain\'s), joined to nothing; the library\'s part, its details', () => {
  const lines = (m) => checkCircuit(m).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ noPull: true })), [
    'warning: U2 1Y: open collector with no pull-up: the net floats while it is off (a 74LS input reads it high, an LED stays off)',
    'warning: U1\'s SCL (pin 2) has no pull-up: the I²C bus\'s lines are released high by a pull-up each',
    'warning: U1\'s SDA (pin 1) has no pull-up: the I²C bus\'s lines are released high by a pull-up each']);
  // (OS read by an LED with no pull-up: an open drain's warning)
  const os = normalizeCircuit({ ...bench(), parts: [...bench().parts.filter((p) => p.id !== 'R3'), { id: 'D1', type: 'led', x: 2, y: 4 }], wires: [...bench().wires.filter((w) => w.id !== 'wr3'), { id: 'wo', points: [[2, 0], [2, 4]] }] });
  assert.deepEqual(lines(os), ['warning: U1 OS: open collector with no pull-up: the net floats while it is off (a 74LS input reads it high, an LED stays off)']);
  assert.deepEqual(lines(bench({ power: false })).slice(0, 1), ['warning: U1 (Temperature sensor LM75 (I²C)) is not powered: its VCC (pin 8) is not on the supply\'s + and its GND (pin 4) is not on the supply\'s −']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'U1', type: 'lm75', x: 0, y: 0 }] })), ['warning: U1 (Temperature sensor LM75 (I²C)) joins nothing']);
  assert.deepEqual([PARTS.lm75.kind, PARTS.lm75.pins.map((p) => `${p.n} ${p.name} ${p.dir}`)], ['sensor', ['1 SDA oc', '2 SCL in', '3 OS oc', '4 GND gnd', '5 A2 in', '6 A1 in', '7 A0 in', '8 VCC vcc']]);
  assert.deepEqual(partPins({ type: 'lm75', x: 0, y: 0 }).map((q) => [q.x, q.y]), [[0, 0], [1, 0], [2, 0], [3, 0], [3, -3], [2, -3], [1, -3], [0, -3]], 'a DIP-8');
  assert.match(partInfo('lm75').about, /^Its temperature, set while trying it/);
  assert.equal(LM75.address, 0x48);
  // (its SCL and SDA joined to nothing: no bus, no pull-up asked for)
  const alone = normalizeCircuit({ name: 'c', parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 }, { id: 'U1', type: 'lm75', x: 0, y: 0 }, { id: 'R1', type: 'pull-up', x: 8, y: -6 }, { id: 'D1', type: 'led', x: 5, y: 4 }],
    wires: [{ id: 'wg', points: [[3, 0], [-6, -9]] }, { id: 'wv', points: [[0, -3], [-6, -10]] }, { id: 'wo', points: [[8, -6], [2, 0]] }, { id: 'wa', points: [[5, 4], [-6, -10]] }, { id: 'wk', points: [[6, 4], [2, 0]] }] });
  assert.deepEqual(lines(alone), []);
});

// the circuit's HDL simulated with a test bench setting the switches as the waveform says: the bytes it says it sends
function hdlBytes(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg S1, S2;', '  lm75 dut (.S1(S1), .S2(S2));', '  initial begin', '    S1 = 0; S2 = 0; #100;'];
  for (const st of waveform(TRANSFERS)) L.push(`    S1 = ${st.c ? 0 : 1}; S2 = ${st.d ? 0 : 1}; #100;`);
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e10 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^U1 sends /.test(x)).map((x) => Number(x.split(' ').at(-1)));
}

test('#5342 the LM75 in the circuit\'s HDL: compiled with no warnings, the bytes it sends the live one\'s, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'lm75');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlBytes(lang), BYTES, lang);
  }
});

test('#5342 an Arduino\'s TWI reading the LM75 through a System\'s circuit node: its pointer written, a repeated START, two bytes read (ACK, NACK)', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  const { analyzeSystem } = await import('../core/system-check.js');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  // the LM75 (26.5 °C, at 0x48: its A pins on GND) beside the Uno: SCL to A5, SDA to A4, VCC to 5V, GND to GND; pull-ups
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'U1', type: 'lm75', x: 30, y: 25, temp: 26.5 },
    { id: 'R1', type: 'pull-up', x: 36, y: 20 }, { id: 'R2', type: 'pull-up', x: 38, y: 20 }],
  wires: [{ id: 'c', points: [uno('A5'), [31, 25]] }, { id: 'd', points: [uno('A4'), [30, 25]] }, { id: 'v', points: [uno('5V'), [30, 22]] }, { id: 'g', points: [uno('GND'), [33, 25]] },
    { id: 'wa0', points: [[31, 22], [33, 25]] }, { id: 'wa1', points: [[32, 22], [33, 25]] }, { id: 'wa2', points: [[33, 22], [33, 25]] },
    { id: 'wr1', points: [[36, 20], [31, 25]] }, { id: 'wr2', points: [[38, 20], [30, 25]] }] });
  // the TWI at 100 kHz: START, 0x90 and the pointer 0; a repeated START, 0x91; a byte read with an ACK (r19), one with a
  // NACK (r20); STOP
  const byte = (b) => [`ldi r16, ${b}`, 'sts 0xbb, r16', 'ldi r16, 0x84', 'rcall go'];
  const prog = ['ldi r16, 72', 'sts 0xb8, r16', 'ldi r16, 0xa4', 'rcall go', ...byte(0x90), ...byte(0), 'ldi r16, 0xa4', 'rcall go', ...byte(0x91),
    'ldi r16, 0xc4', 'rcall go', 'lds r19, 0xbb', 'ldi r16, 0x84', 'rcall go', 'lds r20, 0xbb', 'ldi r16, 0x94', 'sts 0xbc, r16', 'end:', 'rjmp end',
    'go:', 'sts 0xbc, r16', 'wait:', 'lds r18, 0xbc', 'sbrs r18, 7', 'rjmp wait', 'ret'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/lm75.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  assert.deepEqual(analyzeSystem(sys, { modules: {}, files: ['fw/lm75.hex', 'src/bench.circ.json'], circuits: { 'src/bench.circ.json': circ } }).diags, [], 'checked: no warnings');
  assert.deepEqual(checkCircuit(circ).map((x) => x.message), []);
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(2e9);
  const cpu = r.sim.nodes.get('uno').cpu;
  assert.deepEqual([cpu.data[19], cpu.data[20]], [0x1a, 0x80], '26.5 °C read');
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: U1')), 'circuit bench: U1 26.5 °C, OS inactive');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

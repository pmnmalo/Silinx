// An ESP32 node's machine beyond Pin and UART (#5495; core/esp32-python.js, core/esp32-buses.js, core/esp32-engine.js):
// a Timer's callbacks at their times (periodic, one-shot, during a sleep, deinit), a PWM's edges (its period and duty, a
// new duty from its time, deinit), an ADC reading its pin's level, the errors MicroPython gives; SPI and I²C masters as
// their pins' waveforms, checked against the System's decoders (each SPI mode, LSB first; an I²C write, a read, a
// repeated START), and run against the spi-avr and i2c-avr examples' FPGA peripherals (spi_echo.vhd: each byte
// answered with the last one plus one; i2c_leds.vhd at 0x42: a byte written on its LEDs, a read its switches), their
// transfers as the System's report decodes them, their exact warnings (an I²C scan: each address no one acknowledged).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepareSystem, systemFromInputs, systemReport, disposeSystem } from '../core/system-run.js';
import { prepareEsp32 } from '../core/system-sim-esp32.js';
import { Esp32Buses, i2cStep, spiTime } from '../core/esp32-buses.js';
import { decodeSpi, decodeI2c, wiredAnd } from '../core/system-decode.js';
import { normalizeSystem } from '../core/system-doc.js';
import { systemPlan } from '../core/system-build.js';
import { checkSystem } from '../core/system-check.js';
import { designOf } from './compiled-diff.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { ROOT } from './examples-lib.mjs';

before(async () => { await import('../server/esp32-spawn.js'); });
const runs = [];
after(() => runs.forEach(disposeSystem));

const ALONE = { format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'esp', kind: 'mcu', board: 'esp32-devkitc', lang: 'micropython', firmware: 'esp/main.py', interfaces: [] }], links: [] };
async function alone(py, ms, pins = {}) {
  const r = await prepareSystem(ALONE, { firmware: async () => py });
  assert.ok(!r.error, r.error);
  runs.push(r);
  const node = r.sim.nodes.get('esp'), edges = [];
  for (const [p, v] of Object.entries(pins)) node.setPin(p, v);
  for (let t = 1e8; t <= ms * 1e9; t += 1e8) edges.push(...node.advanceTo(t).map(e => [e.pin, e.t / 1e6, e.value]));
  return { node, edges, rep: systemReport(r), said: node.messages().map(m => `${m.kind}: ${m.text}`) };
}

test('#5495 a Timer: periodic, its callbacks at their times, during a sleep; one-shot once; deinit stops it; tick_hz and freq', async () => {
  const py = ['from machine import Timer', 'import time', 'seen = []', 'p = Timer(0, mode=Timer.PERIODIC, period=2, callback=lambda t: seen.append(("p", time.ticks_us())))',
    'Timer(1, mode=Timer.ONE_SHOT, period=3, callback=lambda t: seen.append(("o", time.ticks_us())))',
    'f = Timer(2, freq=1000, callback=lambda t: seen.append(("f", time.ticks_us())))', 'time.sleep_ms(5)', 'f.deinit()', 'k = 0', 'while k < 1500:', '    k += 1', '    k += 0', 'p.deinit()', 'time.sleep_ms(4)', 'print(seen)', ''].join('\n');
  const { rep, said } = await alone(py, 20);
  assert.deepEqual(said, []);
  // (each set at its line's time, 4, 5 and 6 µs; during the sleep, each at its time, its callback's line 1 µs; between the
  // loop's lines (each 1 µs), at its time, its line untimed (the trace runs it); none once deinit)
  assert.equal(rep.terminals['esp.repl'], "[('f', 1007), ('p', 2005), ('f', 2007), ('o', 3006), ('f', 3007), ('p', 4005), ('f', 4007), ('f', 5007), ('p', 6004), ('p', 8004)]\n");
});

test('#5495 a PWM: its edges at its period and duty; a new duty from its time; deinit low; MicroPython\'s errors', async () => {
  const py = ['from machine import Pin, PWM', 'import time', 'p = PWM(Pin(4), freq=1000, duty_u16=16384)', 'time.sleep_ms(3)', 'p.duty(1023)', 'time.sleep_ms(1)', 'p.init(freq=500, duty_ns=500000)',
    'time.sleep_ms(4)', 'p.deinit()', 'print(p.freq(), p.duty_u16(), PWM(Pin(5)).duty_u16())', 'PWM(Pin(2), freq=0)', ''].join('\n');
  const { edges, rep, said } = await alone(py, 12);
  // (1 kHz at a quarter from 3 µs, its high round(1e9 × 16384 / 65535) ps; a full duty from 3005 µs (high: no edge); 500 Hz
  // at 500 µs (its duty_u16 16383) from 4007 µs; low at its deinit, 8009 µs; a new one's default: 5 kHz, half)
  assert.deepEqual(edges.filter(e => e[0] === 'GPIO4').map(e => [e[1], e[2]]), [[3, 1], [253.003815, 0], [1003, 1], [1253.003815, 0], [2003, 1], [2253.003815, 0], [3003, 1],
    [4506.977111, 0], [6007, 1], [6506.977111, 0], [8007, 1], [8009, 0]]);
  const g5 = edges.filter(e => e[0] === 'GPIO5').map(e => [e[1], e[2]]);
  assert.deepEqual([g5.length, ...g5.slice(0, 4)], [40, [8010, 1], [8110.001526, 0], [8210, 1], [8310.001526, 0]]);
  assert.equal(rep.terminals['esp.repl'], '0 16383 32768\nTraceback (most recent call last):\n  File "main.py", line 11, in <module>\nValueError: frequency must be from 1Hz to 40MHz\n');
  assert.deepEqual(said, ['error: its program: Traceback (most recent call last): |   File "main.py", line 11, in <module> | ValueError: frequency must be from 1Hz to 40MHz']);
});

test('#5495 an ADC: its pin\'s level (0 or full scale), its width and attenuation; a pin that is not an ADC\'s refused', async () => {
  const py = ['from machine import Pin, ADC', 'import time', 'a = ADC(Pin(34), atten=ADC.ATTN_11DB)', 'b = ADC(Pin(35))', 'b.width(ADC.WIDTH_9BIT)', 'print(a.read_u16(), a.read(), a.read_uv(), b.read_u16(), b.read(), b.read_uv())',
    'time.sleep_ms(2)', 'print(a.read_u16(), b.read())', 'ADC(Pin(5))', ''].join('\n');
  const r = await prepareSystem(ALONE, { firmware: async () => py });
  runs.push(r);
  const node = r.sim.nodes.get('esp');
  node.setPin('GPIO34', 1);
  r.sim.run(1e9);
  node.setPin('GPIO34', 0);
  node.setPin('GPIO35', 1);
  r.sim.run(5e9);
  const rep = systemReport(r);
  assert.equal(rep.terminals['esp.repl'], '65535 4095 2450000 0 0 0\n0 511\nTraceback (most recent call last):\n  File "main.py", line 9, in <module>\nValueError: invalid Pin for ADC\n');
  assert.deepEqual([rep.warnings, rep.errors], [[], ['esp: its program: Traceback (most recent call last): |   File "main.py", line 9, in <module> | ValueError: invalid Pin for ADC']]);
});

// the buses' waveforms alone (a node of their own: its pins' levels, what it reads), as the decoders read them: [t, level, …],
// the first its level from its set-up
function buses() {
  const node = { drive: new Map(), last: new Map(), inVals: new Map(), log: [] }, b = new Esp32Buses(node);
  const waves = {};
  const run = (t) => b.emit(t, (pin, at, value) => (waves[pin] ??= []).push(at, value));
  return { node, b, waves, run };
}

test('#5495 SPI\'s waveforms: each mode, LSB first, as the decoder reads them; MISO read at its sampling edges; its time', () => {
  for (const mode of [0, 1, 2, 3]) for (const lsb of [0, 1]) {
    const { b, waves, run } = buses();
    b.took({ kind: 'spi-init', t: 0, key: 2, sck: 18, mosi: 23, miso: 19, baud: 1e6, polarity: mode >> 1, phase: mode & 1, bits: 8, lsb });
    // (MISO: 0xC3's bits, set as a peripheral sets them: at each bit's start, half a period before its sampling edge)
    const miso = [0, 0], half = 500000;
    for (let i = 0; i < 8; i++) miso.push(1e6 + 2 * i * half + 1, (0xc3 >> (lsb ? i : 7 - i)) & 1);
    for (let k = 2; k < miso.length; k += 2) b.got('GPIO19', miso[k], miso[k + 1]);
    b.took({ kind: 'spi', t: 1e6, key: 2, bytes: [0xa5] });
    assert.equal(b.next(), 1e6 + spiTime({ baud: 1e6, bits: 8 }, 1));
    run(20e6);
    const d = decodeSpi({ sck: waves.GPIO18, mosi: waves.GPIO23, miso }, { mode, lsbFirst: !!lsb });
    assert.deepEqual(d.transfers.map(x => [x.mosi, x.miso]), [[0xa5, 0xc3]], `mode ${mode} lsb ${lsb}`);
    assert.equal(d.hz, 1e6);
    assert.deepEqual(b.due(9e6), [{ bus: 'spi2', t: 9e6, value: [0xc3] }], `mode ${mode} lsb ${lsb}`);
  }
});

test('#5495 I²C\'s waveforms: a START, an address, a byte written, a repeated START, a byte read, a STOP, as the decoder reads them; the ACKs read', () => {
  const { b, waves, run } = buses();
  const back = [0, null], got = b.got.bind(b);
  b.got = (P, t, v) => { back.push(t, v); got(P, t, v); };
  b.took({ kind: 'i2c-init', t: 0, key: 0, scl: 18, sda: 19, freq: 100000 });
  const h = 5e6;
  let t = 1e6;
  const step = (op, arg) => { b.took({ kind: 'i2c', t, key: 0, op, arg }); t += i2cStep(op, arg, op === 'start' ? t > 1e6 : true).end * h; };
  // (the peripheral pulls SDA low for each ACK of its, the address's ninth bit and the byte's, from SCL's fall to the next; it
  // sends 0x5A when read, each bit from SCL's fall, then releases it for the master's NACK)
  const ack = () => { b.got('GPIO19', t - 1.75 * h, 0); b.got('GPIO19', t + h / 4, null); };
  step('start'); step('write', 0x84); ack();
  step('write', 0x07); ack();
  assert.deepEqual(b.due(t).map(x => x.value), [1, 1], 'both acknowledged');
  step('start'); step('write', 0x85); ack();
  const r0 = t;
  for (let i = 0; i < 8; i++) b.got('GPIO19', r0 + (2 * i + 0.75) * h, (0x5a >> (7 - i)) & 1 ? null : 0);
  b.got('GPIO19', r0 + 16.25 * h, null);
  step('read', 0);
  step('stop');
  assert.deepEqual(b.due(t).map(x => x.value), [1, 0x5a]);
  run(t + h);
  // (the bus: the master's SDA and the peripheral's, wired)
  const d = decodeI2c({ scl: waves.GPIO18, sda: wiredAnd(waves.GPIO19, back) });
  assert.deepEqual(d.transfers.map(x => [x.addr, x.read, x.ack, x.data.map(y => [y.byte, y.ack])]), [[0x42, false, true, [[7, true]]], [0x42, true, true, [[0x5a, false]]]]);
  assert.equal(d.hz, 100000);
});

const SPI_SRC = fs.readFileSync(path.join(ROOT, 'examples/spi-avr/fpga/spi_echo.vhd'), 'utf8');
const SPI_PORTS = { spi_echo: [['clk', 'in', 1], ['sck', 'in', 1], ['mosi', 'in', 1], ['ss', 'in', 1], ['miso', 'out', 1], ['led', 'out', 8]].map(([name, dir, width]) => ({ name, dir, width })) };
const I2C_SRC = fs.readFileSync(path.join(ROOT, 'examples/i2c-avr/fpga/i2c_leds.vhd'), 'utf8');
const I2C_PORTS = { i2c_leds: [['clk', 'in', 1], ['scl', 'in', 1], ['sda', 'inout', 1], ['sw', 'in', 8], ['led', 'out', 8]].map(([name, dir, width]) => ({ name, dir, width })) };
const netlist = (src, mod) => netlistOf(designOf([{ path: `src/${mod}.vhd`, lang: 'vhdl', role: 'design', text: src }], mod), { run: yosysNode });
async function withFpga(sys, ports, net, py) {
  await prepareEsp32(['esp']);
  const r = systemFromInputs(sys, { plan: systemPlan(sys, { ports }), netlists: { fpga: await net }, firmware: { esp: { name: 'esp/main.py', data: py } } });
  assert.equal(r.error, undefined);
  runs.push(r);
  return r;
}

test('#5495 an ESP32\'s SPI(2) and the spi-avr example\'s FPGA: checked (no warning: 3.3 V), its pins; 0x41 0x42 0x43 at 125 kHz, the answers 00 42 43; its LEDs the last', async () => {
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [
    { id: 'fpga', kind: 'fpga', module: 'spi_echo', board: 'basys2', variant: '250', pins: { clk: 'B8', sck: 'B2', mosi: 'A3', miso: 'J3', ss: 'B5' }, interfaces: [{ name: 'bus', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss', hz: 125000, mode: 0 }] },
    { id: 'esp', kind: 'mcu', board: 'esp32-devkitc', lang: 'micropython', firmware: 'esp/main.py', interfaces: [{ name: 'SPI2', kind: 'spi', hz: 125000, mode: 0 }] }],
  links: [{ id: 'spi', kind: 'spi', a: 'esp.SPI2', b: 'fpga.bus' }] });
  assert.deepEqual(checkSystem(sys, { modules: SPI_PORTS, files: ['esp/main.py'] }), []);
  assert.deepEqual(systemPlan(sys, { ports: SPI_PORTS }).wires.map(w => [w.name, w.from, w.to]), [['spi_sck', 'esp.GPIO18', 'fpga.sck'], ['spi_mosi', 'esp.GPIO23', 'fpga.mosi'], ['spi_ss', 'esp.GPIO5', 'fpga.ss'], ['spi_miso', 'fpga.miso', 'esp.GPIO19']]);
  const py = ['from machine import Pin, SPI', 'ss = Pin(5, Pin.OUT, value=1)', 'spi = SPI(2, baudrate=125000)', 'ss.value(0)', 'print(spi.read(1, 0x41), spi.read(1, 0x42))', 'b = bytearray(1)', 'spi.write_readinto(b"C", b)', 'ss.value(1)', 'print(b)', ''].join('\n');
  const r = await withFpga(sys, SPI_PORTS, netlist(SPI_SRC, 'spi_echo'), py);
  r.sim.run(1e9);
  const rep = systemReport(r);
  assert.deepEqual(rep.spi.map(s => [s.link, s.from, s.to, s.hz, s.mode, s.transfers.map(x => [x.mosi, x.miso])]), [['spi', 'esp', 'fpga', 125000, 0, [[0x41, 0x00], [0x42, 0x42], [0x43, 0x43]]]]);
  assert.equal(rep.terminals['esp.repl'], "b'\\x00' b'B'\nbytearray(b'C')\n");
  assert.equal(r.sim.nodes.get('fpga').value('led'), 0x43);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

test('#5495 an ESP32\'s I2C(0) and the i2c-avr example\'s FPGA at 100 kHz: a scan (0x42 the one that answers, each other address a warning), a byte written on its LEDs, the switches read, a memory read (a repeated START), ENODEV', async () => {
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [
    { id: 'fpga', kind: 'fpga', module: 'i2c_leds', board: 'basys2', variant: '250', pins: { clk: 'B8', scl: 'B2', sda: 'A3' }, interfaces: [{ name: 'bus', kind: 'i2c', scl: 'scl', sda: 'sda', hz: 100000 }] },
    { id: 'esp', kind: 'mcu', board: 'esp32-devkitc', lang: 'micropython', firmware: 'esp/main.py', interfaces: [{ name: 'I2C0', kind: 'i2c', hz: 100000 }] }],
  links: [{ id: 'i2c', kind: 'i2c', a: 'esp.I2C0', b: 'fpga.bus' }] });
  assert.deepEqual(checkSystem(sys, { modules: I2C_PORTS, files: ['esp/main.py'] }), []);
  const py = ['from machine import I2C', 'i2c = I2C(0, freq=100000)', 'print(i2c.scan())', 'print(i2c.writeto(0x42, b"\\x07"))', 'print(i2c.readfrom(0x42, 2))', 'print(i2c.readfrom_mem(0x42, 3, 1))',
    'try:', '    i2c.writeto(0x50, b"x")', 'except OSError as e:', '    print("nack", e)', ''].join('\n');
  const r = await withFpga(sys, I2C_PORTS, netlist(I2C_SRC, 'i2c_leds'), py);
  r.sim.nodes.get('fpga').setPin('sw', 0x5a);
  r.sim.run(30e9);
  const rep = systemReport(r);
  assert.equal(rep.terminals['esp.repl'], "[66]\n1\nb'ZZ'\nb'Z'\nnack [Errno 19] ENODEV\n");
  const [bus] = rep.i2c;
  // (the scan's 112 addresses, 0x08 to 0x77, each a START, its address and a STOP; then a write, a read of two (the last
  // NACKed), the memory read's write and its read after a repeated START, the address 0x50 no one acknowledged)
  assert.deepEqual([bus.link, bus.from, bus.to, bus.hz, bus.transfers.length], ['i2c', 'esp', 'fpga', 100000, 112 + 5]);
  assert.deepEqual(bus.transfers.slice(0, 112).map(x => [x.addr, x.ack]), [...Array(112).keys()].map(k => [k + 8, k + 8 === 0x42]));
  assert.deepEqual(bus.transfers.slice(112).map(x => [x.read ? 'R' : 'W', x.addr, x.ack, x.data.map(d => [d.byte, d.ack])]), [['W', 0x42, true, [[7, true]]], ['R', 0x42, true, [[0x5a, true], [0x5a, false]]],
    ['W', 0x42, true, [[3, true]]], ['R', 0x42, true, [[0x5a, false]]], ['W', 0x50, false, []]]);
  assert.equal(r.sim.nodes.get('fpga').value('led'), 3);
  const nobody = a => `i2c: no peripheral acknowledged the address 0x${a.toString(16).padStart(2, '0')} (${a === 0x50 ? 2 : 1} time(s))`;
  assert.deepEqual(rep.warnings, [...Array(112).keys()].map(k => k + 8).filter(a => a !== 0x42).map(nobody));
  assert.deepEqual(rep.errors, []);
});

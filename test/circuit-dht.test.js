// A temperature and humidity sensor, a DHT11 or a DHT22 (#5470, core/circuit-dht.js): its frames (an independent
// decoding of the datasheet's examples); a read answered 30 µs after the release with its 40 bits' timings; a start too
// short and a read too soon not answered, said once; in a circuit (DATA pulled up, a button to GND the host's start, an
// LED showing DATA) its answer the same in VHDL and in Verilog, its HDL with no warnings; what it senses saved, normalized
// on its step, edited, set while running; its checks (a button to GND on its open-drain DATA no error); an Arduino
// reading a DHT22 through a System, its 40 bits timed by Timer1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDht, dhtBytes, dhtAnswer, DHT11, DHT22, DHT_WIRE } from '../core/circuit-dht.js';
import { normalizeCircuit } from '../core/circuit.js';
import { setPartProps } from '../core/circuit-edit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER, sensePin, nudged } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const MS = 1e6, US = 1e3;   // (ns)
// an independent decoding: the bytes' bits, the humidity and the temperature as a host reads them
const bitsOf = (bytes) => bytes.flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((k) => (b >> k) & 1));
const read22 = (b) => ({ hum: ((b[0] << 8) | b[1]) / 10, temp: (b[2] & 0x80 ? -1 : 1) * (((b[2] & 0x7f) << 8) | b[3]) / 10, ok: ((b[0] + b[1] + b[2] + b[3]) & 255) === b[4] });

test('#5470 the frames: a DHT11\'s whole humidity and temperature, a DHT22\'s tenths and sign bit, their checksums (the datasheets\' examples)', () => {
  // (AM2302's datasheet: 65.2 %RH, 35.1 °C → 0x02 0x8C 0x01 0x5F, checksum 0xEE; -10.1 °C → 0x80 0x65)
  assert.deepEqual(dhtBytes(22, 35.1, 65.2), [0x02, 0x8c, 0x01, 0x5f, 0xee]);
  assert.deepEqual(dhtBytes(22, -10.1, 65.2).slice(2, 4), [0x80, 0x65]);
  assert.deepEqual(read22(dhtBytes(22, -12.3, 45.6)), { hum: 45.6, temp: -12.3, ok: true });
  assert.deepEqual(dhtBytes(11, 23, 61), [61, 0, 23, 0, 84]);
  // (its answer: 80 µs low, 80 released, each bit 50 low then 26 or 70 released, 50 low, released)
  const a = dhtAnswer([0xa5, 0, 0, 0, 0xa5], 1000);
  assert.equal(a.length, 2 + 80 + 2);
  assert.deepEqual(a.slice(0, 6), [[1000, '0'], [81000, 'Z'], [161000, '0'], [211000, 'Z'], [281000, '0'], [331000, 'Z']]);
  const highs = [];
  for (let i = 3; i + 1 < a.length - 2; i += 2) highs.push(a[i + 1][0] - a[i][0]);
  assert.deepEqual(highs.slice(0, 8).map((w) => (w === DHT_WIRE.one ? 1 : 0)), bitsOf([0xa5]));
});

test('#5470 the sensor: answered 30 µs after a long enough start; too short, too soon (its interval, its power-on): not answered, said once', () => {
  const s = createDht({ model: 22, temp: 21.5, hum: 40 });
  s.powerOn(0);
  // (at 1 s: too soon after its power-on)
  s.line('0', 1000 * MS);
  assert.equal(s.line('1', 1001.2 * MS), null);
  // (at 2.5 s: 0.5 ms, too short)
  s.line('0', 2500 * MS);
  assert.equal(s.line('1', 2500.5 * MS), null);
  assert.deepEqual(s.warnings.map((w) => w.text), ['read 1.001 s after its last read or its power-on: a DHT22 answers once every 2 s', 'a start of 0.5 ms: a DHT22\'s is 1 ms or more']);
  // (at 3 s: 1.2 ms, answered at the release + 30 µs; its levels as its wake-ups go)
  s.line('0', 3000 * MS);
  const t0 = s.line('1', 3001.2 * MS);
  assert.equal(t0, 3001.2 * MS + 30 * US);
  assert.equal(s.answering, true);
  const levels = [];
  for (let w = s.wake(t0); ; w = s.wake(w.next)) { levels.push(w.drive); if (w.next == null) break; }
  assert.deepEqual([levels.length, levels.slice(0, 3), levels.at(-1), s.answering], [84, ['0', 'Z', '0'], 'Z', false]);
  assert.deepEqual(s.state(), { temp: 21.5, hum: 40, reads: 1 });
  // (its own release at the end is not a host's start)
  assert.equal(s.line('0', 3006 * MS), null);
  assert.equal(s.warnings.length, 2);
});

// a circuit: the sensor powered, DATA pulled up, a button to GND (the host's start), an LED lit while DATA is high
const bench = ({ type = 'dht22', pull = true, temp = -12.3, hum = 45.6 } = {}) => normalizeCircuit({ name: 'dht', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 },
  { id: 'DHT1', type, x: 0, y: 0, temp, hum }, ...(pull ? [{ id: 'R1', type: 'pull-up', x: 1, y: 3 }] : []), { id: 'B1', type: 'button', x: 1, y: 5 }, { id: 'D1', type: 'led', x: 6, y: 3 }],
wires: [{ id: 'd', points: [[1, 0], [1, 3]] }, { id: 'b', points: [[1, 3], [1, 5]] }, { id: 'a', points: [[1, 3], [6, 3]] }, { id: 'k', points: [[7, 3], [-10, -13]] }, { id: 'bg', points: [[4, 5], [-10, -13]] },
  { id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'g', points: [[3, 0], [-10, -13]] }] });
// the live one: B1 pressed at 2.5 s for `hold`, then 100 ms; the LED's changes
function live(m, hold) {
  const sim = createCircuitSim(m), seen = [];
  let lit = null;
  const look = () => { const v = sim.leds().D1; if (v !== lit) { seen.push(`D1=${v === 'on' ? 1 : 0} at ${sim.time}`); lit = v; } };
  const until = (t) => { for (;;) { const w = sim.nextWake(); if (w == null || w > t) break; sim.advance(w - sim.time); look(); } sim.advance(t - sim.time); look(); };
  sim.run(); look();
  until(2500 * MS); sim.set('B1', true); sim.run(); look(); until(2500 * MS + hold); sim.set('B1', false); sim.run(); look(); until(2600 * MS);
  return { sim, seen };
}
// the LED's changes decoded: the highs after the response's, each a bit
const decode = (seen) => {
  const t = seen.map((l) => Number(l.split(' at ')[1])), highs = [];
  for (let i = 2; i + 1 < t.length; i += 2) highs.push(t[i + 1] - t[i]);
  const bits = highs.slice(2, 42).map((w) => (w > 50 * US ? 1 : 0));
  return [0, 1, 2, 3, 4].map((k) => parseInt(bits.slice(k * 8, k * 8 + 8).join(''), 2));
};

test('#5470 the sensor in a circuit: a button\'s start read, its answer lighting the LED; its frame decoded; a short start said', () => {
  const r = live(bench(), 20 * MS);
  assert.equal(r.seen.length, 87);
  assert.deepEqual(r.seen.slice(0, 4), ['D1=1 at 0', 'D1=0 at 2500000000', 'D1=1 at 2520000000', 'D1=0 at 2520030000']);
  assert.deepEqual(read22(decode(r.seen)), { hum: 45.6, temp: -12.3, ok: true });
  assert.deepEqual([r.sim.dhts(), r.sim.servoWarnings()], [{ DHT1: { temp: -12.3, hum: 45.6, reads: 1 } }, []]);
  // (a DHT11: 20 ms is enough, its whole values)
  const e = live(bench({ type: 'dht11', temp: 23, hum: 61 }), 20 * MS);
  assert.deepEqual(decode(e.seen), [61, 0, 23, 0, 84]);
  // (5 ms: a DHT11's start too short)
  assert.deepEqual(live(bench({ type: 'dht11' }), 5 * MS).sim.servoWarnings(), ['DHT1: a start of 5 ms: a DHT11\'s is 18 ms or more']);
  // (set while running: 30.2 °C, on its step; out of its range refused)
  r.sim.setSensed('DHT1', 'temp', 30.24);
  assert.equal(r.sim.sensed('DHT1', 'temp'), 30.2);
  assert.throws(() => r.sim.setSensed('DHT1', 'hum', 101), /^Error: DHT1's hum: from 0 to 100 %$/);
});

test('#5470 saved: what it senses in its range on its step; edited; its controls\' names; its checks; the library\'s parts', () => {
  const of = (type, p) => normalizeCircuit({ name: 'c', parts: [{ id: 'DHT1', type, x: 0, y: 0, ...p }] }).parts[0];
  assert.deepEqual([of('dht22', {}), of('dht22', { temp: 25.34, hum: 99.96 }), of('dht11', { temp: -5, hum: 95 }), of('dht11', { temp: 21.6 })].map((p) => [p.temp, p.hum]), [[25, 50], [25.3, 100], [0, 90], [22, 50]]);
  assert.equal(setPartProps(bench(), 'DHT1', { temp: 19.96, hum: 55 }).model.parts.find((p) => p.id === 'DHT1').temp, 20);
  assert.equal(setPartProps(bench(), 'DHT1', { hum: 120 }).error, 'hum: humidity from 0 to 100 %');
  assert.deepEqual(DHT22.sense.map((x) => sensePin({ id: 'DHT1', type: 'dht22' }, x)), ['DHT1.temp', 'DHT1.hum']);
  assert.deepEqual([nudged(DHT22.sense[0], 79.5, 1), nudged(DHT22.sense[1], 2, -1), nudged(DHT11.sense[1], 50, 1)], [80, 0, 55]);
  const lines = (c) => checkCircuit(c).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), [], 'a button to GND on its open-drain DATA: no error (#5470)');
  assert.deepEqual(lines(bench({ pull: false })), ['warning: DHT1 DATA: open collector with no pull-up: the net floats while it is off (a 74LS input reads it high, an LED stays off)']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'DHT1', type: 'dht11', x: 0, y: 0 }] })), ['warning: DHT1 (Temperature and humidity sensor (DHT11)) joins nothing']);
  assert.deepEqual([PARTS.dht11, PARTS.dht22, DHT22.pins.map((p) => `${p.name} ${p.dir}`), PART_ORDER.indexOf('dht22') > 0, EXPORTED_PARTS.some((t) => /^dht/.test(t))], [DHT11, DHT22, ['VCC vcc', 'DATA oc', 'NC nc', 'GND gnd'], true, false]);
  assert.match(partInfo('dht11').about, /^A temperature and humidity sensor on one wire, .* 18 ms/);
  assert.match(partInfo('dht22').about, /^A temperature and humidity sensor on one wire \(AM2302\), .* 1 ms/);
});

// the circuit's HDL simulated with a test bench pressing the button as the live run does: the LED's changes
function hdlLines(m, lang, hold) {
  const g = generateCircuit(m, lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb; reg B1; wire D1; dht dut (.B1(B1), .D1(D1));', '  always @(D1) if (D1 !== 1\'bx) $display("D1=%b at %0t", D1, $time);',
    `  initial begin B1 = 0; #${2500 * MS}; B1 = 1; #${hold}; B1 = 0; #${100 * MS}; $finish; end`, 'endmodule'];
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e16 });
  assert.deepEqual(r.errors, [], lang);
  const lines = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^D1=/.test(x));
  while (lines.length > 1 && / at 0$/.test(lines[1])) lines.shift();   // (its levels settling at 0)
  return lines;
}

test('#5470 the sensors in the circuit\'s HDL: compiled with no warnings; their answer the live one\'s, in VHDL and in Verilog', () => {
  for (const type of ['dht11', 'dht22']) {
    const m = bench({ type }), want = live(m, 20 * MS).seen;
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateCircuit(m, lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'dht');
      assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${type} ${lang}: no warnings`);
      assert.deepEqual(hdlLines(m, lang, 20 * MS), want, `${type} ${lang}`);
    }
  }
});

test('#5470 an Arduino reading a DHT22 on D2 through a System: its start, the 40 bits\' highs timed by Timer1, decoded', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'DHT1', type: 'dht22', x: 30, y: 30, temp: -12.3, hum: 45.6 },
    { id: 'R1', type: 'pull-up', x: 31, y: 33 }],
  wires: [{ id: 'v', points: [uno('5V'), [30, 30]] }, { id: 'd', points: [uno('D2'), [31, 30]] }, { id: 'r', points: [[31, 30], [31, 33]] }, { id: 'g', points: [uno('GND'), [33, 30]] }] });
  // 2.2 s waited (its power-on), PD2 low 1.2 ms then released (its pull-up's rise waited for), Timer1 at clk/8; its
  // response skipped; each bit's high timed
  // (TCNT1 cleared at its rise, read at its fall), stored at 0x100 + i
  const wait = (n, m, l) => [`ldi r18, ${n}`, `${l}a:`, `ldi r19, ${m}`, `${l}b:`, 'ldi r20, 255', `${l}c:`, 'dec r20', `brne ${l}c`, 'dec r19', `brne ${l}b`, 'dec r18', `brne ${l}a`];
  const low = (l) => [`${l}:`, 'in r16, 0x09', 'sbrc r16, 2', `rjmp ${l}`], high = (l) => [`${l}:`, 'in r16, 0x09', 'sbrs r16, 2', `rjmp ${l}`];
  const prog = [...wait(170, 255, 'p'), 'ldi r16, 0x04', 'out 0x0a, r16', 'ldi r16, 0x00', 'out 0x0b, r16', ...wait(1, 26, 's'),
    'ldi r16, 0x00', 'out 0x0a, r16', 'ldi r16, 0x02', 'sts 0x81, r16', ...high('rr'), ...low('r0'), ...high('r1'), ...low('r2'),
    ...Array.from({ length: 40 }, (_, i) => [...high(`h${i}`), 'ldi r16, 0x00', 'sts 0x85, r16', 'sts 0x84, r16', ...low(`l${i}`), 'lds r24, 0x84', 'lds r25, 0x85', `sts ${0x100 + i}, r24`]).flat(),
    'end:', 'rjmp end'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/dht.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(2.5e12);
  const data = r.sim.nodes.get('uno').cpu.data, counts = Array.from({ length: 40 }, (_, i) => data[0x100 + i]);
  // (26 µs: 52 counts, 70 µs: 140, give or take the loops' cycles)
  assert.ok(counts.every((c) => Math.abs(c - 52) <= 3 || Math.abs(c - 140) <= 3), JSON.stringify(counts));
  const bytes = [0, 1, 2, 3, 4].map((k) => parseInt(counts.slice(k * 8, k * 8 + 8).map((c) => (c > 96 ? 1 : 0)).join(''), 2));
  assert.deepEqual(read22(bytes), { hum: 45.6, temp: -12.3, ok: true });
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: DHT1')), 'circuit bench: DHT1 -12.3 °C, 45.6 %, 1 read(s) answered');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

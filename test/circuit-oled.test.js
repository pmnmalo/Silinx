// The graphic OLED 128×64 (#5336, core/circuit-oled.js, core/circuit-i2c.js): its controller against the SSD1306's
// datasheet (the control byte, the commands and their parameters, the addressing modes, the page mode's nibbles, the
// display's charge pump, the screen's mapping: remap, COM scan, start line, inverse, entire on); its I²C peripheral in a
// circuit, the bus open drain (two pull-ups, a 7405's open-collector outputs pulling each line low): its address and each
// byte acknowledged, another address and a read not; powered off: reset; its checks (powered, its pull-ups); its HDL in
// VHDL and in Verilog, its reports the live one's; an Arduino's TWI writing to it through a System's circuit node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createSsd1306 } from '../core/circuit-oled.js';
import { createI2cPeripheral } from '../core/circuit-i2c.js';
import { PARTS, partCorners } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const ctl = (o, ...cmds) => { o.start(); for (const c of cmds) { o.write(0x80); o.write(c); } };   // (each command its own control byte, Co 1)
const stream = (o, dc, bytes) => { o.start(); o.write(dc ? 0x40 : 0x00); for (const b of bytes) o.write(b); };

test('#5336 the SSD1306: dark until on with its charge pump; horizontal mode in a column and page range, wrapping', () => {
  const o = createSsd1306();
  stream(o, false, [0x20, 0x00, 0x21, 2, 3, 0x22, 1, 2]);
  stream(o, true, [0xff, 0x01, 0x03, 0x07, 0x0f]);   // (columns 2, 3 of page 1, then of page 2, then page 1 again)
  assert.deepEqual([o.state().on, o.state().pages], [false, [0, 5, 5, 0, 0, 0, 0, 0]], 'page 1\'s column 2 written again: 0x0f');
  stream(o, false, [0xaf]);
  assert.equal(o.state().on, false, 'its charge pump off');
  stream(o, false, [0x8d, 0x14, 0xa1, 0xc8]);
  const s = o.state();
  assert.deepEqual([s.on, s.lit], [true, 10]);
  // (with A1 and C8 column 2 at x 2, page 1's row 0 at y 8: its column 2 0x0f, rows 8..11; its column 3 0x01)
  assert.deepEqual([8, 9, 10, 11, 12, 16].map((y) => s.rows[y].slice(0, 5)), ['00110', '00100', '00100', '00100', '00000', '00110']);
});

test('#5336 vertical and page modes, the page mode\'s column nibbles; Co 1 commands; parameters across control bytes', () => {
  const o = createSsd1306();
  ctl(o, 0x8d, 0x14, 0xaf, 0xa1, 0xc8, 0x20, 0x01, 0x21, 0, 1, 0x22, 0, 1);
  stream(o, true, [1, 2, 4, 8]);   // (vertical: page 0, page 1 of column 0, then of column 1)
  assert.deepEqual(o.state().pages.slice(0, 2), [2, 2]);
  assert.deepEqual([0, 9, 2, 11].map((y) => o.state().rows[y].slice(0, 2)), ['10', '10', '01', '01']);
  ctl(o, 0x20, 0x02, 0xb5, 0x0a, 0x12);   // (page mode: page 5, column 0x2a)
  stream(o, true, [0x80, 0x80]);
  assert.deepEqual(o.state().rows[47].slice(0x2a, 0x2c), '11');
  // (the other commands' parameters taken: A8 3F, D3 00, D5 80 not read as commands)
  stream(o, false, [0xa8, 0x3f, 0xd3, 0x00, 0xd5, 0x80]);
  assert.equal(o.state().on, true);
});

test('#5336 the screen\'s mapping: no remap nor C8 (mirrored and upside down, as the module at power-on), start line, inverse, entire on; reset', () => {
  const o = createSsd1306();
  stream(o, false, [0x8d, 0x14, 0xaf, 0x20, 0x00]);
  stream(o, true, [0x01]);   // (column 0, row 0)
  assert.equal(o.state().rows[63][127], '1', 'A0 and C0: at the bottom right');
  stream(o, false, [0xa1, 0xc8, 0x41]);   // (start line 1: row 0 shown at the bottom)
  assert.equal(o.state().rows[63][0], '1');
  stream(o, false, [0x40, 0xa7]);
  assert.equal(o.state().lit, 128 * 64 - 1, 'inverse');
  stream(o, false, [0xa6, 0xa5]);
  assert.equal(o.state().lit, 128 * 64, 'entire display on');
  o.reset();
  assert.deepEqual(o.state(), { on: false, lit: 0, pages: [0, 0, 0, 0, 0, 0, 0, 0], rows: [] });
});

test('#5336 the I²C peripheral alone: its address and bytes acknowledged, another address and a read not; a STOP, a repeated START', () => {
  const got = [];
  const bus = createI2cPeripheral(0x3c, { onStart: () => got.push('start'), onByte: (b) => got.push(b), onStop: () => got.push('stop') });
  const lines = [];
  let scl = '1', sda = '1';
  const set = (c, d) => { scl = c; sda = d; return bus.feed(c, d); };
  const send = (bytes) => {
    set(scl, '1'); set('1', '1'); set('1', '0'); set('0', '0');   // (SDA released, SCL high, then SDA falling: a START)
    for (const b of bytes) {
      for (let k = 7; k >= 0; k--) { const v = (b >> k) & 1 ? '1' : '0'; set('0', v); set('1', v); set('0', v); }
      set('0', '1'); const ack = set('1', '1'); set('0', '1'); lines.push(ack ? 'A' : 'N');
    }
  };
  set('1', '1');
  send([0x78, 0x40, 0xaa]); set('0', '0'); set('1', '0'); set('1', '1');   // (a STOP)
  send([0x7a, 0x00]);   // (0x3D: not ours)
  send([0x79]);   // (a read of ours: not simulated)
  send([0x78, 0x11]); set('0', '1'); set('1', '1'); send([0x78]);   // (a repeated START after data)
  assert.deepEqual(lines, ['A', 'A', 'A', 'N', 'N', 'N', 'A', 'A', 'A']);
  assert.deepEqual(got, ['start', 0x40, 0xaa, 'stop', 'start', 0x11, 'stop', 'start']);
  assert.equal(scl + sda, '01');
});

// a circuit: the OLED powered, a pull-up on SCL and on SDA, a 7405 (hex inverter, open collector) driving each line low
// while its switch is on (S1 SCL, S2 SDA): the bus's master, open drain; `noPull` without the pull-ups
const bench = ({ noPull = false, power = true } = {}) => normalizeCircuit({ name: 'oled', parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 },
  { id: 'OLED1', type: 'oled-ssd1306', x: 0, y: 0 }, ...(noPull ? [] : [{ id: 'R1', type: 'pull-up', x: 10, y: -6 }, { id: 'R2', type: 'pull-up', x: 12, y: -6 }]),
  { id: 'U1', type: '7405', x: 20, y: 0 }, { id: 'S1', type: 'logic-switch', x: 14, y: 6 }, { id: 'S2', type: 'logic-switch', x: 16, y: 8 }],
wires: [...(power ? [{ id: 'wg', points: [[0, 0], [-6, -9]] }, { id: 'wv', points: [[1, 0], [-6, -10]] }] : []), { id: 'wug', points: [[26, 0], [-6, -9]] }, { id: 'wuv', points: [[20, -3], [-6, -10]] },
  ...(noPull ? [] : [{ id: 'wr1', points: [[10, -6], [2, 0]] }, { id: 'wr2', points: [[12, -6], [3, 0]] }]),
  { id: 'ws1', points: [[14, 6], [20, 0]] }, { id: 'wy1', points: [[21, 0], [2, 0]] }, { id: 'ws2', points: [[16, 8], [22, 0]] }, { id: 'wy2', points: [[23, 0], [3, 0]] }] });
// the transfers as a master makes them: each a list of bytes, a START before and a STOP after: [{ c, d, ack, stop }…]
// (the levels of SCL and SDA, 1 released; ack: the ACK's clock high, read; stop: the STOP's end)
function waveform(transfers) {
  const w = [{ c: 1, d: 1 }];
  for (const bytes of transfers) {
    w.push({ c: 1, d: 0 }, { c: 0, d: 0 });
    for (const b of bytes) {
      for (let k = 7; k >= 0; k--) { const v = (b >> k) & 1; w.push({ c: 0, d: v }, { c: 1, d: v }, { c: 0, d: v }); }
      w.push({ c: 0, d: 1 }, { c: 1, d: 1, ack: true }, { c: 0, d: 1 });
    }
    w.push({ c: 0, d: 0 }, { c: 1, d: 0 }, { c: 1, d: 1, stop: true });
  }
  return w;
}
const INIT = [0x78, 0x00, 0x8d, 0x14, 0xaf, 0xa1, 0xc8, 0x20, 0x00];
// (its init; 14 pixels; another address; display off; on again, a column range)
const TRANSFERS = [INIT, [0x78, 0x40, 0xff, 0x81, 0x3c], [0x7a, 0x40, 0xff], [0x78, 0x00, 0xae], [0x78, 0x00, 0xaf, 0x21, 4, 5]];
// what the HDL says after a STOP that changed it, from the live one's state
const said = (s) => (s.on ? `OLED1 on ${s.pages.join(' ')}` : 'OLED1 off');
const LIVE = ['OLED1 on 0 0 0 0 0 0 0 0', 'OLED1 on 14 0 0 0 0 0 0 0', 'OLED1 off', 'OLED1 on 14 0 0 0 0 0 0 0'];

test('#5336 the OLED in a circuit: its bus open drain (pulled up, a 7405 pulling each line low), each byte acknowledged, another address not; its pixels; no short', () => {
  const sim = createCircuitSim(bench());
  sim.run();
  const acks = [], live = [];
  let last = `off|${[0, 0, 0, 0, 0, 0, 0, 0]}`;
  for (const st of waveform(TRANSFERS)) {
    sim.set('S1', !st.c); sim.set('S2', !st.d); sim.run(); sim.run();
    if (st.ack) acks.push(sim.pin('OLED1', 4) === '0' ? 'A' : 'N');
    if (st.stop) { const o = sim.oleds().OLED1, key = `${o.on ? 'on' : 'off'}|${o.pages}`; if (key !== last) { live.push(said(o)); last = key; } }
  }
  assert.deepEqual(acks.join(''), 'AAAAAAAAA' + 'AAAAA' + 'NNN' + 'AAA' + 'AAAAAA');
  assert.deepEqual(live, LIVE);
  assert.deepEqual([sim.oleds().OLED1.lit, sim.shorts()], [14, []]);
  // its supply gone: reset, dark
  const off = createCircuitSim(bench({ power: false }));
  off.run();
  for (const st of waveform(TRANSFERS.slice(0, 2))) { off.set('S1', !st.c); off.set('S2', !st.d); off.run(); }
  assert.deepEqual([off.oleds().OLED1.on, off.oleds().OLED1.pages[0]], [false, 0]);
});

test('#5336 the OLED\'s checks: powered, its pull-ups, joined to nothing; the library\'s part, its details, its corners', () => {
  const lines = (m) => checkCircuit(m).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ noPull: true })), [
    'warning: U1 1Y: open collector with no pull-up: the net floats while it is off (a 74LS input reads it high, an LED stays off)',
    'warning: OLED1\'s SCL (pin 3) has no pull-up: the I²C bus\'s lines are released high by a pull-up each',
    'warning: OLED1\'s SDA (pin 4) has no pull-up: the I²C bus\'s lines are released high by a pull-up each']);
  assert.deepEqual(lines(bench({ power: false })).slice(0, 1), ['warning: OLED1 (Graphic OLED 128×64 (SSD1306, I²C)) is not powered: its VCC (pin 2) is not on the supply\'s + and its GND (pin 1) is not on the supply\'s −']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'OLED1', type: 'oled-ssd1306', x: 0, y: 0 }] })), ['warning: OLED1 (Graphic OLED 128×64 (SSD1306, I²C)) joins nothing']);
  assert.deepEqual([PARTS['oled-ssd1306'].kind, PARTS['oled-ssd1306'].pins.map((p) => `${p.name} ${p.dir}`)], ['oled', ['GND gnd', 'VCC vcc', 'SCL in', 'SDA oc']]);
  assert.match(partInfo('oled-ssd1306').about, /^128 × 64 pixels, its SSD1306 controller simulated on I²C at 0x3C/);
  assert.deepEqual(partCorners({ type: 'oled-ssd1306', x: 0, y: 0 }), [[-3.5, 0], [6.5, 0], [-3.5, 11], [6.5, 11]]);
});

// the circuit's HDL simulated with a test bench pressing the buttons as the waveform says: the lines it reports
function hdlLines(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb;', '  reg S1, S2;', '  oled dut (.S1(S1), .S2(S2));', '  initial begin', '    S1 = 0; S2 = 0; #100;'];
  for (const st of waveform(TRANSFERS)) L.push(`    S1 = ${st.c ? 0 : 1}; S2 = ${st.d ? 0 : 1}; #100;`);
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e10 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^OLED1 /.test(x));
}

test('#5336 the OLED in the circuit\'s HDL: compiled with no warnings, its reports the live one\'s, in VHDL and in Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'oled');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    assert.deepEqual(hdlLines(lang), LIVE, lang);
  }
});

test('#5336 an Arduino\'s TWI writing to the OLED through a System\'s circuit node: its ACKs, its pixels, its report line, no warnings', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  const { analyzeSystem } = await import('../core/system-check.js');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  // the OLED beside the Uno: SCL to A5, SDA to A4, VCC to 5V, GND to GND; a pull-up on each line
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'OLED1', type: 'oled-ssd1306', x: 30, y: 25 },
    { id: 'R1', type: 'pull-up', x: 36, y: 22 }, { id: 'R2', type: 'pull-up', x: 38, y: 22 }],
  wires: [{ id: 'c', points: [uno('A5'), [32, 25]] }, { id: 'd', points: [uno('A4'), [33, 25]] }, { id: 'v', points: [uno('5V'), [31, 25]] }, { id: 'g', points: [uno('GND'), [30, 25]] },
    { id: 'wr1', points: [[36, 22], [32, 25]] }, { id: 'wr2', points: [[38, 22], [33, 25]] }] });
  // the TWI at 100 kHz (examples/i2c-avr's): a START, the address 0x3C, the bytes, a STOP; each written and TWINT waited for
  const send = (bytes) => ['ldi r16, 0xa4', 'rcall go', ...bytes.flatMap((b) => [`ldi r16, ${b}`, 'sts 0xbb, r16', 'ldi r16, 0x84', 'rcall go']), 'ldi r16, 0x94', 'sts 0xbc, r16', 'rcall pause'];
  const prog = ['ldi r16, 72', 'sts 0xb8, r16', ...send(INIT), ...send([0x78, 0x40, 0xff, 0x81, 0x3c]), 'end:', 'rjmp end',
    'go:', 'sts 0xbc, r16', 'wait:', 'lds r18, 0xbc', 'sbrs r18, 7', 'rjmp wait', 'ret', 'pause:', 'ldi r22, 250', 'p1:', 'dec r22', 'brne p1', 'ret'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/oled.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  assert.deepEqual(analyzeSystem(sys, { modules: {}, files: ['fw/oled.hex', 'src/bench.circ.json'], circuits: { 'src/bench.circ.json': circ } }).diags, [], 'checked: no warnings');
  assert.deepEqual(checkCircuit(circ).map((x) => x.message), []);
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(5e9);
  const o = r.sim.nodes.get('bench').oleds().OLED1, rep = systemReport(r);
  assert.deepEqual([o.on, o.lit, o.pages], [true, 14, [14, 0, 0, 0, 0, 0, 0, 0]]);
  assert.deepEqual([0, 1, 2, 7].map((y) => o.rows[y].slice(0, 3)), ['110', '100', '101', '110']);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: OLED1')), 'circuit bench: OLED1 on, 14 pixel(s) lit');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

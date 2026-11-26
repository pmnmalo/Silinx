// The boards as a circuit's parts (#5215, core/circuit-boards.js): the Arduino Uno and Nano and the FPGA boards, their
// pins against the boards' own descriptions (the System's MCU_BOARDS, core/boards.js's Pmod connectors), a Nano on a
// breadboard, a board powering the breadboard (Try it, the check, the HDL in VHDL and in Verilog, compiled, elaborated and
// simulated with no warnings), its other pins driving nothing; the library, the part's details, its id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_ORDER, partDef, partPins, partsList, partCorners } from '../core/circuit-parts.js';
import { BOARD_PARTS, BOARD_ART, PMOD_W } from '../core/circuit-boards.js';
import { MCU_BOARDS } from '../core/system-doc.js';
import { BOARDS } from '../core/boards.js';
import { normalizeCircuit, newCircuit, newId } from '../core/circuit.js';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { addPart } from '../core/circuit-edit.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';
import { designChecks } from '../core/lint.js';

// (the development build's channel: the boards are the Systems', #5202; a release's set where it is tested)
setBuildChannel('dev');

const pinOf = (type, name) => PARTS[type].pins.find((p) => p.name === name);
const lines = (ds) => ds.map((d) => `${d.severity}: ${d.message}`);

test('#5215 the Arduinos\' pins are their boards\' (the System\'s): every digital and analog pin, its level, SDA and SCL', () => {
  // (the Arduinos': the Explorer 16/32's part is #5484's next part)
  for (const b of MCU_BOARDS.filter((x) => x.arch === 'avr')) {
    const d = PARTS[b.id];
    assert.equal(d.kind, 'board');
    assert.equal(d.board, b.id);
    const io = d.pins.filter((p) => p.dir === 'board' && !['SCL', 'SDA'].includes(p.name));
    assert.deepEqual(io.map((p) => p.name).sort(), [...b.pins].sort(), `${b.id}: its board's pins, each once`);
    for (const p of io) assert.equal(p.volts, b.vio, `${b.id} ${p.name}: at the board's ${b.vio} V`);
    assert.deepEqual(io.filter((p) => p.inputOnly).map((p) => p.name), b.inputOnly ?? [], `${b.id}: its inputs only`);
    // its supply's terminals: 5V, 3V3, GND
    assert.deepEqual([...new Set(d.pins.filter((p) => p.supply).map((p) => `${p.name} ${p.dir}`))].sort(), ['3V3 vcc', '5V vcc', 'GND gnd']);
    // its numbers 1…n, no two pins on one point
    assert.deepEqual(d.pins.map((p) => p.n), d.pins.map((_, i) => i + 1));
    assert.equal(new Set(d.pins.map((p) => `${p.dx},${p.dy}`)).size, d.pins.length);
  }
  // the Uno's SDA and SCL are its Wire's A4 and A5, joined inside it
  const uno = PARTS['arduino-uno'], wire = MCU_BOARDS[0].i2cs.Wire;
  for (const [s, a] of [['SDA', wire.sda], ['SCL', wire.scl]]) assert.ok(uno.bridges.some((x) => x.includes(pinOf('arduino-uno', s).n) && x.includes(pinOf('arduino-uno', a).n)), `${s} joined to ${a}`);
  // (its headers 1.9 inch apart; a Nano a DIP-30 0.6 inch wide: pin 1 D1 across from pin 30 VIN)
  assert.deepEqual([...new Set(uno.pins.map((p) => p.dy))], [0, 19]);
  assert.deepEqual([pinOf('arduino-nano', 'D1'), PARTS['arduino-nano'].pins[29]].map((p) => [p.n, p.name, p.dx, p.dy]), [[1, 'D1', 0, 0], [30, 'VIN', 0, -6]]);
});

test('#5215 the FPGA boards\' Pmod pins are their package pins in the board\'s description, at 3.3 V', () => {
  for (const d of BOARD_PARTS.filter((x) => x.type.startsWith('fpga-'))) {
    const b = BOARDS.find((x) => x.id === d.board);
    const io = d.pins.filter((p) => p.dir === 'board');
    for (const p of io) assert.equal(p.volts, 3.3, `${d.type} ${p.name}`);
    assert.equal(new Set(io.map((p) => p.loc)).size, io.length, `${d.type}: each package pin once`);
    const conns = [...new Set(io.map((p) => p.name.slice(0, 2).toLowerCase()))];
    assert.deepEqual(conns, b.resources.filter((r) => r.group === 'Pmod').map((r) => r.name), `${d.type}: every Pmod of the board`);
    for (const id of conns) {
      const res = b.resources.find((r) => r.name === id), J = id.toUpperCase();
      const mine = io.filter((p) => p.name.startsWith(J)).map((p) => p.loc);
      if (d.board === 'basys2' && id === 'ja') {
        // (the Basys2's JA1 and JA4 its JA resource's, JA2 and JA3 its UART's: tx and rx, a PmodUSBUART's)
        const one = (name) => b.resources.find((r) => r.name === name).pins[0];
        assert.deepEqual(mine, [res.pins[0], one('tx'), one('rx'), res.pins[1]]);
        assert.match(b.resources.find((r) => r.name === 'tx').label, /JA2/);
        assert.match(b.resources.find((r) => r.name === 'rx').label, /JA3/);
      } else assert.deepEqual(mine, res.pins, `${d.type} ${J}: its resource's pins, in order`);
    }
  }
  // a 12-pin Pmod's names (the Nexys2's): 1–4 and 7–10, GND and 3V3 in each row
  assert.deepEqual(PARTS['fpga-nexys2'].pins.slice(0, 12).map((p) => p.name), ['JA1', 'JA2', 'JA3', 'JA4', 'GND', '3V3', 'JA7', 'JA8', 'JA9', 'JA10', 'GND', '3V3']);
  assert.deepEqual(PARTS['fpga-basys2'].pins.slice(0, 6).map((p) => p.name), ['JA1', 'JA2', 'JA3', 'JA4', 'GND', '3V3']);
});

test('#5366 the boards\' bodies are their drawings\' (the emulators\'): their size from their pin 1 at their pitch; the Pmods 0.9 inch apart, the Uno\'s A5 under its D0', () => {
  for (const d of BOARD_PARTS) {
    const a = BOARD_ART[d.board], [x, y] = a.pin1;
    // (the drawing's corners on the grid, its pin 1 the part's place; every pin on it)
    assert.deepEqual(d.size, { x0: Math.round(-x / a.pitch * 100) / 100, y0: Math.round(-y / a.pitch * 100) / 100, x1: Math.round((a.w - x) / a.pitch * 100) / 100, y1: Math.round((a.h - y) / a.pitch * 100) / 100 }, d.type);
    for (const p of d.pins) assert.ok(p.dx > d.size.x0 && p.dx < d.size.x1 && p.dy > d.size.y0 && p.dy < d.size.y1, `${d.type} ${p.name}: on the board`);
    assert.deepEqual(partCorners({ type: d.type, x: 10, y: 20 })[0], [10 + d.size.x0, 20 + d.size.y0]);
  }
  // (the Board Emulator's Pmods: JA1, JB1… 0.9 inch apart, a 12-pin one's two rows 0.1 inch apart)
  assert.equal(PMOD_W, 9);
  const first = (t) => PARTS[t].pins.filter((p) => /^J[A-D](1|7)$/.test(p.name)).map((p) => [p.name, p.dx, p.dy]);
  assert.deepEqual(first('fpga-basys2'), [['JA1', 0, 0], ['JB1', 9, 0], ['JC1', 18, 0], ['JD1', 27, 0]]);
  assert.deepEqual(first('fpga-nexys2'), [['JA1', 0, 0], ['JA7', 0, 1], ['JB1', 9, 0], ['JB7', 9, 1], ['JC1', 18, 0], ['JC7', 18, 1]]);
  // (an Uno's real headers: D0 over A5, VIN 0.2 inch left of A0, IOREF 0.5 inch right of SCL; a Nano's D1 its pin 1)
  const at = (t, n) => { const p = PARTS[t].pins.find((q) => q.name === n); return [p.dx, p.dy]; };
  assert.deepEqual(['SCL', 'D8', 'D7', 'D0', 'IOREF', 'VIN', 'A0', 'A5'].map((n) => at('arduino-uno', n)), [[0, 0], [9, 0], [11, 0], [18, 0], [5, 19], [11, 19], [13, 19], [18, 19]]);
  assert.deepEqual([BOARD_ART['arduino-uno'].w / BOARD_ART['arduino-uno'].pitch, BOARD_ART['arduino-uno'].h / BOARD_ART['arduino-uno'].pitch], [27, 21], 'an Uno: 2.7 x 2.1 inch');
});

test('#5495 the ESP32 DevKitC\'s pins: its board\'s GPIOs (the System\'s), each once, at 3.3 V, 34 to 39 inputs only; J2 and J3 1 inch apart; the flash\'s and EN not connected; its supplies joined', () => {
  const b = MCU_BOARDS.find((x) => x.id === 'esp32-devkitc'), d = PARTS['esp32-devkitc'];
  assert.deepEqual([d.kind, d.board, d.title, d.prefix, d.vio, d.pins.length], ['board', 'esp32-devkitc', 'ESP32 DevKitC', 'E', 3.3, 38]);
  const io = d.pins.filter((p) => p.dir === 'board');
  assert.deepEqual(io.map((p) => p.name).sort(), [...b.pins].sort(), 'its board\'s pins, each once');
  for (const p of io) assert.equal(p.volts, 3.3, p.name);
  assert.deepEqual(io.filter((p) => p.inputOnly).map((p) => p.name), ['GPIO36', 'GPIO39', 'GPIO34', 'GPIO35']);
  assert.deepEqual(d.pins.filter((p) => p.dir === 'nc').map((p) => p.name), ['EN', 'SD2', 'SD3', 'CMD', 'SD1', 'SD0', 'CLK']);
  // (J2 from its 3V3 at the antenna's end along dy 0, J3 from its GND 10 pitches above; its 3V3, 5V and GND supplies, its
  // three GND joined)
  assert.deepEqual([1, 19, 20, 38].map((n) => { const p = d.pins[n - 1]; return [p.n, p.name, p.dx, p.dy]; }), [[1, '3V3', 0, 0], [19, '5V', 18, 0], [20, 'GND', 0, -10], [38, 'CLK', 18, -10]]);
  assert.deepEqual(d.pins.filter((p) => p.supply).map((p) => `${p.name} ${p.dir}`), ['3V3 vcc', 'GND gnd', '5V vcc', 'GND gnd', 'GND gnd']);
  assert.deepEqual(d.bridges, [[14, 20], [14, 26]]);
  // (its body: the drawing's 514 × 264 pixels at 24 a pitch, its pin 1 41 pixels from its left edge, 12 from its bottom)
  assert.deepEqual([BOARD_ART['esp32-devkitc'], d.size], [{ w: 514, h: 264, pitch: 24, pin1: [41, 252] }, { x0: -1.71, y0: -10.5, x1: 19.71, y1: 0.5 }]);
  assert.equal(partInfo('esp32-devkitc').pins.find((p) => p.name === 'GPIO34').role, "the board's pin");
});

test('#5215 the boards in the library: after the parts, before the ICs; their details, their ids; not exported to KiCad', () => {
  assert.deepEqual(PART_ORDER.filter((t) => PARTS[t].kind === 'board'), ['arduino-uno', 'arduino-nano', 'esp32-devkitc', 'fpga-basys2', 'fpga-nexys2']);
  assert.ok(PART_ORDER.indexOf('arduino-uno') > PART_ORDER.indexOf('probe') && PART_ORDER.indexOf('fpga-nexys2') < PART_ORDER.indexOf('7400'));
  const listed = partsList().find((x) => x.type === 'fpga-basys2');
  assert.deepEqual([listed.title, listed.kind, listed.board, listed.pins[0]], ['Digilent Basys2', 'board', 'basys2', { n: 1, name: 'JA1', dir: 'board', dx: 0, dy: 0, loc: 'B2', volts: 3.3 }]);
  const info = partInfo('arduino-nano');
  assert.match(info.about, /^A DIP-30 that straddles a breadboard's channel/);
  assert.deepEqual(info.pins.slice(0, 4), [{ n: 1, name: 'D1', role: "the board's pin" }, { n: 2, name: 'D0', role: "the board's pin" }, { n: 3, name: 'RST', role: 'not connected' }, { n: 4, name: 'GND', role: 'supply GND' }]);
  assert.deepEqual(partInfo('arduino-nano').pins.find((p) => p.name === '3V3').role, 'supply 3.3 V');
  assert.deepEqual(partInfo('fpga-nexys2').pins[0], { n: 1, name: 'JA1', role: "the board's pin", loc: 'L15' });
  const m = normalizeCircuit({ parts: [{ id: 'A1', type: 'arduino-uno' }] });
  assert.deepEqual([newId(m, 'arduino-nano'), newId(m, 'fpga-basys2')], ['A2', 'F1']);
  assert.ok(EXPORTED_PARTS.every((t) => PARTS[t].kind !== 'board'));
});

// a half breadboard (its supply taken away) with a Nano across its channel, pin 1 in g1: its 5V on the top + rail, its
// GND on the − rail, an LED from + to −, another from D2 to −, a 7400's gate from the rails' levels
function nanoBoard() {
  const base = newCircuit('nanoled');
  const nano = { id: 'A1', type: 'arduino-nano', x: 0, y: 8 };
  const at = (name) => { const q = partPins(nano).find((p) => p.name === name); return [q.x, q.y]; };
  // (the LEDs on row a: D1 from the + rail to the − rail, D2's anode on D2's column)
  return normalizeCircuit({ ...base, parts: [...base.parts.filter((p) => p.type !== 'supply'), nano, { id: 'D1', type: 'led', x: 20, y: 0 }, { id: 'D2', type: 'led', x: 25, y: 0 }],
    wires: [...base.wires.filter((w) => !['w1', 'w2'].includes(w.id)),
      { id: 'p1', points: [at('5V'), [at('5V')[0], -4]], color: 'red' }, { id: 'p2', points: [[3, 9], [3, -3]], color: 'black' },
      { id: 'l1', points: [[20, -4], [20, 0]], color: 'red' }, { id: 'l2', points: [[21, 0], [21, -3]], color: 'black' },
      { id: 'l3', points: [[at('D2')[0], 11], [25, 1]], color: 'green' }, { id: 'l4', points: [[26, 0], [26, -3]], color: 'black' }] });
}

test('#5215 a Nano on a breadboard powers it: its 5V and GND drive the rails, an LED lit; its D2 drives nothing', () => {
  const m = nanoBoard();
  const nets = circuitNets(m);
  // (every pin of the Nano in a hole: rows g and c)
  const holes = new Set(nets.nets.flatMap((n) => n.holes.map((h) => h.name)));
  for (const q of partPins(m.parts.find((p) => p.id === 'A1'))) assert.ok([...nets.at.get(`${q.x},${q.y}`).holes].length === 1, `${q.name} in a hole`);
  assert.ok(holes.has('g1') && holes.has('c1'));
  assert.deepEqual(lines(checkCircuit(m)), [], 'no errors, no warnings');
  const sim = createCircuitSim(m);
  sim.run();
  assert.deepEqual(sim.leds(), { D1: 'on', D2: 'off' });
  assert.equal(sim.pin('A1', 27), '1', '5V');
  assert.equal(sim.pin('A1', 4), '0', 'GND');
  assert.equal(sim.pin('A1', 29), '0', 'its other GND, joined inside it');
  assert.equal(sim.pin('A1', pinOf('arduino-nano', 'D2').n), 'Z', 'D2: its program is a System\'s');
  assert.equal(sim.pin('A1', pinOf('arduino-nano', '3V3').n), '1', '3V3');
  assert.deepEqual(sim.shorts(), []);
});

test('#5215 a board\'s supply in the HDL: in VHDL and in Verilog, compiled, elaborated and simulated with no warnings', () => {
  const m = nanoBoard();
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(m, lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    assert.match(g.code, lang === 'vhdl' ? /n\d+ <= '1';   -- A1 5V/ : /assign n\d+ = 1'b1;   \/\/ A1 5V/);
    assert.match(g.code, lang === 'vhdl' ? /n\d+ <= '0';   -- A1 GND/ : /assign n\d+ = 1'b0;   \/\/ A1 GND/);
    const lib = compile([{ path, text: g.code }]);
    const d = elaborate(lib, 'nanoled');
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], `${lang}: no warnings`);
    const tb = ['`timescale 1ns / 1ps', 'module tb;', '  wire D1, D2;', '  nanoled dut (.D1(D1), .D2(D2));', '  initial begin', '    #100 $display("%b%b", D1, D2);', '    $finish;', '  end', 'endmodule'].join('\n');
    const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e9 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), ['10'], `${lang}: D1 lit, D2 not`);
  }
});

test('#5215 a board alone, joined to nothing: said; a board\'s 3V3 and the supply\'s − joined: a short', () => {
  const m = normalizeCircuit({ name: 'c', parts: [{ id: 'F1', type: 'fpga-basys2', x: 0, y: 0 }] });
  assert.deepEqual(lines(checkCircuit(m)), ['warning: F1 (Digilent Basys2) joins nothing']);
  const v = pinOf('fpga-basys2', '3V3'), g = pinOf('fpga-basys2', 'GND');
  const s = normalizeCircuit({ ...m, wires: [{ id: 'w1', points: [[v.dx, v.dy], [v.dx, 3], [g.dx, 3], [g.dx, g.dy]] }] });
  assert.deepEqual(lines(checkCircuit(s)), ["error: Short circuit: the supply's + and − are joined (F1 pin 5 (GND), F1 pin 6 (3V3), F1 pin 11 (GND), F1 pin 12 (3V3), …)"]);
  assert.equal(partDef('fpga-basys2').pins.filter((p) => p.supply && p.dir === 'vcc').length, 4);
});

test('#5215 #5202 the boards are the Systems\': in a release not listed nor added; in the development build added (A1)', () => {
  const m = newCircuit('c');
  setBuildChannel('release');
  try {
    assert.equal(partsList().some((x) => x.kind === 'board'), false);
    assert.deepEqual(addPart(m, { type: 'arduino-uno', at: [0, 30] }), { error: `arduino-uno: ${SYSTEMS_OFF}` });
  } finally { setBuildChannel('dev'); }
  assert.equal(partsList().filter((x) => x.kind === 'board').length, 5);
  const r = addPart(m, { type: 'arduino-uno', at: [0, 30] });
  assert.deepEqual([r.id, r.model.parts.at(-1)], ['A1', { id: 'A1', type: 'arduino-uno', x: 0, y: 30 }]);
});

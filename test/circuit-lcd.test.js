// The character LCD 16×2 (#5330, core/circuit-lcd.js): its controller against the HD44780U's datasheet, in a circuit (its
// pins driven by logic switches: RS, E, D0..D7, RW tied to GND), each write on E's falling edge: at power-on the display
// off; 8-bit mode (function set, display on, clear, entry mode, characters, set DDRAM address: line 2 at 0x40), 4-bit
// mode (the init by instruction as LiquidCrystal does it, each byte two nibbles), the cursor and display shifts, the entry
// mode's shift and decrement, return home, the CGRAM's writes kept off the screen, the A00 ROM's characters; powered off:
// reset; its checks (powered, RW low, joined to nothing); the library's part, its details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createLcd, lcdChar, LCD_1602 } from '../core/circuit-lcd.js';
import { PARTS, partsList, partCorners } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const pinX = (name) => LCD_1602.pins.find((p) => p.name === name).dx;
// the LCD at (0, 0); the supply's + to VDD, its − to VSS and RW; a logic switch over RS, E and each data pin (unless `only`)
function bench({ only = null, rw = true, power = true } = {}) {
  const lines = ['RS', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].filter((n) => !only || only.includes(n));
  return normalizeCircuit({ name: 'lcd', parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'LCD1', type: 'lcd-1602', x: 0, y: 0 },
    ...lines.map((n) => ({ id: `S${n}`, type: 'logic-switch', x: pinX(n), y: -5 }))],
  wires: [...(power ? [{ id: 'v', points: [[-4, -10], [pinX('VDD'), 0]] }, { id: 'g', points: [[-4, -9], [pinX('VSS'), 0]] }] : []), ...(rw ? [{ id: 'rw', points: [[-4, -9], [pinX('RW'), 0]] }] : []),
    ...lines.map((n) => ({ id: `w${n}`, points: [[pinX(n), -5], [pinX(n), 0]] }))] });
}
// a write: RS, the bus (D7..D0), E high then low
function driver(m) {
  const sim = createCircuitSim(m);
  sim.run();
  const has = new Set(m.parts.map((p) => p.id));
  const set = (id, v) => { if (has.has(id)) { sim.set(id, v); sim.run(); } };
  return {
    sim,
    write(rs, bus) { set('SRS', !!rs); for (let k = 0; k < 8; k++) set(`SD${k}`, !!((bus >> k) & 1)); set('SE', true); set('SE', false); },
    // 4-bit: the high nibble, then the low one, on D7..D4
    write4(rs, b) { this.write(rs, b & 0xf0); this.write(rs, (b << 4) & 0xf0); },
    lcd: () => sim.lcds().LCD1,
  };
}

test('#5330 8-bit mode: off at power-on; function set, display on, clear, entry mode; characters; line 2 at 0x40', () => {
  const d = driver(bench());
  assert.deepEqual(d.lcd(), { on: false, lines: ['', ''], cursor: null, blink: false });
  for (const b of [0x38, 0x0c, 0x01, 0x06]) d.write(0, b);
  for (const c of 'Hello') d.write(1, c.charCodeAt(0));
  d.write(0, 0xc0);   // (DDRAM 0x40: line 2)
  for (const c of 'Silinx!') d.write(1, c.charCodeAt(0));
  assert.deepEqual(d.lcd(), { on: true, lines: ['Hello           ', 'Silinx!         '], cursor: null, blink: false });
  // the cursor shown and blinking: after the last character
  d.write(0, 0x0f);
  assert.deepEqual([d.lcd().cursor, d.lcd().blink], [{ row: 1, col: 7 }, true]);
  // return home; a cursor shift right; the display shifted left twice
  d.write(0, 0x02); d.write(0, 0x14);
  assert.deepEqual(d.lcd().cursor, { row: 0, col: 1 });
  d.write(0, 0x18); d.write(0, 0x18);
  assert.deepEqual(d.lcd().lines, ['llo             ', 'linx!           ']);
  // display off: blank, its DDRAM kept
  d.write(0, 0x08);
  assert.deepEqual(d.lcd().lines, ['', '']);
  d.write(0, 0x0c);
  assert.equal(d.lcd().lines[0], 'llo             ');
});

test('#5330 4-bit mode as LiquidCrystal starts it (0x3, 0x3, 0x3, 0x2 on D7..D4, then each byte two nibbles); D3..D0 left open', () => {
  const d = driver(bench({ only: ['RS', 'E', 'D4', 'D5', 'D6', 'D7'] }));
  for (const n of [0x30, 0x30, 0x30, 0x20]) d.write(0, n);
  for (const b of [0x28, 0x0c, 0x01, 0x06]) d.write4(0, b);
  for (const c of 'ab~\\') d.write4(1, c.charCodeAt(0));
  assert.deepEqual(d.lcd().lines, ['ab→¥            ', '                ']);
});

test('#5330 the entry mode\'s decrement and shift; the CGRAM\'s writes off the screen; one line (N 0); powered off: reset', () => {
  const l = createLcd();
  const cmd = (b) => l.write(false, b), put = (s) => { for (const c of s) l.write(true, c.charCodeAt(0)); };
  cmd(0x38); cmd(0x0c); cmd(0x01);
  cmd(0x87); cmd(0x04); put('cba');   // (backwards from column 7)
  assert.equal(l.state().lines[0], '     abc        ');
  cmd(0x40); put('\x1f\x11'); cmd(0x80);   // (a custom character's rows, then back to the DDRAM)
  assert.equal(l.state().lines[0], '     abc        ');
  cmd(0x06 | 0x01); cmd(0x80); put('XY');   // (incrementing, the display shifting with each one)
  assert.equal(l.state().lines[0], '   abc          ', 'X and Y shifted out of sight');
  cmd(0x30); cmd(0x01); cmd(0x06); put('one line');   // (clear keeps the entry mode's shift: off again)
  assert.deepEqual(l.state().lines, ['one line        ', '']);
  l.reset();
  assert.deepEqual(l.state(), { on: false, lines: ['', ''], cursor: null, blink: false });
  assert.deepEqual([0x00, 0x41, 0x5c, 0x7e, 0x7f, 0xa5].map(lcdChar), ['▯', 'A', '¥', '→', '←', '▒']);
  // in a circuit: its supply taken away, its controller reset
  const m = bench();
  const d = driver(m);
  for (const b of [0x38, 0x0c]) d.write(0, b);
  d.write(1, 0x41);
  assert.equal(d.lcd().lines[0][0], 'A');
  const unpowered = driver(bench({ power: false }));
  for (const b of [0x38, 0x0c]) unpowered.write(0, b);
  assert.deepEqual(unpowered.lcd().lines, ['', '']);
});

test('#5330 the LCD\'s checks: powered, RW low, joined to nothing; its HDL compiles with no warnings; the library\'s part', () => {
  const lines = (m) => checkCircuit(m).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })), ['warning: LCD1 (Character LCD 16×2 (HD44780)) is not powered: its VDD (pin 2) is not on the supply\'s + and its VSS (pin 1) is not on the supply\'s −']);
  assert.deepEqual(lines(bench({ rw: false })), ['warning: LCD1\'s RW (pin 5) is not on GND: its reads are not simulated (tie it low, as LiquidCrystal\'s wiring does)']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'LCD1', type: 'lcd-1602', x: 0, y: 0 }] })), ['warning: LCD1 (Character LCD 16×2 (HD44780)) joins nothing']);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'lcd');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
  }
  assert.equal(PARTS['lcd-1602'].kind, 'lcd');
  // (its body's corners, turned with it: the editor's Fit; a board's too; another part none)
  assert.deepEqual(partCorners({ type: 'lcd-1602', x: 10, y: 5 }), [[8.5, 5], [40, 5], [8.5, 19], [40, 19]]);
  assert.deepEqual(partCorners({ type: 'lcd-1602', x: 0, y: 0, rot: 1 }), [[0, -1.5], [0, 30], [-14, -1.5], [-14, 30]]);
  assert.equal(partCorners({ type: 'arduino-uno', x: 0, y: 0 }).length, 4);
  assert.deepEqual(partCorners({ type: 'led', x: 0, y: 0 }), []);
  assert.deepEqual(partsList().find((x) => x.type === 'lcd-1602').pins.map((p) => p.name), ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K']);
  const info = partInfo('lcd-1602');
  assert.match(info.about, /^Two lines of 16 characters/);
  assert.deepEqual(info.pins.slice(0, 6).map((p) => `${p.name} ${p.role}`), ['VSS supply GND', 'VDD supply +5 V', 'V0 not connected', 'RS input', 'RW input', 'E input']);
});

// the circuit's HDL simulated with a test bench writing as the driver does: each line it reports
function hdlLines(lang, writes) {
  const m = bench(), g = generateCircuit(m, lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const ins = ['SRS', 'SE', ...Array.from({ length: 8 }, (_, k) => `SD${k}`)];
  const L = ['`timescale 1ns / 1ps', 'module tb;', `  reg ${ins.join(', ')};`, `  lcd dut (${ins.map((n) => `.${n}(${n})`).join(', ')});`, '  initial begin', `    ${ins.map((n) => `${n} = 0;`).join(' ')} #100;`];
  for (const [rs, b] of writes) L.push(`    SRS = ${rs}; ${Array.from({ length: 8 }, (_, k) => `SD${k} = ${(b >> k) & 1};`).join(' ')} #100 SE = 1; #100 SE = 0; #100;`);
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, [], lang);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^LCD1 /.test(s));
}

test('#5330 the LCD in the circuit\'s HDL: in VHDL and in Verilog, its lines reported as the live simulation shows them', () => {
  const writes = [[0, 0x38], [0, 0x0c], [0, 0x01], [0, 0x06], ...[...'Hello'].map((c) => [1, c.charCodeAt(0)]), [0, 0xc0], ...[...'Silinx!'].map((c) => [1, c.charCodeAt(0)]),
    [0, 0x18], [0, 0x08], [0, 0x0c], [0, 0x02], [0, 0x30], [0, 0x01], [0, 0x06], ...[...'one'].map((c) => [1, c.charCodeAt(0)])];
  // the live one: its lines after each write, when they change
  const d = driver(bench()), live = [];
  const said = () => { const s = d.lcd(); return s.on ? `LCD1 |${s.lines[0]}|${(s.lines[1] || '').padEnd(16)}|` : 'LCD1 off'; };
  let last = null;
  for (const [rs, b] of writes) { d.write(rs, b); const x = said(); if (x !== last && !(last == null && x === 'LCD1 off')) live.push(x); last = x; }
  assert.deepEqual(live.slice(0, 2), ['LCD1 |                |                |', 'LCD1 |H               |                |']);
  assert.equal(live.at(-1), 'LCD1 |one             |                |');
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(hdlLines(lang, writes), live, lang);
});

test('#5330 an Arduino writing to the LCD through a System\'s circuit node: 8-bit mode, D0..D7 its data, D8 RS, D9 E; its lines in the run\'s report', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  const { analyzeSystem } = await import('../core/system-check.js');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  // the LCD over the Uno: its D0..D7 to the Uno's, RS to D8, E to D9, VDD to 5V, VSS and RW to GND
  const lcdAt = (name) => [pinX(name), -10];
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'LCD1', type: 'lcd-1602', x: 0, y: -10 }],
    wires: [...Array.from({ length: 8 }, (_, k) => ({ id: `d${k}`, points: [uno(`D${k}`), lcdAt(`D${k}`)] })), { id: 'rs', points: [uno('D8'), lcdAt('RS')] }, { id: 'e', points: [uno('D9'), lcdAt('E')] },
      { id: 'v', points: [uno('5V'), lcdAt('VDD')] }, { id: 'g', points: [uno('GND'), lcdAt('VSS')] }, { id: 'rw', points: [uno('GND'), lcdAt('RW')] }] });
  // each byte: RS on PORTB's bit 0, the byte on PORTD, E (PORTB's bit 1) high then low
  const put = (rs, b) => [`ldi r17, ${rs}`, 'out 0x05, r17', `ldi r16, ${b}`, 'out 0x0b, r16', `ldi r17, ${rs | 2}`, 'out 0x05, r17', `ldi r17, ${rs}`, 'out 0x05, r17'];
  const prog = ['ldi r16, 0xff', 'out 0x0a, r16', 'ldi r16, 0x03', 'out 0x04, r16', ...[0x38, 0x0c, 0x01, 0x06].flatMap((b) => put(0, b)), ...put(1, 0x48), ...put(1, 0x69), 'loop:', 'rjmp loop'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/lcd.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  assert.deepEqual(analyzeSystem(sys, { modules: {}, files: ['fw/lcd.hex', 'src/bench.circ.json'], circuits: { 'src/bench.circ.json': circ } }).diags, [], 'checked: no warnings');
  assert.deepEqual(checkCircuit(circ).map((x) => x.message), []);
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(1e9);
  const rep = systemReport(r);
  assert.deepEqual(r.sim.nodes.get('bench').lcds().LCD1.lines, ['Hi              ', '                ']);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: LCD1')), 'circuit bench: LCD1 |Hi              ||                |');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

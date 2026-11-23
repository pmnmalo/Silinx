// A register map (#5288, core/regmap.js): its format read and written, its check (each error, a map with no registers);
// its FPGA side (core/regmap-hdl.js) in VHDL and in Verilog, for SPI and for I²C, compiled and elaborated with no
// warnings (the lint's too), simulated against a test bench that is the master (a write, a strobe, a 3-bit register, a
// read of three bytes across two registers), and run with an Arduino Uno in the co-simulation (its SPI and its TWI, the
// compiled engine); its program side (core/regmap-c.js), the header's text; its decoder (core/regmap-decode.js), the
// co-simulation's transfers as register accesses, a partial one, an address with no register.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegmap, readRegmap, writeRegmap, checkRegmap, newRegmap, isRegmapFile } from '../core/regmap.js';
import { generateRegmap } from '../core/regmap-hdl.js';
import { regmapHeader } from '../core/regmap-c.js';
import { regAccesses, accessText } from '../core/regmap-decode.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { normalizeSystem } from '../core/system-doc.js';
import { systemPlan } from '../core/system-build.js';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { designOf } from './compiled-diff.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { avrAssemble, intelHex } from './avr-asm.mjs';

await loadAvr8js();
// duty (rw, reset 5), count (ro, 12 bits: two bytes), go (wo, 1 bit, its strobe), mode (rw, 3 bits)
const MAP = (bus) => normalizeRegmap({ name: 'pwm_regs', bus, registers: [
  { name: 'duty', addr: 0, width: 8, access: 'rw', reset: 5 }, { name: 'count', addr: 1, width: 12, access: 'ro' },
  { name: 'go', addr: 3, width: 1, access: 'wo', strobe: true }, { name: 'mode', addr: 4, width: 3, access: 'rw' }] });
const file = (lang) => (lang === 'vhdl' ? 'pwm_regs.vhd' : 'pwm_regs.v');

test('#5288 a register map read and written: its fields in their order, a new one, not a map', () => {
  const m = MAP('i2c');
  assert.deepEqual(m, { format: 'silinx-regmap', version: 1, name: 'pwm_regs', bus: 'i2c', address: 0x42, registers: [
    { name: 'duty', addr: 0, width: 8, access: 'rw', reset: 5 }, { name: 'count', addr: 1, width: 12, access: 'ro' },
    { name: 'go', addr: 3, width: 1, access: 'wo', reset: 0, strobe: true }, { name: 'mode', addr: 4, width: 3, access: 'rw', reset: 0 }] });
  assert.deepEqual(readRegmap(writeRegmap(m)), { regmap: m });
  assert.ok(writeRegmap(m).endsWith('}\n'));
  assert.deepEqual(newRegmap('r').registers, [{ name: 'ctrl', addr: 0, width: 8, access: 'rw', reset: 0 }]);
  assert.deepEqual(readRegmap('{"format":"silinx-system","version":1}'), { error: 'not a register map (its format is not \'silinx-regmap\')' });
  assert.deepEqual(readRegmap('{"format":"silinx-regmap","version":2}'), { error: 'a register map of version 2: this Silinx reads version 1' });
  assert.match(readRegmap('{').error, /^not a register map: /);
  assert.deepEqual([isRegmapFile('src/pwm.regs.json'), isRegmapFile('pwm.sys.json')], [true, false]);
});

test('#5288 a register map checked: names, the bus and its address, widths, accesses, addresses, resets, overlaps', () => {
  const run = (f) => { const m = MAP('spi'); f(m); return checkRegmap(normalizeRegmap(m)).map((d) => `${d.severity}: ${d.message}`); };
  assert.deepEqual(run(() => {}), []);
  assert.deepEqual(run((m) => { m.registers = []; }), ['warning: the map has no registers']);
  assert.deepEqual(run((m) => { m.name = '2x'; }), ['error: the map\'s name \'2x\' is not a module\'s name: a letter, then letters, digits and single _']);
  assert.deepEqual(run((m) => { m.bus = 'can'; }), ['error: no bus \'can\' (the buses: spi, i2c)']);
  assert.deepEqual(run((m) => { m.bus = 'i2c'; m.address = 0x78; }), ['error: the I²C address \'120\' is not one of 0x08 to 0x77 (7 bits, the reserved ones left out)']);
  assert.deepEqual(run((m) => { m.registers[0].name = 'signal'; }), ['error: signal: not a register\'s name: a letter, then letters, digits and single _']);
  assert.deepEqual(run((m) => { m.registers[1].name = 'DUTY'; }), ['error: two registers are named DUTY']);
  assert.deepEqual(run((m) => { m.registers[0].name = 'miso'; }), ['error: miso: a port of the bus\'s (clk, sck, mosi, miso, ss)']);
  const own = (n) => `error: ${n}: a name the generated module uses itself (sck_s, ss_s, mosi_s, scl_s, sda_s, rx, tx, rbyte, addr, bits, first, rd, b, state, state_t, wnext, reading, pull, acked, rise, fall, i2c_address, s_idle, s_addr, s_ptr, s_wdata, s_ack, s_rdata, s_rack, rtl, and names ending with _q)`;
  assert.deepEqual(run((m) => { m.registers[0].name = 'rx'; }), [own('rx')]);
  assert.deepEqual(run((m) => { m.registers[0].name = 'duty_q'; }), [own('duty_q')]);
  assert.deepEqual(run((m) => { m.registers[0].name = 'pwm_regs'; }), ['error: the map\'s name pwm_regs is a register\'s: the module and its port one name']);
  assert.deepEqual(run((m) => { m.registers[1].name = 'go_wr'; }), ['error: go\'s strobe go_wr and the register go_wr: one port\'s name']);
  assert.deepEqual(run((m) => { m.registers[0].width = 33; }), ['error: duty: its width \'33\' is not 1 to 32 bits']);
  assert.deepEqual(run((m) => { m.registers[0].access = 'r'; }), ['error: duty: its access \'r\' is not rw (written and read back), ro (read only) or wo (written only)']);
  assert.deepEqual(run((m) => { m.registers[1].addr = 127; }), ['error: count: its address \'127\' is not 0 to 126 (its 2 byte(s) at 0 to 127)']);
  assert.deepEqual(run((m) => { m.registers[3].reset = 8; }), ['error: mode: its reset \'8\' does not fit its 3 bit(s)']);
  assert.deepEqual(run((m) => { m.registers[3].addr = 2; }), ['error: mode and count both at address 2']);
});

// the generated module's own check: its errors, the elaboration's and the lint's, nothing else
function hdlChecks(code, lang) {
  const lib = compile([{ path: file(lang), text: code }]);
  const d = elaborate(lib, 'pwm_regs');
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`);
}

test('#5288 the FPGA side generated in VHDL and in Verilog, for SPI and for I²C: compiled and elaborated, no warnings; its header and ports', () => {
  for (const bus of ['spi', 'i2c']) {
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateRegmap(MAP(bus), { lang });
      assert.equal(g.file, file(lang));
      assert.deepEqual(hdlChecks(g.code, lang), [], `${bus} ${lang}`);
      assert.match(g.code, /Generator {3}: Silinx register map \(edit the map, not this file\)\./);
    }
  }
  const v = generateRegmap(MAP('i2c'), { lang: 'vhdl' }).code;
  assert.ok(v.includes('    Port ( clk   : in    STD_LOGIC;\n           scl   : in    STD_LOGIC;\n           sda   : inout STD_LOGIC;\n           duty  : out   STD_LOGIC_VECTOR (7 downto 0);\n'
    + '           count : in    STD_LOGIC_VECTOR (11 downto 0);\n           go    : out   STD_LOGIC;\n           mode  : out   STD_LOGIC_VECTOR (2 downto 0);\n           go_wr : out   STD_LOGIC);'), v);
  assert.ok(v.includes('--   0x01  count  12 bit(s)  ro\n--   0x03  go      1 bit(s)  wo  reset 0, go_wr a pulse when written\n'), v);
  assert.ok(v.includes('    constant I2C_ADDRESS : STD_LOGIC_VECTOR (6 downto 0) := "1000010";   -- 0x42'));
  const g = generateRegmap(MAP('spi'), { lang: 'verilog' }).code;
  assert.ok(g.includes('module pwm_regs (\n    input  wire        clk,\n    input  wire        sck,\n    input  wire        mosi,\n    input  wire        ss,\n    output wire        miso,\n'
    + '    output reg  [7:0]  duty = 8\'d5,\n    input  wire [11:0] count,\n    output reg         go = 1\'d0,\n    output reg  [2:0]  mode = 3\'d0,\n    output reg         go_wr = 1\'b0\n);'), g);
});

// a test bench, the bus's master: duty written 0xA5, mode 6, go 1 (its strobe), then three bytes read from 0 (duty,
// count's two), the registers shown at the end
function bench(bus) {
  const head = ['`timescale 1ns/1ps', 'module tb;', '  reg clk = 0;', '  always #10 clk = ~clk;', '  reg [11:0] count = 12\'h123;', '  wire [7:0] duty; wire [2:0] mode; wire go, go_wr;',
    '  reg [7:0] got; integer i, strobes = 0;', '  always @(posedge clk) if (go_wr) strobes = strobes + 1;'];
  const tail = ['    $display("duty=%h mode=%h go=%b strobes=%0d", duty, mode, go, strobes);', '    $finish;', '  end', 'endmodule', ''];
  if (bus === 'spi') {
    return [...head, '  reg sck = 0, mosi = 0, ss = 1; wire miso;',
      '  pwm_regs uut (.clk(clk), .sck(sck), .mosi(mosi), .ss(ss), .miso(miso), .duty(duty), .count(count), .go(go), .mode(mode), .go_wr(go_wr));',
      '  task xfer(input [7:0] o); begin for (i = 7; i >= 0; i = i - 1) begin mosi = o[i]; #200 sck = 1; got[i] = miso; #200 sck = 0; end end endtask',
      '  task write2(input [7:0] a, input [7:0] v); begin ss = 0; #400; xfer(a); xfer(v); #400 ss = 1; #400; end endtask',
      '  initial begin', '    #500;', '    write2(8\'h00, 8\'ha5);', '    write2(8\'h04, 8\'h06);', '    write2(8\'h03, 8\'h01);',
      '    ss = 0; #400; xfer(8\'h80);', '    xfer(0); $display("read %h", got);', '    xfer(0); $display("read %h", got);', '    xfer(0); $display("read %h", got);', '    #400 ss = 1; #400;', ...tail].join('\n');
  }
  return [...head, '  tri1 sda; reg scl = 1, low = 0, nack; assign sda = low ? 1\'b0 : 1\'bz;',
    '  pwm_regs uut (.clk(clk), .scl(scl), .sda(sda), .duty(duty), .count(count), .go(go), .mode(mode), .go_wr(go_wr));',
    '  task clock; begin #1250 scl = 1; #1250 scl = 0; end endtask',
    '  task start; begin low = 1; #1250 scl = 0; #625; end endtask',
    '  task restart; begin low = 0; #625 scl = 1; #625 low = 1; #1250 scl = 0; #625; end endtask',
    '  task stop; begin low = 1; #1250 scl = 1; #1250 low = 0; #2500; end endtask',
    '  task wbyte(input [7:0] o); begin for (i = 7; i >= 0; i = i - 1) begin low = !o[i]; clock; end low = 0; #1250 scl = 1; nack = sda; #1250 scl = 0; if (nack) $display("NACK"); end endtask',
    '  task rbyte(input last); begin low = 0; for (i = 7; i >= 0; i = i - 1) begin #1250 scl = 1; got[i] = sda; #1250 scl = 0; end low = !last; clock; low = 0; $display("read %h", got); end endtask',
    '  task write2(input [7:0] a, input [7:0] v); begin start; wbyte(8\'h84); wbyte(a); wbyte(v); stop; end endtask',
    '  initial begin', '    #500;', '    write2(8\'h00, 8\'ha5);', '    write2(8\'h04, 8\'h06);', '    write2(8\'h03, 8\'h01);',
    '    start; wbyte(8\'h84); wbyte(8\'h00); restart; wbyte(8\'h85); rbyte(0); rbyte(0); rbyte(1); stop;', '    start; wbyte(8\'h86); stop;   // (not its address: no ACK)', ...tail].join('\n');
}

test('#5288 the FPGA side simulated in VHDL and in Verilog against a master: written, its strobe once, read back (SPI and I²C)', () => {
  for (const bus of ['spi', 'i2c']) {
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateRegmap(MAP(bus), { lang });
      const r = simulate([{ path: g.file, text: g.code }, { path: 'tb.v', text: bench(bus) }], 'tb', { until: 1e12 });
      assert.deepEqual(r.errors, [], `${bus} ${lang}`);
      const log = r.sim.log.map((l) => l.text);
      assert.match(log.pop(), /^simulation finished \(\$finish\) at \d+ [nu]s$/);
      assert.deepEqual(log, ['read a5', 'read 23', 'read 01', ...(bus === 'i2c' ? ['NACK'] : []), 'duty=a5 mode=6 go=1 strobes=1'], `${bus} ${lang}`);
    }
  }
});

// the Uno's programs: SPI (D13, D11 and SS D10 outputs; fosc/128, mode 0) and the TWI (100 kHz): duty written 0xA5,
// then duty and count's low byte read; r19, r20 the bytes read
const SPI_PROG = (() => {
  const x = (b, n) => [`ldi r16, ${b}`, 'out 0x2e, r16', `w${n}:`, 'in r18, 0x2d', 'sbrs r18, 7', `rjmp w${n}`];
  return ['ldi r16, 0x2c', 'out 0x04, r16', 'ldi r16, 0x04', 'out 0x05, r16', 'ldi r16, 0x53', 'out 0x2c, r16',
    'ldi r16, 0', 'out 0x05, r16', ...x(0x00, 1), ...x(0xa5, 2), 'ldi r16, 0x04', 'out 0x05, r16',
    'ldi r16, 0', 'out 0x05, r16', ...x(0x80, 3), ...x(0, 4), 'in r19, 0x2e', ...x(0, 5), 'in r20, 0x2e', 'ldi r16, 0x04', 'out 0x05, r16', 'end:', 'rjmp end'];
})();
const TWI_PROG = (() => {
  const go = (c, n) => [`ldi r16, ${c}`, 'sts 0xbc, r16', `w${n}:`, 'lds r18, 0xbc', 'sbrs r18, 7', `rjmp w${n}`];
  const send = (b, n) => [`ldi r16, ${b}`, 'sts 0xbb, r16', ...go(0x84, n)];
  return ['ldi r16, 72', 'sts 0xb8, r16', ...go(0xa4, 1), ...send(0x84, 2), ...send(0x00, 3), ...send(0xa5, 4), ...go(0xa4, 5), ...send(0x84, 6), ...send(0x00, 7),
    ...go(0xa4, 8), ...send(0x85, 9), ...go(0xc4, 10), 'lds r19, 0xbb', ...go(0x84, 11), 'lds r20, 0xbb', 'ldi r16, 0x94', 'sts 0xbc, r16', 'end:', 'rjmp end'];
})();

test('#5288 the FPGA side run with an Uno, its SPI and its TWI (the compiled engine, VHDL and Verilog): written, read back; the accesses decoded', async () => {
  for (const bus of ['spi', 'i2c']) {
    const m = MAP(bus), PORTS = { pwm_regs: [['clk', 'in', 1], ...(bus === 'spi' ? [['sck', 'in', 1], ['mosi', 'in', 1], ['ss', 'in', 1], ['miso', 'out', 1]] : [['scl', 'in', 1], ['sda', 'inout', 1]]),
      ['duty', 'out', 8], ['count', 'in', 12], ['go', 'out', 1], ['mode', 'out', 3], ['go_wr', 'out', 1]].map(([name, dir, width]) => ({ name, dir, width })) };
    const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [
      { id: 'fpga', kind: 'fpga', module: 'pwm_regs', board: 'basys2', variant: '250', pins: { clk: 'B8' },
        interfaces: [bus === 'spi' ? { name: 'bus', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss' } : { name: 'bus', kind: 'i2c', scl: 'scl', sda: 'sda' }] },
      { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw.hex', interfaces: [bus === 'spi' ? { name: 'SPI', kind: 'spi' } : { name: 'Wire', kind: 'i2c' }] },
    ], links: [{ id: 'bus', kind: bus, a: bus === 'spi' ? 'uno.SPI' : 'uno.Wire', b: 'fpga.bus' }] });
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateRegmap(m, { lang });
      const plan = systemPlan(sys, { ports: PORTS });
      const netlist = await netlistOf(designOf([{ path: g.file, lang, role: 'design', text: g.code }], 'pwm_regs'), { run: yosysNode });
      const r = systemFromInputs(sys, { plan, netlists: { fpga: netlist }, firmware: { uno: { name: 'fw.hex', data: intelHex(avrAssemble(bus === 'spi' ? SPI_PROG : TWI_PROG)) } }, regmaps: { fpga: m } });
      assert.equal(r.error, undefined);
      r.sim.nodes.get('fpga').setPin('count', 0x123);
      r.sim.run(3e9);
      const rep = systemReport(r), d = r.sim.nodes.get('uno').cpu.data;
      assert.deepEqual([d[19], d[20], r.sim.nodes.get('fpga').value('duty')], [0xa5, 0x23, 0xa5], `${bus} ${lang}`);
      assert.deepEqual([rep.warnings, rep.errors], [[], []]);
      const ss = bus === 'spi' ? r.sim.links.get('bus_ss').sent : null;
      const a = regAccesses(m, bus === 'spi' ? { spi: rep.spi[0].transfers, ss } : { i2c: rep.i2c[0].transfers });
      assert.deepEqual([a.accesses.map((x) => accessText(m, x)), a.warnings], [['write duty = 0xa5', 'read duty → 0xa5', 'read count → 0x0023 (partial)'], []], `${bus} ${lang}`);
      // (Simulate System says them, the link's FPGA end made from the map, #5288 step 2)
      assert.ok(rep.lines.includes('bus (registers of pwm_regs): 3 access(es): write duty = 0xa5; read duty → 0xa5; read count → 0x0023 (partial)'), rep.lines.join('\n'));
      assert.deepEqual(rep.regs.map((x) => [x.link, x.map, x.accesses.length]), [['bus', 'pwm_regs', 3]]);
    }
  }
});

test('#5288 the map a module is made from, among the project\'s maps: by its name, its case aside', async () => {
  const { regmapFor } = await import('../core/regmap.js');
  const texts = { 'src/a.regs.json': writeRegmap(MAP('spi')), 'src/b.vhd': 'entity pwm_regs is end;', 'src/bad.regs.json': '{' };
  assert.equal(regmapFor(texts, 'PWM_REGS')?.name, 'pwm_regs');
  assert.equal(regmapFor(texts, 'other'), null);
  assert.equal(regmapFor({}, 'pwm_regs'), null);
});

test('#5288 the program side: the header for SPI and for I²C, its addresses, its functions by access', () => {
  const s = regmapHeader(MAP('spi'));
  assert.equal(s.file, 'pwm_regs.h');
  const lines = s.code.split('\n');
  assert.deepEqual(lines.slice(0, 13), ['// pwm_regs.h: the registers of the register map pwm_regs.regs.json, the FPGA\'s, over SPI.', '// Generated by Silinx (edit the map, not this file).',
    '// In setup(): SPI.begin(); (SS, D10 on an Uno, is an output then, high).', '#ifndef PWM_REGS_H', '#define PWM_REGS_H', '', '#include <Arduino.h>', '#include <SPI.h>', '',
    '#ifndef PWM_REGS_SPI_HZ', '#define PWM_REGS_SPI_HZ 125000   // the SCK rate: the System\'s SPI interface\'s', '#endif', '']);
  assert.deepEqual(lines.filter((l) => l.startsWith('#define PWM_REGS_') && !/_H$|_HZ /.test(l)), ['#define PWM_REGS_DUTY  0x00   // 8 bit(s), rw', '#define PWM_REGS_COUNT 0x01   // 12 bit(s), ro',
    '#define PWM_REGS_GO    0x03   // 1 bit(s), wo, a pulse when written', '#define PWM_REGS_MODE  0x04   // 3 bit(s), rw']);
  assert.deepEqual(lines.filter((l) => /^static inline \S+ pwm_regs_(read|write)_/.test(l)), [
    'static inline uint8_t pwm_regs_read_duty(void) { return (uint8_t)pwm_regs_read(PWM_REGS_DUTY, 1); }', 'static inline void pwm_regs_write_duty(uint8_t v) { pwm_regs_write(PWM_REGS_DUTY, v, 1); }',
    'static inline uint16_t pwm_regs_read_count(void) { return (uint16_t)pwm_regs_read(PWM_REGS_COUNT, 2); }', 'static inline void pwm_regs_write_go(uint8_t v) { pwm_regs_write(PWM_REGS_GO, v, 1); }',
    'static inline uint8_t pwm_regs_read_mode(void) { return (uint8_t)pwm_regs_read(PWM_REGS_MODE, 1); }', 'static inline void pwm_regs_write_mode(uint8_t v) { pwm_regs_write(PWM_REGS_MODE, v, 1); }']);
  assert.ok(s.code.includes('  SPI.transfer(0x80 | addr);\n') && s.code.endsWith('#endif  // PWM_REGS_H\n'));
  const i = regmapHeader(MAP('i2c')).code;
  assert.ok(i.includes('#include <Wire.h>\n') && i.includes('#define PWM_REGS_I2C_ADDRESS 0x42\n') && i.includes('  Wire.endTransmission(false);   // a repeated START\n'), i);
});

test('#5288 the decoder: SPI frames by SS, a write across two registers, an address with no register; I²C\'s pointer kept for a read', () => {
  const m = MAP('spi');
  const t = (x) => x.map((y, k) => ({ t: 1000 * (k + 1), ...y }));
  // frame 1: a write from 0 of duty, count's two bytes (an ro register written: the bytes said), go; frame 2: a write at 5
  const spi = t([{ mosi: 0x00 }, { mosi: 0x11 }, { mosi: 0x22 }, { mosi: 0x03 }, { mosi: 0x01 }, { mosi: 0x05 }, { mosi: 0x09 }]);
  const a = regAccesses(m, { spi, ss: [0, 1, 500, 0, 5500, 1, 5700, 0] });
  assert.deepEqual(a.accesses.map((x) => accessText(m, x)), ['write duty = 0x11', 'write count = 0x0322', 'write go = 0x01']);
  assert.deepEqual(a.warnings, ['pwm_regs: a write at the address 0x05, no register\'s']);
  const i2c = [{ t: 1, addr: 0x42, read: false, ack: true, data: [{ byte: 1 }] }, { t: 2, addr: 0x42, read: true, ack: true, data: [{ byte: 0x34 }, { byte: 0x02 }] },
    { t: 3, addr: 0x43, read: false, ack: false, data: [] }];
  assert.deepEqual(regAccesses(MAP('i2c'), { i2c }).accesses.map((x) => accessText(m, x)), ['read count → 0x0234']);
});

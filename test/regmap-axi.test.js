// A register map on AXI4-Lite (#4688, part 1; core/regmap-axi.js): a Zynq's PL registers seen by its PS. The map checked
// (its base address in M_AXI_GP0's range, a 4 KB window; its registers words at a word's offset), its slave in VHDL and in
// Verilog compiled and elaborated with no warnings (the lint's too), simulated against an AXI4-Lite master (a test bench
// of the PS's side: writes with their address and data at once and apart, WSTRB's bytes, its strobe once, reads, a word
// no register has, the reset), and its program side: the C header (volatile words at base + offset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegmap, readRegmap, writeRegmap, checkRegmap, AXI_BASE } from '../core/regmap.js';
import { generateRegmap } from '../core/regmap-hdl.js';
import { regmapHeader } from '../core/regmap-c.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const MAP = (more = {}) => normalizeRegmap({ name: 'pwm_regs', bus: 'axi', ...more, registers: [
  { name: 'duty', addr: 0, width: 8, access: 'rw', reset: 5 }, { name: 'count', addr: 4, width: 12, access: 'ro' },
  { name: 'go', addr: 8, width: 1, access: 'wo', strobe: true }, { name: 'mode', addr: 12, width: 3, access: 'rw' },
  { name: 'big', addr: 0x10, width: 32, access: 'rw' }] });
const errors = (m) => checkRegmap(m).filter((d) => d.severity === 'error').map((d) => d.message);

test('#4688 an AXI4-Lite map: its base by default (0x43C00000), kept; checked: the base, the offsets, an overlap, a bus port\'s name', () => {
  const m = MAP();
  assert.equal(m.base, AXI_BASE);
  assert.equal(AXI_BASE, 0x43C00000);
  assert.deepEqual(readRegmap(writeRegmap(m)).regmap, m);
  assert.deepEqual(checkRegmap(m), []);
  assert.deepEqual(errors(MAP({ base: 0x43C00800 })), ['the AXI base address \'0x43C00800\' is not a 4 KB window\'s in M_AXI_GP0\'s 0x40000000 to 0x7FFFFFFF']);
  assert.deepEqual(errors(MAP({ base: 0x80000000 })), ['the AXI base address \'0x80000000\' is not a 4 KB window\'s in M_AXI_GP0\'s 0x40000000 to 0x7FFFFFFF']);
  const regs = (rs) => errors(normalizeRegmap({ name: 'r', bus: 'axi', registers: rs }));
  assert.deepEqual(regs([{ name: 'a', addr: 2, width: 8 }]), ['a: its offset \'2\' is not a word\'s: 0x000 to 0xffc, a multiple of 4']);
  assert.deepEqual(regs([{ name: 'a', addr: 0x1000, width: 8 }]), ['a: its offset \'4096\' is not a word\'s: 0x000 to 0xffc, a multiple of 4']);
  assert.deepEqual(regs([{ name: 'a', addr: 0xffc, width: 32 }]), []);
  assert.deepEqual(regs([{ name: 'a', addr: 8, width: 8 }, { name: 'c', addr: 8, width: 16 }]), ['c and a both at offset 0x08']);
  assert.deepEqual(regs([{ name: 's_axi_wdata', addr: 0, width: 8 }]), [
    's_axi_wdata: a port of the bus\'s (s_axi_aclk, s_axi_aresetn, s_axi_awaddr, s_axi_awvalid, s_axi_awready, s_axi_wdata, s_axi_wstrb, s_axi_wvalid, s_axi_wready, s_axi_bresp, s_axi_bvalid, s_axi_bready, s_axi_araddr, s_axi_arvalid, s_axi_arready, s_axi_rdata, s_axi_rresp, s_axi_rvalid, s_axi_rready)']);
  assert.match(regs([{ name: 'axi_rdata', addr: 0, width: 8 }])[0], /^axi_rdata: a name the generated module uses itself/);
});

function hdlChecks(code, lang) {
  const lib = compile([{ path: `pwm_regs.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: code }]);
  const d = elaborate(lib, 'pwm_regs');
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`);
}

test('#4688 the AXI4-Lite slave in VHDL and in Verilog: compiled and elaborated, no warnings; its header and ports', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateRegmap(MAP(), { lang });
    assert.equal(g.file, `pwm_regs.${lang === 'vhdl' ? 'vhd' : 'v'}`);
    assert.deepEqual(hdlChecks(g.code, lang), [], lang);
    assert.match(g.code, /Bus {9}: AXI4-Lite slave \(s_axi_\*\), 32-bit data, a 4 KB window at the base address 0x43C00000: each/);
    assert.match(g.code, /Clock {7}: s_axi_aclk \(rising edge\); s_axi_aresetn low the registers' reset/);
  }
  const v = generateRegmap(MAP(), { lang: 'vhdl' }).code;
  assert.ok(v.includes('    Port ( s_axi_aclk    : in  STD_LOGIC;\n           s_axi_aresetn : in  STD_LOGIC;\n           s_axi_awaddr  : in  STD_LOGIC_VECTOR (11 downto 0);\n'), v);
  assert.ok(v.includes('           count         : in  STD_LOGIC_VECTOR (11 downto 0);\n           go            : out STD_LOGIC;\n'), v);
  const g = generateRegmap(MAP(), { lang: 'verilog' }).code;
  assert.ok(g.includes('    output reg  [7:0]  duty = 8\'d5,\n    input  wire [11:0] count,\n    output reg         go = 1\'d0,\n'), g);
});

// the PS's side: writes (address and data at once, then apart; WSTRB's bytes), reads, the registers at the end
const BENCH = ['`timescale 1ns/1ps', 'module tb;', '  reg clk = 0, rstn = 0;', '  always #5 clk = ~clk;',
  '  reg [11:0] awaddr = 0, araddr = 0; reg [31:0] wdata = 0; reg [3:0] wstrb = 0;', '  reg awvalid = 0, wvalid = 0, bready = 0, arvalid = 0, rready = 0;',
  '  wire awready, wready, bvalid, arready, rvalid; wire [1:0] bresp, rresp; wire [31:0] rdata;',
  '  reg [11:0] count = 12\'h123; wire [7:0] duty; wire [2:0] mode; wire go, go_wr; wire [31:0] big;', '  integer strobes = 0;',
  '  always @(posedge clk) if (go_wr) strobes = strobes + 1;',
  '  pwm_regs uut (.s_axi_aclk(clk), .s_axi_aresetn(rstn), .s_axi_awaddr(awaddr), .s_axi_awvalid(awvalid), .s_axi_awready(awready), .s_axi_wdata(wdata), .s_axi_wstrb(wstrb),',
  '    .s_axi_wvalid(wvalid), .s_axi_wready(wready), .s_axi_bresp(bresp), .s_axi_bvalid(bvalid), .s_axi_bready(bready), .s_axi_araddr(araddr), .s_axi_arvalid(arvalid),',
  '    .s_axi_arready(arready), .s_axi_rdata(rdata), .s_axi_rresp(rresp), .s_axi_rvalid(rvalid), .s_axi_rready(rready),',
  '    .duty(duty), .count(count), .go(go), .mode(mode), .big(big), .go_wr(go_wr));',
  // (a write: address and data valid together, or the data a few clocks after the address)
  '  task wr(input [11:0] a, input [31:0] d, input [3:0] s, input apart); begin',
  '    @(negedge clk); awaddr = a; awvalid = 1; if (!apart) begin wdata = d; wstrb = s; wvalid = 1; end',
  '    if (apart) begin repeat (3) @(negedge clk); wdata = d; wstrb = s; wvalid = 1; end',
  '    @(posedge clk); while (!(awready && wready)) @(posedge clk);', '    @(negedge clk); awvalid = 0; wvalid = 0; bready = 1;',
  '    while (!bvalid) @(negedge clk);', '    if (bresp != 0) $display("BRESP %b", bresp);', '    @(negedge clk); bready = 0;', '  end endtask',
  '  task rd(input [11:0] a); begin', '    @(negedge clk); araddr = a; arvalid = 1;', '    @(posedge clk); while (!arready) @(posedge clk);',
  '    @(negedge clk); arvalid = 0; rready = 1;', '    while (!rvalid) @(negedge clk);', '    $display("read %h: %h%s", a, rdata, rresp ? " RRESP" : "");', '    @(negedge clk); rready = 0;', '  end endtask',
  '  initial begin', '    repeat (3) @(negedge clk); $display("reset duty=%h", duty); rstn = 1;',
  '    wr(12\'h000, 32\'hffffffa5, 4\'b0001, 0);', '    wr(12\'h00c, 32\'h00000006, 4\'b1111, 1);', '    wr(12\'h008, 32\'h00000001, 4\'b1111, 0);',
  '    wr(12\'h010, 32\'hdeadbeef, 4\'b1111, 0);', '    wr(12\'h010, 32\'h11223344, 4\'b0101, 1);', '    wr(12\'h000, 32\'h000000ff, 4\'b0000, 0);',
  '    rd(12\'h000); rd(12\'h004); rd(12\'h008); rd(12\'h00c); rd(12\'h010); rd(12\'h7fc);',
  '    $display("duty=%h mode=%h go=%b big=%h strobes=%0d", duty, mode, go, big, strobes);', '    $finish;', '  end', 'endmodule', ''].join('\n');

test('#4688 the AXI4-Lite slave simulated in VHDL and in Verilog against the PS\'s side: written (WSTRB\'s bytes, its strobe once), read back, OKAY', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateRegmap(MAP(), { lang });
    const r = simulate([{ path: g.file, text: g.code }, { path: 'tb.v', text: BENCH }], 'tb', { until: 1e9 });
    assert.deepEqual(r.errors, [], lang);
    const log = r.sim.log.map((l) => l.text);
    assert.match(log.pop(), /^simulation finished \(\$finish\) at \d+ [nu]s$/);
    assert.deepEqual(log, ['reset duty=05', 'read 000: 000000a5', 'read 004: 00000123', 'read 008: 00000000', 'read 00c: 00000006', 'read 010: de22be44', 'read 7fc: 00000000',
      'duty=a5 mode=6 go=1 big=de22be44 strobes=1'], lang);
  }
});

test('#4688 the PS\'s header: the base, a volatile word per register at its offset, its read and write; compiled for the Cortex-A9 by clang, no warning', async () => {
  const h = regmapHeader(MAP({ base: 0x43C10000 }));
  assert.equal(h.file, 'pwm_regs.h');
  const lines = h.code.split('\n');
  assert.deepEqual(lines.slice(0, 2), ['/* pwm_regs.h: the registers of the register map pwm_regs.regs.json, the PL\'s, on AXI4-Lite at 0x43C10000 (M_AXI_GP0).', ' * Generated by Silinx (edit the map, not this file). */']);
  assert.ok(lines.includes('#define PWM_REGS_BASE 0x43C10000u'));
  assert.ok(lines.includes('#define PWM_REGS_REG(off) (*(volatile uint32_t *)(PWM_REGS_BASE + (off)))'));
  assert.ok(lines.includes('#define PWM_REGS_BIG   0x010   /* 32 bit(s), rw */'));
  assert.ok(lines.includes('static inline uint16_t pwm_regs_read_count(void) { return (uint16_t)PWM_REGS_REG(PWM_REGS_COUNT); }'));
  assert.ok(lines.includes('static inline void pwm_regs_write_go(uint8_t v) { PWM_REGS_REG(PWM_REGS_GO) = v; }'));
  assert.ok(!lines.some((l) => /pwm_regs_write_count|pwm_regs_read_go/.test(l)), 'no write of an ro register, no read of a wo one');
  // (compiled for the Cortex-A9, a program reading and writing them: no warning, where the host's clang targets ARM)
  const { spawnSync } = await import('node:child_process');
  const t = spawnSync('clang', ['--print-targets'], { encoding: 'utf8' });
  if (t.status !== 0 || !/\barm\b/.test(t.stdout)) return;
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-axi-h-'));
  try {
    fs.writeFileSync(path.join(dir, h.file), h.code);
    fs.writeFileSync(path.join(dir, 'main.c'), '#include "pwm_regs.h"\nint main(void) { pwm_regs_write_duty(0xa5); pwm_regs_write_go(1); for (;;) { if (pwm_regs_read_count() > pwm_regs_read_duty()) pwm_regs_write_big(pwm_regs_read_big() + 1); } }\n');
    const r = spawnSync('clang', ['-target', 'armv7a-none-eabi', '-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-Wall', '-Wextra', '-ffreestanding', '-c', 'main.c', '-o', 'main.o'], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual([r.status, r.stderr], [0, '']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

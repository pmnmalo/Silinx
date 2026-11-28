// A Zynq node's PL top (#4688, part 2; core/zynq-pl-top.js): the PS7, its M_AXI_GP0 bridged to the register map's AXI4-Lite
// slave (core/regmap-axi.js), the student's module (its registers' ports wired, its clk FCLK_CLK0, its other ports the
// board's). Its wiring checked (a register with no port, the wrong direction or width, said); the top in VHDL and in
// Verilog compiled, elaborated and simulated with the slave and a module, against a stand-in of the PS7 (its MAXIGP0
// signals driven as the A9's word accesses are: AXI3 single beats with their IDs; FCLK_CLK0 and its reset) and of the
// BIBUF and the BUFG: written, the module's count read back, each response's ID the request's, RLAST high, OKAY.
// Vivado's build of the top with the real PS7 is a board check of its own (#4688's part 2 issue).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zynqPlTop, plTopWiring, GP0 } from '../core/zynq-pl-top.js';
import { normalizeRegmap } from '../core/regmap.js';
import { generateRegmap } from '../core/regmap-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const MAP = normalizeRegmap({ name: 'cnt_regs', bus: 'axi', registers: [{ name: 'enable', addr: 0, width: 1, access: 'rw', reset: 0 },
  { name: 'count', addr: 4, width: 16, access: 'ro' }, { name: 'clear', addr: 8, width: 1, access: 'wo', strobe: true }] });
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'enable', dir: 'in', width: 1 }, { name: 'clear', dir: 'in', width: 1 }, { name: 'clear_wr', dir: 'in', width: 1 },
  { name: 'count', dir: 'out', width: 16 }, { name: 'led', dir: 'out', width: 4 }];
const MODULE = { name: 'counter', ports: PORTS };
// the student's module: a counter, enabled, cleared by the strobe; its four high bits on the LEDs
const COUNTER = { vhdl: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter is
    Port ( clk      : in  STD_LOGIC;
           enable   : in  STD_LOGIC;
           clear    : in  STD_LOGIC;
           clear_wr : in  STD_LOGIC;
           count    : out STD_LOGIC_VECTOR (15 downto 0);
           led      : out STD_LOGIC_VECTOR (3 downto 0));
end counter;

architecture rtl of counter is
    signal c : unsigned (15 downto 0) := (others => '0');
begin
    process (clk)
    begin
        if rising_edge(clk) then
            if clear_wr = '1' and clear = '1' then
                c <= (others => '0');
            elsif enable = '1' then
                c <= c + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(c);
    led <= std_logic_vector(c(15 downto 12));
end rtl;
`, verilog: `module counter (
    input  wire        clk,
    input  wire        enable,
    input  wire        clear,
    input  wire        clear_wr,
    output wire [15:0] count,
    output wire [3:0]  led
);
    reg [15:0] c = 16'd0;
    always @(posedge clk)
        if (clear_wr && clear) c <= 16'd0;
        else if (enable) c <= c + 16'd1;
    assign count = c;
    assign led = c[15:12];
endmodule
` };

test('#4688 the PL top\'s wiring: the registers to the module\'s ports, its clk FCLK_CLK0, the others the board\'s; what does not meet, said', () => {
  const w = plTopWiring(MODULE, MAP);
  assert.deepEqual([w.slave, w.fclk, w.board.map((p) => p.name), w.errors], [[['enable', 'enable'], ['count', 'count'], ['clear', 'clear'], ['clear_wr', 'clear_wr']], 'clk', ['led'], []]);
  // (clk on a board's pin: the board's)
  assert.deepEqual(plTopWiring(MODULE, MAP, { clk: 'K17' }).board.map((p) => p.name), ['clk', 'led']);
  const bad = (ports) => zynqPlTop({ module: { name: 'counter', ports }, map: MAP }).errors;
  assert.deepEqual(bad(PORTS.filter((p) => p.name !== 'count')), ['the module counter has no port count for the register map cnt_regs\'s count']);
  assert.deepEqual(bad(PORTS.map((p) => (p.name === 'enable' ? { ...p, dir: 'out' } : p))), ['counter\'s enable is an output: the register map cnt_regs\'s enable is written by the PS, an input of the module']);
  assert.deepEqual(bad(PORTS.map((p) => (p.name === 'count' ? { ...p, width: 8 } : p))), ['counter\'s count is 8 bit(s), the register map cnt_regs\'s count 16']);
  assert.deepEqual(bad(PORTS.filter((p) => p.name !== 'clear_wr')), ['the module counter has no port clear_wr for the register map cnt_regs\'s clear\'s strobe']);
  assert.deepEqual(zynqPlTop({ module: MODULE, map: { ...MAP, bus: 'spi' } }).errors, ['the register map cnt_regs is not on AXI4-Lite: its bus is spi']);
  const t = zynqPlTop({ module: MODULE, map: MAP, lang: 'verilog' });
  assert.deepEqual([t.top, t.file, t.errors], ['counter_zynq', 'counter_zynq.v', []]);
  assert.equal(zynqPlTop({ module: MODULE, map: MAP }).file, 'counter_zynq.vhd');
});

// the stand-ins: the PS7 (FCLK_CLK0 at 100 MHz, its reset released; the A9's word accesses on M_AXI_GP0), BIBUF, BUFG
const STANDINS = ['`timescale 1ns/1ps',
  'module BIBUF (inout IO, inout PAD); endmodule', 'module BUFG (input I, output O); assign O = I; endmodule',
  `module PS7 (inout [53:0] MIO, inout PSCLK, inout PSPORB, inout PSSRSTB, inout [14:0] DDRA, inout [2:0] DDRBA, inout DDRCASB, inout DDRCKE, inout DDRCKN, inout DDRCKP, inout DDRCSB,
  inout [3:0] DDRDM, inout [31:0] DDRDQ, inout [3:0] DDRDQSN, inout [3:0] DDRDQSP, inout DDRDRSTB, inout DDRODT, inout DDRRASB, inout DDRVRN, inout DDRVRP, inout DDRWEB,
  output reg [3:0] FCLKCLK = 0, output reg [3:0] FCLKRESETN = 0,
  ${GP0.map(([s, d, wd]) => `${d === 'out' ? 'output reg' : 'input'} ${wd === 1 ? '' : `[${wd - 1}:0] `}MAXIGP0${s}${d === 'out' ? ' = 0' : ''}`).join(', ')});`,
  '  always #5 FCLKCLK[0] = ~FCLKCLK[0];',
  '  task wr(input [31:0] a, input [31:0] d, input [11:0] id); begin',
  '    @(negedge FCLKCLK[0]); MAXIGP0AWADDR = a; MAXIGP0AWID = id; MAXIGP0AWVALID = 1; MAXIGP0WDATA = d; MAXIGP0WSTRB = 4\'hf; MAXIGP0WVALID = 1;',
  '    @(posedge FCLKCLK[0]); while (!(MAXIGP0AWREADY && MAXIGP0WREADY)) @(posedge FCLKCLK[0]);',
  '    @(negedge FCLKCLK[0]); MAXIGP0AWVALID = 0; MAXIGP0WVALID = 0; MAXIGP0BREADY = 1;',
  '    while (!MAXIGP0BVALID) @(negedge FCLKCLK[0]);', '    $display("write %h: BID %h BRESP %b", a, MAXIGP0BID, MAXIGP0BRESP);', '    @(negedge FCLKCLK[0]); MAXIGP0BREADY = 0;', '  end endtask',
  '  task rd(input [31:0] a, input [11:0] id, output [31:0] v); begin',
  '    @(negedge FCLKCLK[0]); MAXIGP0ARADDR = a; MAXIGP0ARID = id; MAXIGP0ARVALID = 1;', '    @(posedge FCLKCLK[0]); while (!MAXIGP0ARREADY) @(posedge FCLKCLK[0]);',
  '    @(negedge FCLKCLK[0]); MAXIGP0ARVALID = 0; MAXIGP0RREADY = 1;', '    while (!MAXIGP0RVALID) @(negedge FCLKCLK[0]);',
  '    v = MAXIGP0RDATA; $display("read %h: RID %h RLAST %b RRESP %b", a, MAXIGP0RID, MAXIGP0RLAST, MAXIGP0RRESP);', '    @(negedge FCLKCLK[0]); MAXIGP0RREADY = 0;', '  end endtask',
  '  reg [31:0] v1, v2;',
  '  initial begin',
  '    repeat (4) @(negedge FCLKCLK[0]); FCLKRESETN = 4\'hf;',
  '    wr(32\'h43c00000, 1, 12\'h0a1);',   // (enable)
  '    repeat (20) @(negedge FCLKCLK[0]);',
  '    rd(32\'h43c00004, 12\'h0b2, v1);',
  '    wr(32\'h43c00000, 0, 12\'h0a3);', '    rd(32\'h43c00004, 12\'h0b4, v2);', '    wr(32\'h43c00008, 1, 12\'h0a5);',   // (stopped, read, cleared)
  '    rd(32\'h43c00004, 12\'h0b6, v1);',
  '    $display("count %0d then %0d (counting: %b); after clear %0d", v2 - 0, v2, v2 > 20, v1);', '    $finish;', '  end', 'endmodule', ''].join('\n');

test('#4688 the PL top in VHDL and in Verilog: compiled and elaborated, no error nor warning; simulated against the PS7\'s stand-in: written, the count read back, each ID given back', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const t = zynqPlTop({ module: MODULE, map: MAP, lang });
    const slave = generateRegmap(MAP, { lang });
    const files = [{ path: slave.file, text: slave.code }, { path: `counter.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: COUNTER[lang] }, { path: t.file, text: t.code }];
    const lib = compile([...files, { path: 'standins.v', text: STANDINS }]);
    const d = elaborate(lib, 'counter_zynq');
    // (no error and no warning, the compiler's and the elaboration's; the lint left out: the PS7's stand-in drives nothing it
    // knows of, so its nets would look sourceless; Vivado's build with the real PS7 is the board check's)
    assert.deepEqual([...lib.errors, ...d.diags].map((e) => `${e.severity}: ${e.message}`), [], lang);
    const r = simulate([...files, { path: 'standins.v', text: STANDINS }, { path: 'tb.v', text: '`timescale 1ns/1ps\nmodule tb; wire [53:0] mio; wire [3:0] led; counter_zynq dut (.FIXED_IO_mio(mio), .led(led)); endmodule\n' }],
      'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], lang);
    const log = r.sim.log.map((l) => l.text);
    assert.match(log.pop(), /^simulation finished \(\$finish\) at \d+ [nu]s$/);
    const counted = log.find((l) => l.startsWith('count ')).match(/^count \d+ then (\d+) \(counting: 1\); after clear (\d+)$/);
    assert.ok(counted, log.join('\n'));
    assert.deepEqual(log.filter((l) => !l.startsWith('count ')), ['write 43c00000: BID 0a1 BRESP 00', 'read 43c00004: RID 0b2 RLAST 1 RRESP 00', 'write 43c00000: BID 0a3 BRESP 00',
      'read 43c00004: RID 0b4 RLAST 1 RRESP 00', 'write 43c00008: BID 0a5 BRESP 00', 'read 43c00004: RID 0b6 RLAST 1 RRESP 00'], lang);
    assert.equal(Number(counted[2]), 0, `${lang}: cleared`);
  }
});

test('#4688 the PL top for the Silinx toolchain (fixedIo false): no fixed IO, no BIBUF, the PS7\'s MIO and DDR left unconnected; still simulated the same', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const t = zynqPlTop({ module: MODULE, map: MAP, lang, fixedIo: false });
    assert.doesNotMatch(t.code, /FIXED_IO_|DDR_|BIBUF|\bMIO\b/, lang);
    assert.match(t.code, lang === 'vhdl' ? /MAXIGP0AWADDR => gp0_awaddr/ : /\.MAXIGP0AWADDR\(gp0_awaddr\)/);
    const slave = generateRegmap(MAP, { lang });
    const r = simulate([{ path: slave.file, text: slave.code }, { path: `counter.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: COUNTER[lang] }, { path: t.file, text: t.code },
      { path: 'standins.v', text: STANDINS }, { path: 'tb.v', text: '`timescale 1ns/1ps\nmodule tb; wire [3:0] led; counter_zynq dut (.led(led)); endmodule\n' }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.sim.log.map((l) => l.text).filter((l) => /^(write|read) /.test(l)).map((l) => l.split(':')[1].trim().split(' ')[1]), ['0a1', '0b2', '0a3', '0b4', '0a5', '0b6'], lang);
  }
});

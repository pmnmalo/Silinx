// The Gowin primitives' test designs of #4333 on the Tang Nano 9K (GW1NR-9C): one per primitive gowin_pack ports, each
// { cst, text, cells: the primitive's cells in the routed design, warnings: the flow's, exactly }. Their routed designs' and
// Apicula 0.32's .fs's SHA-256 are in apicula-0.32.json (primitives); test/gowin-iologic.test.js, gowin-diff-io.test.js and
// gowin-dsp.test.js build them and compare Silinx's .fs.
const CLK = 'IO_LOC "clk" 52;\n';
const LEDS = n => [10, 11, 13, 14, 15, 16].slice(0, n).map((p, i) => `IO_LOC "led[${i}]" ${p};\n`).join('');
const PIN = (name, pin) => `IO_LOC "${name}" ${pin};\n`;
const PORTS = ".RESET(1'b0), .RESET_P(1'b0), .CLKFB(1'b0), .FBDSEL(6'b0), .IDSEL(6'b0), .ODSEL(6'b0), .PSDA(4'b0), .DUTYDA(4'b0), .FDLY(4'b0)";
// 27 MHz to 108 MHz, the serialisers' fast clock; its CLKDIV's output their parallel clock
const PLL = `  wire fclk, pclk, lock;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(3), .ODIV_SEL(4), .DEVICE("GW1NR-9C")) pll (.CLKIN(clk), .CLKOUT(fclk), .LOCK(lock), ${PORTS});\n`;
const DIV = (m, hclk = 'fclk') => `  CLKDIV #(.DIV_MODE("${m}")) div (.HCLKIN(${hclk}), .RESETN(lock), .CALIB(1'b0), .CLKOUT(pclk));\n`;
const COUNT = w => `  reg [${w - 1}:0] c = 0;\n  always @(posedge pclk) c <= c + 1;\n`;
const IN = ".RESET(1'b0), .CALIB(1'b0)";
const qs = n => Array.from({ length: n }, (_, i) => `.Q${i}(q[${i}])`).join(', ');
const ds = n => Array.from({ length: n }, (_, i) => `.D${i}(c[${i}])`).join(', ');
// nextpnr's warning: a clock routed through the general routing where its dedicated routing did not reach
// (#4352) a differential tristate's enable: nextpnr-himbaechel-gowin drops it, the flow says so
const oenDropped = type => `WARNING:Place - ${type} u: its enable (OEN) is not in the bitstream (nextpnr-himbaechel-gowin drops it): the pair always drives.`;
const fallback = (net, from, to) => `WARNING:Place - Failed to route net '${net}' from ${from} to ${to} using dedicated routing.`;

/** The I/O logic (DDR, serialisers, deserialisers, delay) and the clock primitives (CLKDIV, DHCEN, DCS, DQCE). */
export const IOLOGIC = {
  oddr: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { ODDR: 1 },
    text: `module oddr(input clk, output q, output reg [0:0] led);\n  reg [1:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  ODDR u (.D0(c[0]), .D1(c[1]), .TX(1'b0), .CLK(clk), .Q0(q), .Q1());\nendmodule\n` },
  // its clear, and its tristate (Q1 to a TBUF's enable)
  oddrc: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { ODDRC: 1 },
    text: `module oddrc(input clk, output q, output reg [0:0] led);\n  reg [2:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[2]; end\n  ODDRC u (.D0(c[0]), .D1(c[1]), .TX(1'b0), .CLK(clk), .CLEAR(c[2]), .Q0(q), .Q1());\nendmodule\n` },
  oddrt: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { ODDR: 1, TBUF: 1 },
    text: `module oddrt(input clk, output q, output reg [0:0] led);\n  reg [2:0] c = 0; wire o, t;\n  always @(posedge clk) begin c <= c + 1; led <= c[2]; end\n  ODDR u (.D0(c[0]), .D1(c[1]), .TX(c[2]), .CLK(clk), .Q0(o), .Q1(t));\n  TBUF b (.I(o), .OEN(t), .O(q));\nendmodule\n` },
  iddr: { cst: `${CLK}${LEDS(2)}${PIN('d', 25)}`, cells: { IDDR: 1 },
    text: `module iddr(input clk, input d, output reg [1:0] led);\n  wire q0, q1;\n  IDDR u (.D(d), .CLK(clk), .Q0(q0), .Q1(q1));\n  always @(posedge clk) led <= {q0, q1};\nendmodule\n` },
  iddrc: { cst: `${CLK}${LEDS(2)}${PIN('d', 25)}`, cells: { IDDRC: 1 },
    text: `module iddrc(input clk, input d, output reg [1:0] led);\n  wire q0, q1; reg r = 0;\n  IDDRC u (.D(d), .CLK(clk), .CLEAR(r), .Q0(q0), .Q1(q1));\n  always @(posedge clk) begin r <= ~r; led <= {q0, q1}; end\nendmodule\n` },
  // the serialisers: by 4 (CLKDIV by 2), 8 (by 4), 10 (by 5), 7 (OVIDEO, by 3.5); the 8, 10 and 7 take the next I/O's logic too
  oser4: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { OSER4: 1, CLKDIV: 1, rPLL: 1 },
    text: `module oser4(input clk, output q, output reg [0:0] led);\n${PLL}${DIV('2')}${COUNT(4)}  always @(posedge pclk) led <= c[3];\n  OSER4 u (${ds(4)}, .TX0(1'b0), .TX1(1'b0), .PCLK(pclk), .FCLK(fclk), .RESET(1'b0), .Q0(q), .Q1());\nendmodule\n` },
  oser8: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { OSER8: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    // (none with Yosys 0.71's netlist; with 0.70's the fclk's to X46Y18/CLKDIV_HCLK1_SECT1_HCLKIN, #5634)
    text: `module oser8(input clk, output q, output reg [0:0] led);\n${PLL}${DIV('4')}${COUNT(8)}  always @(posedge pclk) led <= c[7];\n  OSER8 u (${ds(8)}, .TX0(1'b0), .TX1(1'b0), .TX2(1'b0), .TX3(1'b0), .PCLK(pclk), .FCLK(fclk), .RESET(1'b0), .Q0(q), .Q1());\nendmodule\n` },
  oser10: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { OSER10: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    text: `module oser10(input clk, output q, output reg [0:0] led);\n${PLL}${DIV('5')}${COUNT(10)}  always @(posedge pclk) led <= c[9];\n  OSER10 u (${ds(10)}, .PCLK(pclk), .FCLK(fclk), .RESET(1'b0), .Q(q));\nendmodule\n` },
  ovideo: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { OVIDEO: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    text: `module ovideo(input clk, output q, output reg [0:0] led);\n${PLL}${DIV('3.5')}${COUNT(7)}  always @(posedge pclk) led <= c[6];\n  OVIDEO u (${ds(7)}, .PCLK(pclk), .FCLK(fclk), .RESET(1'b0), .Q(q));\nendmodule\n` },
  // the deserialisers, the same
  ides4: { cst: `${CLK}${LEDS(4)}${PIN('d', 25)}`, cells: { IDES4: 1, CLKDIV: 1, rPLL: 1 },
    text: `module ides4(input clk, input d, output reg [3:0] led);\n${PLL}${DIV('2')}  wire [3:0] q;\n  IDES4 u (.D(d), .PCLK(pclk), .FCLK(fclk), ${IN}, ${qs(4)});\n  always @(posedge pclk) led <= q;\nendmodule\n` },
  ides8: { cst: `${CLK}${LEDS(4)}${PIN('d', 25)}`, cells: { IDES8: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    warnings: [fallback('fclk', 'X44Y9/F4', 'X46Y18/CLKDIV_HCLK0_SECT1_HCLKIN')],
    text: `module ides8(input clk, input d, output reg [3:0] led);\n${PLL}${DIV('4')}  wire [7:0] q;\n  IDES8 u (.D(d), .PCLK(pclk), .FCLK(fclk), ${IN}, ${qs(8)});\n  always @(posedge pclk) led <= q[3:0] ^ q[7:4];\nendmodule\n` },
  ides10: { cst: `${CLK}${LEDS(4)}${PIN('d', 25)}`, cells: { IDES10: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    warnings: [fallback('fclk', 'X44Y9/F4', 'X46Y18/CLKDIV_HCLK0_SECT1_HCLKIN')],
    text: `module ides10(input clk, input d, output reg [3:0] led);\n${PLL}${DIV('5')}  wire [9:0] q;\n  IDES10 u (.D(d), .PCLK(pclk), .FCLK(fclk), ${IN}, ${qs(10)});\n  always @(posedge pclk) led <= q[3:0] ^ q[7:4] ^ {2'b0, q[9:8]};\nendmodule\n` },
  ivideo: { cst: `${CLK}${LEDS(4)}${PIN('d', 25)}`, cells: { IVIDEO: 1, IOLOGIC_DUMMY: 1, CLKDIV: 1, rPLL: 1 },
    text: `module ivideo(input clk, input d, output reg [3:0] led);\n${PLL}${DIV('3.5')}  wire [6:0] q;\n  IVIDEO u (.D(d), .PCLK(pclk), .FCLK(fclk), ${IN}, ${qs(7)});\n  always @(posedge pclk) led <= q[3:0] ^ {1'b0, q[6:4]};\nendmodule\n` },
  // an input's static delay: its I/O logic otherwise empty
  iodelay: { cst: `${CLK}${LEDS(1)}${PIN('d', 25)}`, cells: { IOLOGICI_EMPTY: 1 },
    text: `module iodelay(input clk, input d, output reg [0:0] led);\n  wire o;\n  IODELAY #(.C_STATIC_DLY(5)) u (.DI(d), .SDTAP(1'b0), .SETN(1'b0), .VALUE(1'b0), .DO(o), .DF());\n  always @(posedge clk) led <= o;\nendmodule\n` },
  // the HCLK stopped by a DHCEN ahead of its CLKDIV and serialiser
  dhcen: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}${PIN('e', 26)}`, cells: { OSER4: 1, CLKDIV: 1, rPLL: 1, DHCEN: 24 },
    // (placed so with Yosys 0.71's netlist, none with 0.70's, #5634)
    warnings: [fallback('fclk', 'X44Y9/F4', 'X0Y18/CLKDIV_HCLK1_SECT1_HCLKIN')],
    text: `module dhcen(input clk, input e, output q, output reg [0:0] led);\n${PLL}  wire g;\n  DHCEN h (.CLKIN(fclk), .CE(e), .CLKOUT(g));\n${DIV('2', 'g')}${COUNT(4)}  always @(posedge pclk) led <= c[3];\n  OSER4 u (${ds(4)}, .TX0(1'b0), .TX1(1'b0), .PCLK(pclk), .FCLK(g), .RESET(1'b0), .Q0(q), .Q1());\nendmodule\n` },
  // a DCS between the input clock and the rPLL's
  dcs: { cst: `${CLK}${LEDS(1)}${PIN('s', 25)}`, cells: { DCS: 8, rPLL: 1 },
    warnings: [fallback('fclk', 'X2Y9/F4', 'X26Y9/P26B'), fallback('clk_IBUF_I_O', 'X46Y16/F6', 'X25Y9/P26A')],
    text: `module dcs(input clk, input s, output reg [0:0] led);\n  wire fclk, lock, o;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(1), .ODIV_SEL(8), .DEVICE("GW1NR-9C")) pll (.CLKIN(clk), .CLKOUT(fclk), .LOCK(lock), ${PORTS});\n  DCS #(.DCS_MODE("RISING")) u (.CLK0(clk), .CLK1(fclk), .CLK2(1'b0), .CLK3(1'b0), .CLKSEL({2'b0, s, ~s}), .SELFORCE(1'b0), .CLKOUT(o));\n  reg [23:0] c = 0;\n  always @(posedge o) begin c <= c + 1; led <= c[23]; end\nendmodule\n` },
  dqce: { cst: `${CLK}${LEDS(1)}${PIN('e', 25)}`, cells: { DQCE: 24 },
    text: `module dqce(input clk, input e, output reg [0:0] led);\n  wire o;\n  DQCE u (.CLKIN(clk), .CE(e), .CLKOUT(o));\n  reg [23:0] c = 0;\n  always @(posedge o) begin c <= c + 1; led <= c[23]; end\nendmodule\n` },
};

const COUNT2 = '  reg [1:0] c = 0;\n';
const LVCMOS33 = 'IO_PORT "led[0]" IO_TYPE=LVCMOS33;\n';   // (bank 3's LEDs at the emulated LVDS's 3.3 V)
/** The differential I/O (true LVDS on IOR11, pins 62 / 61; emulated on IOT12, 80 / 79), MIPI, I3C, and the user flash. */
export const DIFF_IO = {
  tlvds: { cst: `${CLK}${LEDS(1)}${PIN('p', 62)}${PIN('n', 61)}`, cells: { TLVDS_OBUF: 2 },
    text: `module tlvds(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  TLVDS_OBUF u (.I(c[1]), .O(p), .OB(n));\nendmodule\n` },
  tlvdst: { cst: `${CLK}${LEDS(1)}${PIN('p', 62)}${PIN('n', 61)}`, cells: { TLVDS_TBUF: 2 }, warnings: [oenDropped('TLVDS_TBUF')],
    text: `module tlvdst(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  TLVDS_TBUF u (.I(c[0]), .OEN(c[1]), .O(p), .OB(n));\nendmodule\n` },
  tlvdsi: { cst: `${CLK}${LEDS(1)}${PIN('p', 62)}${PIN('n', 61)}`, cells: { TLVDS_IBUF: 2 },
    text: `module tlvdsi(input clk, input p, input n, output reg [0:0] led);\n  wire d;\n  TLVDS_IBUF u (.I(p), .IB(n), .O(d));\n  always @(posedge clk) led <= d;\nendmodule\n` },
  elvds: { cst: `${CLK}${LEDS(1)}${LVCMOS33}${PIN('p', 80)}${PIN('n', 79)}`, cells: { ELVDS_OBUF: 2 },
    text: `module elvds(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  ELVDS_OBUF u (.I(c[1]), .O(p), .OB(n));\nendmodule\n` },
  elvdst: { cst: `${CLK}${LEDS(1)}${LVCMOS33}${PIN('p', 80)}${PIN('n', 79)}`, cells: { ELVDS_TBUF: 2 }, warnings: [oenDropped('ELVDS_TBUF')],
    text: `module elvdst(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  ELVDS_TBUF u (.I(c[0]), .OEN(c[1]), .O(p), .OB(n));\nendmodule\n` },
  elvdsi: { cst: `${CLK}${LEDS(1)}${PIN('p', 80)}${PIN('n', 79)}`, cells: { ELVDS_IBUF: 2 },
    text: `module elvdsi(input clk, input p, input n, output reg [0:0] led);\n  wire d;\n  ELVDS_IBUF u (.I(p), .IB(n), .O(d));\n  always @(posedge clk) led <= d;\nendmodule\n` },
  elvdsio: { cst: `${CLK}${LEDS(1)}${LVCMOS33}${PIN('p', 80)}${PIN('n', 79)}`, cells: { ELVDS_IOBUF: 2 }, warnings: [oenDropped('ELVDS_IOBUF')],
    text: `module elvdsio(input clk, inout p, inout n, output reg [0:0] led);\n${COUNT2}  wire o;\n  always @(posedge clk) begin c <= c + 1; led <= o; end\n  ELVDS_IOBUF u (.I(c[0]), .OEN(c[1]), .O(o), .IO(p), .IOB(n));\nendmodule\n` },
  // an ODDR's output on a true LVDS pair
  lvdsddr: { cst: `${CLK}${LEDS(1)}${PIN('p', 62)}${PIN('n', 61)}`, cells: { ODDR: 1, TLVDS_OBUF: 2 },
    text: `module lvdsddr(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  wire q;\n  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  ODDR u (.D0(c[0]), .D1(c[1]), .TX(1'b0), .CLK(clk), .Q0(q), .Q1());\n  TLVDS_OBUF b (.I(q), .O(p), .OB(n));\nendmodule\n` },
  // MIPI's output on the bottom side, its input on the top (its B pin in the next cell's); I3C's buffer
  // (the differential buffers' enables: nextpnr ties them)
  mipio: { cst: `${CLK}${LEDS(1)}${PIN('p', 25)}${PIN('n', 26)}`, cells: { MIPI_OBUF: 3 },
    text: `module mipio(input clk, output p, output n, output reg [0:0] led);\n${COUNT2}  always @(posedge clk) begin c <= c + 1; led <= c[1]; end\n  MIPI_OBUF u (.I(c[0]), .IB(c[1]), .MODESEL(1'b1), .O(p), .OB(n));\nendmodule\n` },
  mipii: { cst: `${CLK}${LEDS(2)}${PIN('p', 86)}${PIN('n', 85)}`, cells: { MIPI_IBUF: 3 },
    text: `module mipii(input clk, inout p, inout n, output reg [1:0] led);\n  wire ol, ob, o;\n  reg r = 0;\n  MIPI_IBUF u (.I(1'b0), .IB(1'b0), .OEN(1'b1), .OENB(1'b1), .HSREN(r), .IO(p), .IOB(n), .OH(o), .OL(ol), .OB(ob));\n  always @(posedge clk) begin r <= ~r; led <= {o ^ ol, ob}; end\nendmodule\n` },
  i3c: { cst: `${CLK}${LEDS(1)}${PIN('q', 25)}`, cells: { I3C_IOBUF: 1 },
    text: `module i3c(input clk, inout q, output reg [0:0] led);\n${COUNT2}  wire o;\n  always @(posedge clk) begin c <= c + 1; led <= o; end\n  I3C_IOBUF u (.I(c[0]), .MODESEL(c[1]), .O(o), .IO(q));\nendmodule\n` },
  flash: { cst: `${CLK}${LEDS(2)}`, cells: { FLASH608K: 1 },
    text: `module flash(input clk, output reg [1:0] led);\n  wire [31:0] dout; reg [5:0] a = 0;\n  FLASH608K u (.XADR({3'b0, a}), .YADR(a), .XE(1'b1), .YE(1'b1), .SE(1'b1), .ERASE(1'b0), .PROG(1'b0), .NVSTR(1'b0), .DIN(32'b0), .DOUT(dout));\n  always @(posedge clk) begin a <= a + 1; led <= {^dout[31:16], ^dout[15:0]}; end\nendmodule\n` },
};

const DSP_CST = `${CLK}${LEDS(6)}`;
const COUNT54 = `  reg [53:0] c = 0;\n  always @(posedge clk) c <= c + 54'h0123456789ABC;\n`;
// out: the output's bus; the LEDs: three of its parts' XORs and three of its bits
const REDUCE = (out, w) => `  always @(posedge clk) led <= {^${out}[${w - 1}:${Math.floor(w * 2 / 3)}], ^${out}[${Math.floor(w * 2 / 3) - 1}:${Math.floor(w / 3)}], ^${out}[${Math.floor(w / 3) - 1}:0], ${out}[${w - 1}], ${out}[${Math.floor(w / 2)}], ${out}[0]};\n`;
const mod = (name, body, out, w) => ({ cst: DSP_CST, cells: { [/^\s*(\w+)/.exec(body)[1]]: 1 }, text: `module ${name}(input clk, output reg [5:0] led);\n${COUNT54}  wire [${w - 1}:0] ${out};\n${body}${REDUCE(out, w)}endmodule\n` });
const ctl = '.CLK(clk), .CE(1\'b1), .RESET(1\'b0)';
/** The DSPs: each fed by a 54-bit counter, its output reduced into the LEDs, registered. */
export const DSP = {
  // A*B + C, no registers
  multalu0: mod('multalu0', `  MULTALU18X18 #(.MULTALU18X18_MODE(0)) u (.A(c[17:0]), .B(c[35:18]), .C(c[53:0]), .D(54'b0), .ASIGN(1'b0), .BSIGN(1'b0), .DSIGN(1'b0), .ACCLOAD(1'b0), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());\n`, 'p', 54),
  // A*B accumulated, every register, synchronous reset
  multalu1: mod('multalu1', `  MULTALU18X18 #(.MULTALU18X18_MODE(1), .AREG(1'b1), .BREG(1'b1), .PIPE_REG(1'b1), .OUT_REG(1'b1), .ASIGN_REG(1'b1), .BSIGN_REG(1'b1), .ACCLOAD_REG0(1'b1), .ACCLOAD_REG1(1'b1))\n    u (.A(c[17:0]), .B(c[35:18]), .C(54'b0), .D(54'b0), .ASIGN(1'b1), .BSIGN(1'b0), .DSIGN(1'b0), .ACCLOAD(c[40]), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());\n`, 'p', 54),
  // A*B + D, its registers, asynchronous reset
  multalu2: mod('multalu2', `  MULTALU18X18 #(.MULTALU18X18_MODE(2), .AREG(1'b1), .DREG(1'b1), .DSIGN_REG(1'b1), .OUT_REG(1'b1), .B_ADD_SUB(1'b1), .MULT_RESET_MODE("ASYNC"))\n    u (.A(c[17:0]), .B(c[35:18]), .C(54'b0), .D(c[53:0]), .ASIGN(1'b0), .BSIGN(1'b0), .DSIGN(1'b0), .ACCLOAD(1'b0), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());\n`, 'p', 54),
  multalu36: mod('multalu36', `  MULTALU36X18 #(.MULTALU36X18_MODE(0), .AREG(1'b1), .OUT_REG(1'b1)) u (.A(c[17:0]), .B(c[53:18]), .C(c[53:0]), .ASIGN(1'b0), .BSIGN(1'b0), .ACCLOAD(1'b0), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());\n`, 'p', 54),
  multaddalu: mod('multaddalu', `  MULTADDALU18X18 #(.MULTADDALU18X18_MODE(0), .A0REG(1'b1), .B1REG(1'b1), .PIPE0_REG(1'b1), .OUT_REG(1'b1), .SOA_REG(1'b1))\n    u (.A0(c[17:0]), .B0(c[35:18]), .A1(c[53:36]), .B1(c[17:0]), .C(c[53:0]), .SIA(18'b0), .SIB(18'b0), .ASIGN(2'b0), .BSIGN(2'b0), .ASEL(2'b0), .BSEL(2'b0), .CASI(55'b0), ${ctl}, .ACCLOAD(1'b0), .DOUT(p), .CASO(), .SOA(), .SOB());\n`, 'p', 54),
  mult36: mod('mult36', `  MULT36X36 #(.AREG(1'b1), .OUT0_REG(1'b1)) u (.A(c[35:0]), .B(c[53:18]), .ASIGN(1'b0), .BSIGN(1'b0), ${ctl}, .DOUT(p));\n`, 'p', 72),
  alu54: mod('alu54', `  ALU54D #(.ALUD_MODE(0), .AREG(1'b1), .OUT_REG(1'b1), .B_ADD_SUB(1'b1), .C_ADD_SUB(1'b0)) u (.A(c[53:0]), .B({c[26:0], c[53:27]}), .ASIGN(1'b0), .BSIGN(1'b0), .ACCLOAD(1'b0), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());\n`, 'p', 54),
  padd9: mod('padd9', `  PADD9 #(.AREG(1'b1), .BSEL_MODE(1'b0)) u (.A(c[8:0]), .B(c[17:9]), .ASEL(1'b0), ${ctl}, .SI(9'b0), .SBI(9'b0), .SO(), .SBO(), .DOUT(p));\n`, 'p', 9),
  padd18: mod('padd18', `  PADD18 #(.BREG(1'b1), .ADD_SUB(1'b1)) u (.A(c[17:0]), .B(c[35:18]), .ASEL(1'b0), ${ctl}, .SI(18'b0), .SBI(18'b0), .SO(), .SBO(), .DOUT(p));\n`, 'p', 18),
  // A0*B0 + A1*B1 accumulated, ACCLOAD and ASEL0 from the fabric, BSEL1 tied high, asynchronous reset
  multaddalu1: mod('multaddalu1', `  MULTADDALU18X18 #(.MULTADDALU18X18_MODE(1), .A1REG(1'b1), .B0REG(1'b1), .PIPE1_REG(1'b1), .ASIGN0_REG(1'b1), .BSIGN1_REG(1'b1), .ACCLOAD_REG0(1'b1), .ACCLOAD_REG1(1'b1), .MULT_RESET_MODE("ASYNC"))
    u (.A0(c[17:0]), .B0(c[35:18]), .A1(c[53:36]), .B1(c[17:0]), .C(54'b0), .SIA(18'b0), .SIB(18'b0), .ASIGN(2'b01), .BSIGN(2'b10), .ASEL({1'b0, c[44]}), .BSEL(2'b10), .CASI(55'b0), ${ctl}, .ACCLOAD(c[41]), .DOUT(p), .CASO(), .SOA(), .SOB());
`, 'p', 54),
  // A*B with every register but the low output's, asynchronous reset
  mult36b: mod('mult36b', `  MULT36X36 #(.BREG(1'b1), .PIPE_REG(1'b1), .OUT1_REG(1'b1), .ASIGN_REG(1'b1), .BSIGN_REG(1'b1), .MULT_RESET_MODE("ASYNC")) u (.A(c[35:0]), .B(c[53:18]), .ASIGN(1'b1), .BSIGN(1'b1), ${ctl}, .DOUT(p));
`, 'p', 72),
  // A + B accumulated, ACCLOAD from the fabric, its registers synchronous
  alu54b: mod('alu54b', `  ALU54D #(.ALUD_MODE(1), .BREG(1'b1), .ASIGN_REG(1'b1), .BSIGN_REG(1'b1), .ACCLOAD_REG(1'b1), .B_ADD_SUB(1'b0), .C_ADD_SUB(1'b0)) u (.A(c[53:0]), .B({c[26:0], c[53:27]}), .ASIGN(1'b1), .BSIGN(1'b0), .ACCLOAD(c[50]), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());
`, 'p', 54),
  // A*B + C accumulated, ACCLOAD from the fabric, registers
  multalu36b: mod('multalu36b', `  MULTALU36X18 #(.MULTALU36X18_MODE(1), .BREG(1'b1), .CREG(1'b1), .PIPE_REG(1'b1), .ASIGN_REG(1'b1), .BSIGN_REG(1'b1), .ACCLOAD_REG0(1'b1)) u (.A(c[17:0]), .B(c[53:18]), .C(c[53:0]), .ASIGN(1'b1), .BSIGN(1'b1), .ACCLOAD(c[47]), .CASI(55'b0), ${ctl}, .DOUT(p), .CASO());
`, 'p', 54),
  // the pre-adders' registers, their shift output registered, a dynamic ASEL
  padd18b: mod('padd18b', `  PADD18 #(.AREG(1'b1), .BREG(1'b1), .SOREG(1'b1), .BSEL_MODE(1'b0), .PADD_RESET_MODE("ASYNC")) u (.A(c[17:0]), .B(c[35:18]), .ASEL(c[49]), ${ctl}, .SI(18'b0), .SBI(18'b0), .SO(), .SBO(), .DOUT(p));
`, 'p', 18),
  // two MULTALU18X18 in one DSP, their registers on two clocks, enables and resets (their control nets' second indexes)
  multalu2clk: { cst: DSP_CST, cells: { MULTALU18X18: 2 }, text: `module multalu2clk(input clk, output reg [5:0] led);
${COUNT54}  reg slow = 0;
  always @(posedge clk) slow <= ~slow;
  wire [53:0] p, q;
  MULTALU18X18 #(.MULTALU18X18_MODE(1), .AREG(1'b1), .OUT_REG(1'b1)) u (.A(c[17:0]), .B(c[35:18]), .C(54'b0), .D(54'b0), .ASIGN(1'b0), .BSIGN(1'b0), .DSIGN(1'b0), .ACCLOAD(1'b1), .CASI(55'b0), .CLK(clk), .CE(1'b1), .RESET(1'b0), .DOUT(p), .CASO());
  MULTALU18X18 #(.MULTALU18X18_MODE(1), .AREG(1'b1), .BREG(1'b1), .OUT_REG(1'b1)) v (.A(c[35:18]), .B(c[53:36]), .C(54'b0), .D(54'b0), .ASIGN(1'b0), .BSIGN(1'b0), .DSIGN(1'b0), .ACCLOAD(1'b1), .CASI(55'b0), .CLK(slow), .CE(c[45]), .RESET(c[46]), .DOUT(q), .CASO());
  wire [53:0] r = p ^ q;
${REDUCE('r', 54)}endmodule
` },
};

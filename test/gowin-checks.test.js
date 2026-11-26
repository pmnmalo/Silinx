// The Gowin's design checks before nextpnr-himbaechel-gowin (#4352, packages/silinx-fpga/src/gowin-checks.js): a CLKDIV2 that is
// not a CLKDIV's only driver (nextpnr stops on it with no ERROR: line, or refuses it), a TLVDS_IOBUF (nextpnr refuses it) refused by
// name before nextpnr runs; a differential tristate's enable (nextpnr drops it) a warning. On Yosys's netlists made by hand, then
// by the flow on the Tang Nano 9K.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gowinChecks } from '../packages/silinx-fpga/src/gowin-checks.js';
import { build, cellCounts } from './gowin-pack-lib.mjs';

// a netlist of cells { name: [type, { pin: bit }, { pin: direction }] }
const netlist = cells => JSON.stringify({ modules: { top: { attributes: { top: 1 }, ports: {}, cells: Object.fromEntries(Object.entries(cells).map(([n, [type, conn, dirs = {}]]) =>
  [n, { type, connections: Object.fromEntries(Object.entries(conn).map(([p, b]) => [p, [b]])), port_directions: dirs }])) } } });
const D2 = { d2: ['CLKDIV2', { HCLKIN: 2, RESETN: 3, CLKOUT: 4 }] };
const CLKDIV = { div: ['CLKDIV', { HCLKIN: 4, RESETN: 3, CALIB: '0', CLKOUT: 5 }] };
const OSER = { u: ['OSER4', { FCLK: 4, PCLK: 5, Q0: 6 }, { FCLK: 'input', PCLK: 'input', Q0: 'output' }] };
const why = 'nextpnr-himbaechel-gowin places a CLKDIV2 only as the only driver of a CLKDIV\'s HCLKIN';

test('a CLKDIV2: as a CLKDIV\'s only driver, or driving nothing, no error; to a serialiser, the fabric or a CLKDIV with other loads, refused', () => {
  assert.deepEqual(gowinChecks(netlist({ ...D2, ...CLKDIV }), 'top'), { errors: [], warnings: [] });
  assert.deepEqual(gowinChecks(netlist({ d2: ['CLKDIV2', { HCLKIN: 2, RESETN: 3, CLKOUT: 4 }] }), 'top'), { errors: [], warnings: [] });
  assert.deepEqual(gowinChecks(netlist({ ...D2, ...OSER }), 'top').errors, [`CLKDIV2 d2: its CLKOUT drives OSER4 u's FCLK: ${why}`]);
  assert.deepEqual(gowinChecks(netlist({ ...D2, ...CLKDIV, ...OSER }), 'top').errors, [`CLKDIV2 d2: its CLKOUT drives CLKDIV div's HCLKIN, OSER4 u's FCLK: ${why}`]);
  // (two CLKDIVs: nextpnr's packer refuses it too)
  assert.deepEqual(gowinChecks(netlist({ ...D2, ...CLKDIV, div2: ['CLKDIV', { HCLKIN: 4, CLKOUT: 7 }] }), 'top').errors,
    [`CLKDIV2 d2: its CLKOUT drives CLKDIV div's HCLKIN, CLKDIV div2's HCLKIN: ${why}`]);
  // the fabric's flip-flops: the first four named
  const ffs = Object.fromEntries([0, 1, 2, 3, 4].map(i => [`ff${i}`, ['DFF', { CLK: 4, D: 10 + i, Q: 20 + i }, { CLK: 'input', D: 'input', Q: 'output' }]]));
  assert.deepEqual(gowinChecks(netlist({ ...D2, ...ffs }), 'top').errors,
    [`CLKDIV2 d2: its CLKOUT drives DFF ff0's CLK, DFF ff1's CLK, DFF ff2's CLK, DFF ff3's CLK, …: ${why}`]);
});

test('TLVDS_IOBUF refused; a differential tristate\'s enable a warning, unless tied to 0; MIPI\'s and the single buffers\' none', () => {
  assert.deepEqual(gowinChecks(netlist({ u: ['TLVDS_IOBUF', { I: 2, OEN: 3, O: 4, IO: 5, IOB: 6 }] }), 'top').errors,
    ['TLVDS_IOBUF u: nextpnr-himbaechel-gowin has no true LVDS bidirectional buffer on this device']);
  const warned = type => `${type} u: its enable (OEN) is not in the bitstream (nextpnr-himbaechel-gowin drops it): the pair always drives.`;
  for (const type of ['TLVDS_TBUF', 'ELVDS_TBUF', 'ELVDS_IOBUF']) {
    assert.deepEqual(gowinChecks(netlist({ u: [type, { I: 2, OEN: 3 }] }), 'top'), { errors: [], warnings: [warned(type)] }, type);
    assert.deepEqual(gowinChecks(netlist({ u: [type, { I: 2, OEN: '1' }] }), 'top'), { errors: [], warnings: [warned(type)] }, `${type} 1`);
    assert.deepEqual(gowinChecks(netlist({ u: [type, { I: 2, OEN: '0' }] }), 'top'), { errors: [], warnings: [] }, `${type} 0`);
  }
  for (const type of ['TBUF', 'IOBUF', 'TLVDS_OBUF', 'MIPI_OBUF']) assert.deepEqual(gowinChecks(netlist({ u: [type, { I: 2, OEN: 3 }] }), 'top'), { errors: [], warnings: [] }, type);
});

// the flow on the Tang Nano 9K: an rPLL's output halved by a CLKDIV2
const CST = 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "q" 25;\n';
const PORTS = ".RESET(1'b0), .RESET_P(1'b0), .CLKFB(1'b0), .FBDSEL(6'b0), .IDSEL(6'b0), .ODSEL(6'b0), .PSDA(4'b0), .DUTYDA(4'b0), .FDLY(4'b0)";
const head = name => `module ${name}(input clk, output q, output reg [0:0] led);\n  wire fclk, hclk, pclk, lock;\n`
  + `  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(3), .ODIV_SEL(4), .DYN_SDIV_SEL(4), .DEVICE("GW1NR-9C")) pll (.CLKIN(clk), .CLKOUT(fclk), .CLKOUTD(pclk), .LOCK(lock), ${PORTS});\n`
  + '  CLKDIV2 d2 (.HCLKIN(fclk), .RESETN(lock), .CLKOUT(hclk));\n  reg [3:0] c = 0;\n';
const oser = "  OSER4 u (.D0(c[0]), .D1(c[1]), .D2(c[2]), .D3(c[3]), .TX0(1'b0), .TX1(1'b0), .PCLK(pclk), .FCLK(hclk), .RESET(1'b0), .Q0(q), .Q1());\n";
const DESIGNS = {
  // a CLKDIV2 before a CLKDIV, the CLKDIV's output the fabric's clock: placed and routed
  clkdiv2: `${head('clkdiv2').replace(', .CLKOUTD(pclk)', '')}  CLKDIV #(.DIV_MODE("2")) div (.HCLKIN(hclk), .RESETN(lock), .CALIB(1'b0), .CLKOUT(pclk));\n`
    + '  always @(posedge pclk) begin c <= c + 1; led <= c[3]; end\n  assign q = c[0];\nendmodule\n',
  // a CLKDIV2 to a serialiser's FCLK (nextpnr's HCLK placer stopped on it), to the fabric (its router stopped)
  oser: `${head('oser')}  always @(posedge pclk) begin c <= c + 1; led <= c[3]; end\n${oser}endmodule\n`,
  fabric: `${head('fabric')}  always @(posedge hclk) begin c <= c + 1; led <= c[3]; end\n  assign q = c[0];\nendmodule\n`,
  tlvdsio: 'module tlvdsio(input clk, inout p, inout n, output reg [0:0] led);\n  reg [1:0] c = 0;\n  wire o;\n  always @(posedge clk) begin c <= c + 1; led <= o; end\n'
    + '  TLVDS_IOBUF u (.I(c[0]), .OEN(c[1]), .O(o), .IO(p), .IOB(n));\nendmodule\n',
};

test('the flow: a CLKDIV2 before a CLKDIV built, nextpnr\'s one fallback; to a serialiser or the fabric, or a TLVDS_IOBUF, refused before nextpnr', { timeout: 300000 }, async () => {
  const ok = await build('clkdiv2', { text: DESIGNS.clkdiv2, cst: CST });
  assert.ok(ok.r.ok, ok.r.error);
  // (nextpnr routes the PLL's clock to the CLKDIV2 through the general routing where its dedicated routing did not reach: placed
  // so with Yosys 0.71's netlist, none with 0.70's, #5634)
  assert.deepEqual(ok.log.filter(l => /warning/i.test(l)),
    ["WARNING:Place - Failed to route net 'fclk' from X44Y9/F4 to X46Y18/CLKDIV2_HCLK0_SECT1_HCLKIN using dedicated routing."]);
  assert.deepEqual(cellCounts(ok.files['open/routed.json'], ['CLKDIV2', 'CLKDIV', 'rPLL']), { CLKDIV2: 1, CLKDIV: 1, rPLL: 1 });
  assert.ok(ok.files['clkdiv2.fs'].length > 0);
  const refused = async (name, cst = CST) => {
    const { r, log } = await build(name, { text: DESIGNS[name], cst });
    assert.equal(r.ok, false, name);
    assert.ok(!log.some(l => /nextpnr-himbaechel-gowin failed|Placed and routed/.test(l)), `${name}: nextpnr ran`);
    assert.deepEqual(log.filter(l => /warning|error/i.test(l)), [`ERROR:Silinx - ${r.error}`], name);
    return r.error;
  };
  assert.equal(await refused('oser'), `CLKDIV2 d2: its CLKOUT drives OSER4 u's FCLK: ${why}`);
  assert.match(await refused('fabric'), new RegExp(`^CLKDIV2 d2: its CLKOUT drives (DFF\\w* \\S+'s CLK, ){4}…: ${why.replace(/'/g, '.')}$`));
  assert.equal(await refused('tlvdsio', 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "p" 62;\nIO_LOC "n" 61;\n'),
    'TLVDS_IOBUF u: nextpnr-himbaechel-gowin has no true LVDS bidirectional buffer on this device');
});

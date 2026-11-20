// The Spartan-6's placement with Silinx's Map (#729, #4776): packages/silinx-fpga/src/fpga/s6/phys.js (the physical
// design of a packed netlist), sites.js (the device's sites), fixed-sites.js (the pads with a LOC, the global buffers, the
// BSCANs: Silinx's rules, its errors and warnings), and nextpnr's placement of the rest (test/s6-lib.mjs s6PlaceNextpnr, as
// the flow's Place & Route places it; Silinx's own placer, fpga/s6/place.js, removed), on small designs and on every
// example on the Nexys3's XC6SLX16 and the Atlys's XC6SLX45: every instance on a site of its kind, one a site, the fixed
// ones kept, the carry chains up their columns, the same placement for a seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedSitesS6, PlaceError } from '../packages/silinx-fpga/src/fpga/s6/fixed-sites.js';
import { PhysError } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { S6_EXAMPLES as EXAMPLES } from './examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example, s6Phys, s6PlaceNextpnr, s6Verilog } from './s6-lib.mjs';

const LX16 = 'xc6slx16csg324-3', LX45 = 'xc6slx45csg324-3';
// the placement (nextpnr's, the fixed sites Silinx's) and its errors against the rules: { r: { site, warnings }, errors, sites }
async function placed(d, part = LX16, { seed = 1 } = {}) {
  const { sites } = s6Device(part), { warnings } = fixedSitesS6(d.phys, sites);
  const r = { ...await s6PlaceNextpnr(d, part, { seed }), warnings };
  const errors = rules(d.phys, sites, r.site);
  assert.deepEqual(errors, [], errors.join('\n'));
  return { r, sites };
}
// the rules of a placement: every instance on a site of its kind (a SLICEM one on a SLICEM, a SLICEL one on a SLICEL or
// a SLICEM; an IOB on a bonded pad, a BUFGMUX on one of the 16), one a site, each carry chain's next stage on the slice
// above the one below it
function rules(phys, sites, site) {
  const out = [], owner = new Map(), bufgs = new Set(sites.bufgs.map(b => b.name));
  phys.insts.forEach((inst, i) => {
    const s = site[i];
    if (owner.has(s)) out.push(`${inst.name}: ${s} is ${owner.get(s)}'s`);
    owner.set(s, inst.name);
    if (inst.kind === 'slice') {
      const k = sites.slices.get(s)?.kind, need = inst.type.slice(5);
      if (!k || !(need === 'X' || need === k || (need === 'L' && k === 'M'))) out.push(`${inst.name} (${inst.type}) on ${s}`);
    } else if (inst.kind === 'iob' && !sites.pads.has(s)) out.push(`${inst.name}: ${s} is no bonded pad`);
    else if (inst.kind === 'bufg' && !bufgs.has(s)) out.push(`${inst.name}: ${s} is no BUFGMUX`);
  });
  for (const ch of phys.chains) for (let k = 1; k < ch.length; k++) {
    if (phys.insts[ch[k]].kind !== 'slice') continue;
    if (sites.slices.get(site[ch[k - 1]])?.above !== site[ch[k]]) out.push(`${phys.insts[ch[k]].name}: not above ${phys.insts[ch[k - 1]].name}`);
  }
  return out;
}
const ucfOf = lines => lines.map(([net, loc, std]) => `NET "${net}" LOC = "${loc}"${std ? ` | IOSTANDARD = ${std}` : ''} ;`).join('\n');

test('the sites of both parts: slices by kind, the carry chain\'s next stage from the graph, the pads and their clock buffers', () => {
  for (const [part, slices, pads, brams, dsps] of [[LX16, 2278, 232, 32, 32], [LX45, 6822, 218, 116, 58]]) {
    const { sites } = s6Device(part);
    const kinds = { X: 0, L: 0, M: 0 };
    for (const s of sites.slices.values()) kinds[s.kind]++;
    assert.equal(sites.slices.size, slices, part);
    assert.deepEqual([sites.pads.size, sites.bufgs.length, sites.brams.length, sites.dsps.length], [pads, 16, brams, dsps], part);
    // (every SLICEL / SLICEM chains to a slice above it in its column, but the top ones; SLICEX have no carry)
    for (const s of sites.slices.values()) {
      if (s.kind === 'X') { assert.equal(s.above, null, s.name); continue; }
      if (s.above) { const u = sites.slices.get(s.above); assert.equal(u.x, s.x, s.name); assert.ok(u.y > s.y && u.y <= s.y + 3, `${s.name} -> ${s.above}`); }
    }
    // the 32 clock-capable pads (GCLK) of the CSG324, each with its BUFGMUX; the boards' clock pins
    assert.equal([...sites.pads.values()].filter(p => p.bufg.length).length, 32, part);
    assert.deepEqual(sites.pads.get('V10').bufg, ['BUFGMUX_X3Y13'], 'the Nexys3\'s clock: ISE\'s buffer (night 1)');
    assert.deepEqual(sites.pads.get('L15').bufg, ['BUFGMUX_X2Y4'], 'the Atlys\'s clock');
    assert.deepEqual(new Set([...sites.pads.values()].map(p => p.bank)), new Set([0, 1, 2, 3]));
  }
  const s = s6Device(LX16).sites;
  assert.deepEqual([s.slices.get('SLICE_X16Y31').above, s.slices.get('SLICE_X16Y61').above], ['SLICE_X16Y33', null], 'a gap in the column; its top');
});

test('a 16-bit accumulator: its physical pins (the LUTs on A1 …, DI by AX …, CIN / COUT); nextpnr places its carry chain up one column', async () => {
  const nl = await s6Verilog('module m(input clk, input [15:0] d, output reg [15:0] q); always @(posedge clk) q <= q + d; endmodule');
  const d = s6Phys(nl);
  const { phys } = d;
  assert.deepEqual(phys.chains.length, 1);
  assert.deepEqual(phys.chains[0].map(i => phys.insts[i].type), ['SLICEL', 'SLICEL', 'SLICEL', 'SLICEL']);
  // the carry between stages: COUT -> CIN, a net of its own
  const cin = phys.nets.filter(n => n.driver?.pin === 'COUT');
  assert.deepEqual(cin.map(n => [n.driver.inst, n.loads]), [0, 1, 2].map(k => [phys.chains[0][k], [{ inst: phys.chains[0][k + 1], pin: 'CIN' }]]));
  // each stage: 4 LUT2 (d xor q) on A1 A2 …, the addend by the bypass inputs, the clock
  for (const i of phys.chains[0]) {
    const pins = new Set(phys.nets.flatMap(n => n.loads.filter(l => l.inst === i).map(l => l.pin)));
    for (const p of ['A', 'B', 'C', 'D']) { assert.ok(pins.has(`${p}1`) && pins.has(`${p}2`) && pins.has(`${p}X`), `${i} ${p}`); assert.ok(!pins.has(`${p}3`)); }
    assert.ok(pins.has('CLK'));
    assert.ok(!pins.has('CE') && !pins.has('SR'), 'no enable, no reset');
  }
  // the clock: from the BUFGMUX, a clock net
  assert.deepEqual(phys.nets.filter(n => n.clock).map(n => [phys.insts[n.driver.inst].type, n.driver.pin, n.loads.length]), [['BUFGMUX', 'O', 4]]);
  const { r, sites } = await placed(d);
  assert.deepEqual(r.warnings, []);
  const ss = phys.chains[0].map(i => sites.slices.get(r.site[i]));
  for (let k = 1; k < 4; k++) assert.equal(ss[k - 1].above, ss[k].name);
  assert.ok(ss.every(s => s.kind === 'L' || s.kind === 'M'));
});

test('I/Os on their LOC pads, the clock on its pad\'s buffer; a clock input with no LOC on a clock-capable pad; nextpnr keeps them', async () => {
  const nl = await s6Verilog('module m(input clk, input a, input b, output reg y); always @(posedge clk) y <= a ^ b; endmodule');
  // (no LOC for clk: the placer takes a GCLK pad)
  let d = s6Phys(nl, ucfOf([['a', 'T10'], ['b', 'T9'], ['y', 'U16']]));
  let { r, sites } = await placed(d);
  assert.deepEqual(r.warnings, []);
  const at = name => r.site[d.phys.insts.findIndex(i => i.name === name)];
  assert.deepEqual(['a', 'b', 'y'].map(at), ['T10', 'T9', 'U16']);
  const clkPad = sites.pads.get(at('clk'));
  assert.ok(clkPad.bufg.length, 'a GCLK pin');
  assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], clkPad.bufg[0]);
  // the Nexys3's clock pin
  d = s6Phys(nl, ucfOf([['clk', 'V10'], ['a', 'T10'], ['b', 'T9'], ['y', 'U16']]));
  ({ r } = await placed(d));
  assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], 'BUFGMUX_X3Y13');
  // a clock on a pin no dedicated path leaves: general routing to a buffer, a warning
  // (U16, an LED's: no GCLK)
  d = s6Phys(nl, ucfOf([['clk', 'U16'], ['a', 'V10'], ['b', 'T9'], ['y', 'V16']]));
  ({ r } = await placed(d));
  assert.deepEqual(r.warnings, ['clk: the clock enters on pad U16, not a clock-capable pin (GCLK): its global buffer BUFGMUX_X2Y3 is reached through general routing']);
});

test('fixedSitesS6\'s errors (Silinx\'s placer\'s): a LOC that is no pad, two ports on one pad, banks of two VCCO; the cells phys has no site for', async () => {
  const nl = await s6Verilog('module m(input a, input b, output y, output z); assign y = a & b; assign z = a | b; endmodule');
  const err = (ucf, re) => assert.throws(() => fixedSitesS6(s6Phys(nl, ucf).phys, s6Device(LX16).sites), e => e instanceof PlaceError && re.test(e.message), String(re));
  err(ucfOf([['a', 'Z99']]), /^place: a: LOC Z99 is not a bonded pad of xc6slx16csg324-3$/);
  err(ucfOf([['a', 'T10'], ['b', 'T10']]), /^place: two ports on pad T10 \(a, b\)$/);
  // (T10 and U16: bank 2, the bottom)
  err(ucfOf([['a', 'T10', 'LVCMOS33'], ['y', 'U16', 'LVCMOS18']]), /^place: y: pad U16 is in bank 2, whose other I\/Os need VCCO 3.3 V, not 1.8 V \(I\/O standards\)$/);
  // (I/O standards of one VCCO in a bank: legal; the free I/Os keep to the banks of their VCCO)
  const d = s6Phys(nl, ucfOf([['a', 'T10', 'LVCMOS33'], ['b', 'T9', 'LVTTL']]));
  const { r } = await placed(d);
  assert.deepEqual(r.warnings, []);
  // a cell of a site the placer has none for yet (a BUFIO2, as the packer counts it)
  const odd = { ...nl, cells: [...nl.cells, { name: 'u_io', type: 'BUFIO2', params: {}, attrs: {}, pins: {}, dirs: {} }] };
  assert.throws(() => s6Phys(odd), e => e instanceof PhysError && e.message === 'the Spartan-6 design cannot be placed: u_io (BUFIO2): the Spartan-6 placer has no site for it yet (#729)');
});

test('a shift register takes a SLICEM, its pins the SLICEM\'s (the data on DI or DX, the clock enable on CE, as ISE\'s WEMUX::CE, #1153)', async () => {
  const nl = await s6Verilog('module m(input clk, input e, input d, output q); reg [19:0] s; always @(posedge clk) if (e) s <= {s[18:0], d}; assign q = s[19]; endmodule');
  const d = s6Phys(nl);
  const m = d.phys.insts.filter(i => i.type === 'SLICEM');
  assert.equal(m.length, 1);
  const pins = new Set(d.phys.nets.flatMap(n => n.loads.filter(l => d.phys.insts[l.inst].type === 'SLICEM').map(l => l.pin)));
  assert.ok(pins.has('CLK') && pins.has('CE') && !pins.has('WE'), [...pins].join(' '));
  // (the data on AI … DI for a 16-bit one, on AX … DX for SRLC32E, as ISE's)
  const srl = nl.cells.find(c => /^SRL/.test(c.type));
  assert.ok([...pins].some(p => (srl.type === 'SRLC32E' ? /^[A-D]X$/ : /^[A-D]I$/).test(p)), `the data input of ${srl.type}`);
  const { r, sites } = await placed(d);
  assert.equal(sites.slices.get(r.site[d.phys.insts.findIndex(i => i.type === 'SLICEM')]).kind, 'M');
});

test('#4950 the ports without a LOC of Silinx\'s Map on bonded pads (nextpnr took unbonded ones, PAD131), of their bank\'s VCCO; none left: an error', async () => {
  // (a 16-bit accumulator with no UCF: its 33 ports all free)
  const nl = await s6Verilog('module m(input clk, input [15:0] d, output reg [15:0] q); always @(posedge clk) q <= q + d; endmodule');
  const d = s6Phys(nl);
  const { sites } = s6Device(LX16), { fixed } = fixedSitesS6(d.phys, sites);
  const iobs = d.phys.insts.filter(i => i.kind === 'iob');
  assert.equal(iobs.length, 33);
  assert.ok(iobs.every(i => sites.pads.has(fixed.get(i.name))), 'every port on a bonded pad');
  const { r } = await placed(d);
  d.phys.insts.forEach((inst, i) => { if (inst.kind === 'iob') assert.equal(r.site[i], fixed.get(inst.name), `${inst.name}: nextpnr keeps it`); });
  assert.ok(!r.site.some(s => /^PAD\d/.test(s)));
  // (bank 2 at 3.3 V by T10: the free 1.8 V ports elsewhere)
  const nl2 = await s6Verilog('module m(input a, input [3:0] b, output [3:0] y); assign y = b ^ {4{a}}; endmodule');
  const d2 = s6Phys(nl2, `NET "a" LOC = "T10" | IOSTANDARD = LVCMOS33 ;\n${['b', 'y'].map(n => `NET "${n}<*>" IOSTANDARD = LVCMOS18 ;`).join('\n')}`);
  const f2 = fixedSitesS6(d2.phys, sites).fixed;
  for (const inst of d2.phys.insts.filter(i => i.kind === 'iob' && !i.loc)) {
    assert.equal(inst.cons?.iostandard, 'LVCMOS18', inst.name);
    assert.notEqual(sites.pads.get(f2.get(inst.name)).bank, 2, inst.name);
  }
  // (more ports than pads)
  const many = s6Phys(await s6Verilog('module m(input [299:0] d, output [299:0] q); assign q = ~d; endmodule'));
  assert.throws(() => fixedSitesS6(many.phys, sites), e => e instanceof PlaceError && /^place: no free pad for /.test(e.message));
});

test('every example placed by nextpnr on the XC6SLX16 and the XC6SLX45: the rules, no warnings, the UCF\'s pins, the clock on its pin\'s buffer, the same placement for a seed', { timeout: 600000 }, async () => {
  for (const { board, part } of S6_BOARDS) {
    for (const name of EXAMPLES) {
      const d = await s6Example(name, board);
      const { r } = await placed(d, part, { seed: 1 });
      assert.deepEqual(r.warnings, [], `${board} ${name}`);
      d.phys.insts.forEach((inst, i) => { if (inst.loc) assert.equal(r.site[i], inst.loc, `${board} ${name} ${inst.name}`); });
      if (name !== 'gates') assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], board === 'nexys3' ? 'BUFGMUX_X3Y13' : 'BUFGMUX_X2Y4', `${board} ${name}`);
      if (name === 'pong') {
        assert.deepEqual((await placed(d, part, { seed: 1 })).r.site, r.site, `${board} ${name}: deterministic`);
        assert.notDeepEqual((await placed(d, part, { seed: 2 })).r.site, r.site, 'another seed, another placement');
      }
    }
  }
});

// The compiled simulator's tristate pins (#4709, core/compiled-inout.js): a top-level inout port as its input, its
// output and its enable, a tristate output port as its output and its enable. Each design is checked cycle by cycle
// against the event-driven simulator of a harness: the design in it, the outside driving its pins (an external
// device on a bus, a pull-up and a device pulling an open-drain line low), the pin's resolved level read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { compileDesign, compileNetlist, CompileError } from '../core/compiled-sim.js';
import { splitPads } from '../core/compiled-inout.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { designOf, rng } from './compiled-diff.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = 20000, EARLY = 40;
const src = (p, text) => ({ path: p, lang: /\.vhd$/.test(p) ? 'vhdl' : 'verilog', role: 'design', text });

/**
 * The compiled design `top` against the event-driven simulator of its harness `htop`, cycle by cycle (the timing of
 * test/compiled-diff.js diffCycles). inputs(k): the harness's inputs of cycle k; set(vals): the compiled design's
 * inputs from them (its pins' outside levels too); expect(sim, vals): { harness output: the compiled design's value }.
 * Compared: the harness's known bits. -> { bits, mismatches }
 */
async function againstHarness({ sources, top, harness, htop, cycles = 400, inputs, set, expect }) {
  const sim = await compileDesign(designOf(sources, top), { run: yosysNode });
  const des = designOf([...sources, ...harness], htop);
  const ev = new Simulator(des, {});
  const port = new Map(des.top.ports.map(p => [p.name, p]));
  const apply = vals => {
    for (const [name, v] of Object.entries(vals)) ev.force(port.get(name).sig, V.fromInt(v, port.get(name).sig.t.w, false));
    for (const [name, v] of Object.entries(set(vals))) sim.set(name, v);
  };
  ev.addClock(port.get('clk').sig, { period: P });
  let vals = inputs(0), bits = 0;
  const mismatches = [];
  apply(vals);
  sim.reset();
  ev.run(0);
  for (let k = 0; k < cycles && mismatches.length < 10; k++) {
    if (k) { ev.run(k * P + P / 2 - EARLY); vals = inputs(k); apply(vals); }
    ev.run((k + 1) * P + P / 2 - EARLY - 1);
    sim.cycle(1);
    for (const [name, c] of Object.entries(expect(sim, vals))) {
      const e = port.get(name).sig.val, known = ((1n << BigInt(e.w)) - 1n) & ~e.x;
      for (let i = 0n; i < BigInt(e.w); i++) if ((known >> i) & 1n) bits++;
      if ((e.v & known) !== (BigInt(c) & known)) mismatches.push({ cycle: k, port: name, event: V.toBin(e), compiled: BigInt(c).toString(2) });
    }
  }
  return { sim, bits, mismatches };
}
// random inputs: each of `widths` changed with probability p
const randomly = (widths, { p = 0.4, seed = 3 } = {}) => {
  const r = rng(seed), cur = {};
  return k => {
    for (const [n, w] of Object.entries(widths)) if (k === 0 || r() < p) cur[n] = Math.floor(r() * 2 ** w);
    return { ...cur };
  };
};
// the pin's level: the design's output where it drives it, the outside's elsewhere
const level = (sim, pin, outside) => (sim.get(pin) & sim.get(`${pin}:en`)) | (BigInt(outside) & ~sim.get(`${pin}:en`));

test('a bidirectional bus and a tristate output (VHDL, the open synthesis\'s tristate design): against its harness, no warnings', async () => {
  const dir = path.join(ROOT, 'test/fixtures/designs/tristate');
  const sources = [src('top.vhd', fs.readFileSync(path.join(dir, 'top.vhd'), 'utf8'))];
  const harness = [src('harness.vhd', fs.readFileSync(path.join(dir, 'harness.vhd'), 'utf8'))];
  const r = await againstHarness({ sources, top: 'top', harness, htop: 'harness', inputs: randomly({ oe: 1, oe2: 1, dout: 8, ext_val: 8 }),
    // (the external device drives ext_val where the design does not drive the bus)
    set: v => ({ oe: v.oe, oe2: v.oe2, dout: v.dout, io: v.ext_val }),
    expect: (sim, v) => ({ din_r: sim.get('din_r'), bus_o: level(sim, 'io', v.ext_val), z: sim.get('z') }) });
  assert.deepEqual(r.mismatches, []);
  assert.ok(r.bits > 4000, `${r.bits} bits compared`);
  assert.deepEqual(r.sim.warnings, []);
  // the pads: io's input, output and enable; z's output and enable
  assert.deepEqual(r.sim.model.pads.map(p => [p.name, p.dir, p.en.length]), [['io', 'inout', 8], ['z', 'output', 4]]);
  r.sim.set('oe', 1); r.sim.set('dout', 0xa5); r.sim.set('io', 0x3c); r.sim.cycle(1);
  assert.equal(r.sim.get('io'), 0xa5n);
  assert.equal(r.sim.get('io:en'), 0xffn);
  assert.equal(r.sim.get('din_r'), 0xa5n);
  r.sim.set('oe', 0); r.sim.cycle(1);
  assert.equal(r.sim.get('io'), 0n, 'not driven: 0');
  assert.equal(r.sim.get('io:en'), 0n);
  assert.equal(r.sim.get('din_r'), 0x3cn, 'the outside\'s level read');
});

// an open-drain line (an I²C slave's SDA): the design pulls it low or lets it go, a pull-up and a device outside
const OD_V = `module od(input clk, input pull, inout sda, output reg [7:0] sh);
  reg p = 0;
  assign sda = p ? 1'b0 : 1'bz;
  always @(posedge clk) begin p <= pull; sh <= {sh[6:0], sda}; end
endmodule`;
const ODH_V = `module odh(input clk, input pull, input ext, output [7:0] sh, output line);
  tri1 sda;
  assign sda = ext ? 1'bz : 1'b0;
  od u (.clk(clk), .pull(pull), .sda(sda), .sh(sh));
  assign line = sda;
endmodule`;
const OD_VHD = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity od is port (clk, pull : in std_logic; sda : inout std_logic; sh : out std_logic_vector(7 downto 0)); end;
architecture rtl of od is
  signal p : std_logic := '0';
  signal s : std_logic_vector(7 downto 0) := (others => '0');
begin
  sda <= '0' when p = '1' else 'Z';
  process (clk) begin
    if rising_edge(clk) then p <= pull; s <= s(6 downto 0) & to_x01(sda); end if;
  end process;
  sh <= s;
end;`;
const ODH_VHD = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity odh is port (clk, pull, ext : in std_logic; sh : out std_logic_vector(7 downto 0); line : out std_logic); end;
architecture sim of odh is
  signal sda : std_logic;
begin
  sda <= 'H';
  sda <= '0' when ext = '0' else 'Z';
  u : entity work.od port map (clk => clk, pull => pull, sda => sda, sh => sh);
  line <= to_x01(sda);
end;`;
for (const [lang, od, odh] of [['Verilog', src('od.v', OD_V), src('odh.v', ODH_V)], ['VHDL', src('od.vhd', OD_VHD), src('odh.vhd', ODH_VHD)]]) {
  test(`an open-drain line with a pull-up (${lang}): against its harness, no warnings`, async () => {
    const r = await againstHarness({ sources: [od], top: 'od', harness: [odh], htop: 'odh', cycles: 600, inputs: randomly({ pull: 1, ext: 1 }, { p: 0.3 }),
      // (the outside's level: the pull-up's 1, or 0 where the device outside pulls it low)
      set: v => ({ pull: v.pull, sda: v.ext }),
      expect: (sim, v) => ({ sh: sim.get('sh'), line: level(sim, 'sda', v.ext) }) });
    assert.deepEqual(r.mismatches, []);
    assert.ok(r.bits > 5000, `${r.bits} bits compared`);
    assert.deepEqual(r.sim.warnings, []);
    // its output always 0 (it only pulls low), its enable the register p
    r.sim.set('pull', 1); r.sim.set('sda', 1); r.sim.cycle(1);
    assert.deepEqual([r.sim.get('sda'), r.sim.get('sda:en')], [0n, 1n]);
    r.sim.set('pull', 0); r.sim.cycle(1);
    assert.deepEqual([r.sim.get('sda'), r.sim.get('sda:en')], [0n, 0n]);
  });
}

test('an inout port only read, only driven, and a bus of both (Verilog): its enable 0, 1 and per bit', async () => {
  const text = `module mix(input [1:0] oe, input [1:0] d, inout r, inout w, inout [1:0] b, output q, output [1:0] qb);
    assign w = d[0]; assign q = r;
    assign b[0] = oe[0] ? d[0] : 1'bz; assign b[1] = oe[1] ? 1'bz : d[1]; assign qb = b;
  endmodule`;
  const sim = await compileDesign(designOf([src('mix.v', text)], 'mix'), { run: yosysNode });
  assert.deepEqual(sim.warnings, []);
  assert.deepEqual(sim.model.inputs.map(i => i.name).sort(), ['b', 'd', 'oe', 'r', 'w']);
  for (let k = 0; k < 64; k++) {
    const oe = k & 3, d = (k >> 2) & 3, r = (k >> 4) & 1, b = (k >> 5) & 1 ? 3 : 0;
    Object.entries({ oe, d, r, b, w: 1 - (d & 1) }).forEach(([n, v]) => sim.set(n, v));
    sim.cycle(0);
    const en = (oe & 1) | ((oe & 2) ? 0 : 2);
    assert.deepEqual([sim.get('r:en'), sim.get('w:en'), sim.get('w'), sim.get('q'), sim.get('b:en'), sim.get('b'), sim.get('qb')],
      [0n, 1n, BigInt(d & 1), BigInt(r), BigInt(en), BigInt(d & en), BigInt((d & en) | (b & ~en))], `k = ${k}`);
  }
});

test('a tristate that drives the design\'s own nets: its \'Z\' as 0 with a warning, as before; one that drives a pin and a net: not compiled', async () => {
  const inner = await compileDesign(designOf([src('inner.v', "module inner(input en, d, output q); wire t; assign t = en ? d : 1'bz; assign q = t & d; endmodule")], 'inner'), { run: yosysNode });
  assert.deepEqual(inner.warnings, ["a high-impedance value ('Z') is 0 in the compiled simulator"]);
  assert.deepEqual(inner.model.pads, []);
  // (a netlist whose tristate drives an inout port's bit and a net of the design: Yosys's own netlists keep them apart)
  const mod = { ports: { en: { direction: 'input', bits: [2] }, d: { direction: 'input', bits: [3] }, p: { direction: 'inout', bits: [4] }, q: { direction: 'output', bits: [5] } },
    cells: { t: { type: '$mux', parameters: { WIDTH: 2 }, port_directions: { A: 'input', B: 'input', S: 'input', Y: 'output' }, connections: { A: ['z', 'z'], B: [3, 3], S: [2], Y: [4, 6] } },
    a: { type: '$and', parameters: { A_WIDTH: 1, B_WIDTH: 1, Y_WIDTH: 1 }, port_directions: { A: 'input', B: 'input', Y: 'output' }, connections: { A: [6], B: [3], Y: [5] } } }, netnames: {} };
  assert.throws(() => splitPads(mod), { name: 'Error', message: "the tristate 't' drives a pin and the design's own nets: not compiled" });
  assert.throws(() => compileNetlist({ modules: { m: mod } }, { top: 'm' }), CompileError);
  // a design with no tristate port: its module as it is
  const plain = { ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [2] } }, cells: {}, netnames: {} };
  assert.equal(splitPads(plain).mod, plain);
});

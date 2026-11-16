// The Spartan-6's Map by nextpnr (#3138, packages/silinx-fpga/src/fpga/s6/nextpnr-pack.js): the netlist's cells by name
// (the order of the fork's packer, so that Silinx's Map names its sites alike), Yosys's netlist for the fork (each I/O
// buffer with its port and constraints), and the check that the fork packed the sites of Silinx's Map; the option
// (s6MapOf) and the flow's netlist sorted only with it (open-flow-backends.js); #3151's product of two counters through
// nextpnr's Map, the application's flow on a Nexys3 project (#3743).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { silinxFlow } from './examples-lib.mjs';
import { sortedNetlistText, packInput, packedSites, samePacking } from '../packages/silinx-fpga/src/fpga/s6/nextpnr-pack.js';
import { s6MapOf } from '../packages/silinx-fpga/src/parts.js';
import { packS6 } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { physS6 } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { readConstraints, UCF as UCF_FORMAT } from '../packages/silinx-fpga/src/constraints.js';

const T = '00000000000000000000000000000001';
// a little netlist of Yosys's synth_xilinx -family xc6s: a and b into an AND (a LUT2) to y, its cells in no order
function netlist() {
  const cell = (type, conns, dirs, attributes = {}) => ({ hide_name: 0, type, parameters: {}, attributes, port_directions: dirs, connections: conns });
  return { creator: 'Yosys', modules: {
    other: { attributes: {}, ports: {}, cells: { z: cell('LUT1', { I0: [9], O: [10] }, { I0: 'input', O: 'output' }), a: cell('LUT1', { I0: [10], O: [9] }, { I0: 'input', O: 'output' }) }, netnames: {} },
    top: { attributes: { top: T }, ports: { a: { direction: 'input', bits: [2] }, b: { direction: 'input', bits: [3] }, y: { direction: 'output', bits: [4] } },
      cells: {
        y_OBUF_inst: cell('OBUF', { I: [7], O: [4] }, { I: 'input', O: 'output' }),
        b_IBUF_inst: cell('IBUF', { I: [3], O: [6] }, { I: 'input', O: 'output' }),
        y_LUT2: cell('LUT2', { I0: [5], I1: [6], O: [7] }, { I0: 'input', I1: 'input', O: 'output' }, { src: 'top.v:3' }),
        a_IBUF_inst: cell('IBUF', { I: [2], O: [5] }, { I: 'input', O: 'output' }),
      },
      netnames: { a: { bits: [2] }, b: { bits: [3] }, y: { bits: [4] } } },
  } };
}
const UCF = 'NET "a" LOC = "V10" | IOSTANDARD = LVCMOS33;\nNET "y" LOC = "U16" | IOSTANDARD = LVCMOS25 | DRIVE = 12 | SLEW = FAST;\nNET "b" PULLUP;\n';

test('sortedNetlistText: every module\'s cells by name, nothing else changed', () => {
  const j = netlist(), s = JSON.parse(sortedNetlistText(JSON.stringify(j)));
  assert.deepEqual(Object.keys(s.modules.top.cells), ['a_IBUF_inst', 'b_IBUF_inst', 'y_LUT2', 'y_OBUF_inst']);
  assert.deepEqual(Object.keys(s.modules.other.cells), ['a', 'z']);
  for (const m of ['top', 'other']) {
    for (const [k, c] of Object.entries(j.modules[m].cells)) assert.deepEqual(s.modules[m].cells[k], c, k);
    assert.deepEqual({ ...s.modules[m], cells: null }, { ...j.modules[m], cells: null });
  }
  // (sorted already: the same text, the same netlist again)
  const once = sortedNetlistText(JSON.stringify(j));
  assert.equal(sortedNetlistText(once), once);
});

test('packInput: each I/O buffer with its port bit and the port\'s constraints, as Silinx\'s Map read them; the other cells as they were', () => {
  const text = sortedNetlistText(JSON.stringify(netlist()));
  const nl = readYosysJson(text), packed = packS6(nl);
  const phys = physS6(nl, packed, { ucf: readConstraints(UCF_FORMAT, UCF, 'top.ucf') });
  const j = packInput(text, phys), cells = j.modules.top.cells;
  assert.deepEqual(cells.a_IBUF_inst.attributes, { PORT: 'a', LOC: 'V10', IOSTANDARD: 'LVCMOS33' });
  assert.deepEqual(cells.y_OBUF_inst.attributes, { PORT: 'y', LOC: 'U16', IOSTANDARD: 'LVCMOS25', DRIVE: '12', SLEW: 'fast' });
  assert.deepEqual(cells.b_IBUF_inst.attributes, { PORT: 'b', PULL: 'up' });
  assert.deepEqual(cells.y_LUT2, JSON.parse(text).modules.top.cells.y_LUT2);
  assert.deepEqual(j.modules.other, JSON.parse(text).modules.other);
  // (the netlist given is not changed)
  assert.deepEqual(JSON.parse(text).modules.top.cells.a_IBUF_inst.attributes, {});
});

test('samePacking: [] when the fork\'s sites are Silinx\'s Map\'s (an IOB of either of a pair, BUFGMUX for BUFG); each difference named', () => {
  const phys = { insts: [{ name: 'a', type: 'IOB' }, { name: 'y', type: 'IOB' }, { name: 's0', type: 'SLICEX' }, { name: 'clk_BUFG', type: 'BUFG' }] };
  const json = cells => ({ modules: { top: { attributes: { top: T }, cells: Object.fromEntries(Object.entries(cells).map(([n, type]) => [n, { type }])) } } });
  const same = json({ a: 'IOBM', y: 'IOBS', s0: 'SLICEX', clk_BUFG: 'BUFGMUX' });
  assert.deepEqual(packedSites(same), { a: 'IOB', y: 'IOB', s0: 'SLICEX', clk_BUFG: 'BUFG' });
  assert.deepEqual(samePacking(same, phys), []);
  assert.deepEqual(samePacking(json({ a: 'IOB', s0: 'SLICEL', clk_BUFG: 'BUFGMUX', s1: 'SLICEX' }), phys),
    ['y: not packed by nextpnr', 's0: a SLICEL in nextpnr, a SLICEX in Silinx\'s Map', 's1: packed by nextpnr only']);
  assert.deepEqual(samePacking(json({}), { insts: [] }), []);
});

test('s6MapOf: nextpnr\'s Map (the default since #3140) unless the project chose Silinx\'s', () => {
  assert.equal(s6MapOf(undefined), 'nextpnr');
  assert.equal(s6MapOf({}), 'nextpnr');
  assert.equal(s6MapOf({ s6Map: 'silinx' }), 'silinx');
  assert.equal(s6MapOf({ s6Map: 'nextpnr' }), 'nextpnr');
  assert.equal(s6MapOf({ s6Map: 'SILINX' }), 'nextpnr');
});

// (#3743) #3151's product of two counters by nextpnr's Map (the default since #3140): the counters' sums leave their carry
// slices by BMUX / CMUX for the DSP48A1s, and the fork's packer put the product's 5FFs on those positions ("its pin BMUX
// carries two nets") until its spartan6 0.5.2 (pmnmalo/nextpnr-spartan#47, a port of Silinx's muxNeeded); in Verilog and
// in VHDL, on the Nexys3
const PRODUCT = {
  verilog: ['top.v', `module top(input clk, output reg [3:0] led);
  reg [17:0] x = 0, y = 0; reg [35:0] p;
  always @(posedge clk) begin x <= x + 3; y <= y + 5; p <= x * y; led <= p[35:32]; end
endmodule
`],
  vhdl: ['top.vhd', `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity top is port (clk : in std_logic; led : out std_logic_vector(3 downto 0)); end top;
architecture rtl of top is
  signal x, y : unsigned(17 downto 0) := (others => '0'); signal p : unsigned(35 downto 0);
begin
  process (clk) begin
    if rising_edge(clk) then x <= x + 3; y <= y + 5; p <= x * y; led <= std_logic_vector(p(35 downto 32)); end if;
  end process;
end rtl;
`],
};
const PRODUCT_UCF = 'NET "clk" LOC = "V10";\nNET "led<0>" LOC = "U16";\nNET "led<1>" LOC = "V16";\nNET "led<2>" LOC = "U15";\nNET "led<3>" LOC = "V15";\nNET "clk" PERIOD = 20 ns;\n';
for (const [lang, [file, text]] of Object.entries(PRODUCT)) {
  test(`#3743 a product of two counters (${lang}) by nextpnr's Map on the Nexys3: packed, placed and routed on every seed, its DSP48A1s, no warnings`, { timeout: 900000 }, async (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-product-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.writeFileSync(path.join(tmp, file), text);
    fs.writeFileSync(path.join(tmp, 'top.ucf'), PRODUCT_UCF);
    const project = { name: 'product', version: 1, device: { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' }, board: 'nexys3', top: 'top',
      files: [{ path: file, lang, role: 'design' }], constraints: 'top.ucf', impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' } };
    assert.equal(s6MapOf(project.impl), 'nextpnr');
    const job = await silinxFlow(tmp, project, ['synth', 'translate', 'map', 'par']);
    const lines = job.lines.map(l => (typeof l === 'string' ? l : l.text));
    assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed/.test(l)).join('\n'));
    assert.deepEqual(lines.filter(l => /WARNING/.test(l)), []);
    assert.ok(lines.some(l => /^Packed and placed \d+ sites by nextpnr in /.test(l)), lines.join('\n'));   // (nextpnr's Map, not Silinx's)
    assert.deepEqual(lines.filter(l => /^nextpnr, seed/.test(l)).map(l => l.replace(/ [\d.]+ ns/, ' … ns')), [1, 2, 3].map(s => `nextpnr, seed ${s}: minimum period … ns.`));
    assert.ok(lines.includes('All signals are completely routed.'));
    assert.ok(lines.some(l => /Number of DSP48A1s:\s+3 out of/.test(l)), lines.filter(l => /DSP/.test(l)).join('\n'));   // (Yosys's unsigned 18 x 18 product in three)
  });
}

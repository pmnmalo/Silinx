// The Zynq PL top built by the Silinx toolchain (#4688, parts 2 and 3): the PS7 a primitive of Silinx's front end
// (packages/silinx-hdl/src/unisim-ps7.js: its model FCLK_CLK0 and its reset, M_AXI_GP0 idle; the BIBUF nothing), the top
// for the Silinx toolchain (core/zynq-pl-top.js, fixedIo false: the PS's pins not the PL's) synthesized by Yosys (the PS7
// its cell), placed and routed by nextpnr's xilinx arch (the PS7 in its PSS2 tile, M_AXI_GP0 and FCLK_CLK0 routed into
// the fabric) and written as a bitstream by Project X-Ray's xc7z020 database, in VHDL and in Verilog, with no error and
// no warning. Vivado's build of the same top and the board check: #5985.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';
import { zynqPlTop } from '../core/zynq-pl-top.js';
import { normalizeRegmap } from '../core/regmap.js';
import { generateRegmap } from '../core/regmap-hdl.js';
import { isUnisimPrimitive, primitiveSources } from '../core/unisim.js';
import { simulate } from '../core/compile.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-zynq-pl-build-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const call = async (name, args) => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;

const MAP = normalizeRegmap({ name: 'cnt_regs', bus: 'axi', registers: [{ name: 'enable', addr: 0, width: 1, access: 'rw', reset: 0 },
  { name: 'count', addr: 4, width: 16, access: 'ro' }, { name: 'clear', addr: 8, width: 1, access: 'wo', strobe: true }] });
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'enable', dir: 'in', width: 1 }, { name: 'clear', dir: 'in', width: 1 }, { name: 'clear_wr', dir: 'in', width: 1 },
  { name: 'count', dir: 'out', width: 16 }, { name: 'led', dir: 'out', width: 4 }];
const src = fs.readFileSync(path.join(ROOT, 'test/zynq-pl-top.test.js'), 'utf8');
const COUNTER = { vhdl: src.split('vhdl: `')[1].split('`, verilog')[0], verilog: src.split('verilog: `')[1].split('` };')[0] };

test('#4688 the PS7 and the BIBUF: UNISIM primitives of Silinx\'s; the PS7\'s model: FCLK_CLK0 at 50 MHz, its reset released after four periods', () => {
  assert.deepEqual([isUnisimPrimitive('PS7'), isUnisimPrimitive('ps7'), isUnisimPrimitive('BIBUF')], [true, true, true]);
  const tb = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; library UNISIM; use UNISIM.VCOMPONENTS.ALL;\nentity tb is end tb;\narchitecture t of tb is\n  signal clk, rst : std_logic_vector(3 downto 0);\n  signal aclk : std_logic := \'0\';\nbegin\n'
    + '  ps : PS7 port map (FCLKCLK => clk, FCLKRESETN => rst, MAXIGP0ACLK => aclk, MAXIGP0ARREADY => \'0\', MAXIGP0AWREADY => \'0\', MAXIGP0BID => (others => \'0\'), MAXIGP0BRESP => "00", MAXIGP0BVALID => \'0\',\n'
    + '    MAXIGP0RDATA => (others => \'0\'), MAXIGP0RID => (others => \'0\'), MAXIGP0RLAST => \'0\', MAXIGP0RRESP => "00", MAXIGP0RVALID => \'0\', MAXIGP0WREADY => \'0\');\n'
    + '  process begin wait for 45 ns; report "clk " & std_logic\'image(clk(0)) & " rst " & std_logic\'image(rst(0)); wait for 50 ns; report "clk " & std_logic\'image(clk(0)) & " rst " & std_logic\'image(rst(0)); wait; end process;\nend t;\n';
  const files = [{ path: 'tb.vhd', text: tb }];
  const r = simulate([...primitiveSources(files), ...files], 'tb', { until: 2e5 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sim.log.map((l) => l.text).filter((l) => /clk/.test(l)).map((l) => l.replace(/^.*?(clk)/, '$1')), ['clk \'0\' rst \'0\'', 'clk \'1\' rst \'1\'']);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#4688 the Zynq PL top built by the Silinx toolchain in ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: synthesized, placed and routed, its bitstream; no error, no warning; the PS7 in its PSS2 tile`, { timeout: 600000 }, async () => {
    const name = `pl_${lang}`;
    await call('new_project', { name, board: 'zybo-z7' });
    const t = zynqPlTop({ module: { name: 'counter', ports: PORTS }, map: MAP, lang, fixedIo: false }), s = generateRegmap(MAP, { lang });
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    for (const [p, x] of [[`src/${s.file}`, s.code], [`src/counter.${ext}`, COUNTER[lang]], [`src/${t.file}`, t.code]]) assert.equal((await call('write_file', { project: name, path: p, text: x })).isError, false);
    assert.equal((await call('set_top', { project: name, top: 'counter_zynq', update_constraints: true })).isError, false);
    const r = await call('run_process', { project: name, process: 'bitstream', toolchain: 'silinx' });
    assert.equal(r.isError, false, r.content[0].text);
    assert.deepEqual([r.structuredContent.errors, r.structuredContent.warnings], [[], []]);
    const fasm = fs.readFileSync(path.join(P.projectDir(name), 'build/open/routed.fasm'), 'utf8');
    // (its M_AXI_GP0's inputs from the fabric, the slave's read data among them: routed into the PS7's tile)
    assert.equal(new Set([...fasm.matchAll(/^PSS2_X32Y105\.PS7_MAXIGP0RDATA(\d+)\./gm)].map((m) => m[1])).size, 32, 'the PS7 in its PSS2 tile, M_AXI_GP0\'s 32 read data bits routed');
    assert.ok(fs.existsSync(path.join(P.projectDir(name), 'build/counter_zynq.bit')), 'its bitstream');
  });
}

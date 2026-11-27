// #3152's flow on the Spartan-6, a test file a part (#5813: the two parts together past a test file's 15 minutes):
// s6-pad-paths.test.js the Nexys3's XC6SLX16, s6-pad-paths-atlys.test.js the Atlys's XC6SLX45.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// the flow: a design of 64 outputs and one input, the clock LOC'd and, since #3349, three ports on pads that had no
// path before (the input d on F9, a TIOB_SINGLE pad; q<0> on A2, a TIOI_INNER slave; q<1> on C4, a TIOI_OUTER slave),
// the others without a LOC, routed by nextpnr on every seed and its bitstream written, in Verilog and in VHDL, on the
// Nexys3's and the Atlys's parts (no board: a board's ports need their LOC). The placer's seed: the first whose
// placement, without the paths, put outputs on the former pads (on the XC6SLX45 seed 1's kept them off: q<52> on C6,
// q<53> on A3 … with seed 2).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-pads-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
const SOURCES = {
  verilog: ['top.v', 'module top(input clk, input d, output reg [63:0] q);\n  always @(posedge clk) q <= {q[62:0], d};\nendmodule\n'],
  vhdl: ['top.vhd', [
    'library ieee;', 'use ieee.std_logic_1164.all;', '',
    'entity top is', '  port (clk : in std_logic; d : in std_logic; q : out std_logic_vector(63 downto 0));', 'end top;', '',
    'architecture rtl of top is', '  signal r : std_logic_vector(63 downto 0) := (others => \'0\');', 'begin',
    '  process (clk) begin', '    if rising_edge(clk) then r <= r(62 downto 0) & d; end if;', '  end process;', '  q <= r;', 'end rtl;', ''].join('\n')],
};
export const PARTS = [{ board: 'nexys3', part: 'xc6slx16', clk: 'V10', seed: 1 }, { board: 'atlys', part: 'xc6slx45', clk: 'L15', seed: 2 }];

/** The Silinx toolchain's flow on a project folder from placement seed `seed`, as the application runs it: the job. */
async function flow(dir, project, seed) {
  const { createJob } = await import('../server/jobs.js');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const job = createJob('s6-pads', j => runOpenImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 200));
  return job;
}

/** The flow's cases on part `t` of PARTS, in Verilog and in VHDL. */
export function padFlowTests(t) {
  describe('ports without a LOC on the Spartan-6, and on the pads #3349 gave paths, by nextpnr (#3152, #3349)', { concurrency: 2 }, () => {
    for (const lang of ['verilog', 'vhdl']) {
      test(`${lang} on the ${t.part}: every seed routes, the bitstream written, the free pins' warning only`, { timeout: 600000 }, async () => {
        const dir = path.join(tmp, `${lang}-${t.board}`), [file, text] = SOURCES[lang];
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', file), text);
        fs.writeFileSync(path.join(dir, 'top.ucf'), `NET "clk" LOC = "${t.clk}";\nNET "d" LOC = "F9";\nNET "q<0>" LOC = "A2";\nNET "q<1>" LOC = "C4";\n`);
        const project = { name: 'top', version: 1, device: { family: 'spartan6', part: t.part, package: 'csg324', speed: '-3' },
          top: 'top', files: [{ path: `src/${file}`, lang, role: 'design' }], constraints: 'top.ucf', impl: { engine: 'nextpnr' } };
        fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(project));
        const job = await flow(dir, project, t.seed);
        const lines = job.lines.map(l => (typeof l === 'string' ? l : l.text));
        assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed/.test(l)).join('\n'));
        assert.deepEqual(lines.filter(l => /^nextpnr, seed/.test(l)).map(l => l.replace(/ [\d.]+ ns/, ' … ns')),
          [0, 1, 2].map(k => `nextpnr, seed ${t.seed + k}: minimum period … ns.`));
        assert.deepEqual(lines.filter(l => /warning/i.test(l)), [
          'WARNING: 62 port bit(s) have no LOC constraint (q<2>, q<3>, q<4>, q<5>, q<6>, q<7>, q<8>, q<9>, …): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
        assert.ok(lines.includes('All signals are completely routed.'));
      });
    }
  });
}

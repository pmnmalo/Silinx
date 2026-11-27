// #3152: on the Spartan-6, a port without a LOC takes a pad whose I/O path the bit database knows (fpga/s6/pad-paths.js).
// nextpnr's chip database leaves out the PIPs whose bits Silinx does not know. Until #3349 those were the slave
// OLOGIC2's D1 -> OQ route-through of the top bank's TIOI_INNER and TIOI_OUTER tiles (#3269, #3350), so 30 of the
// XC6SLX16's pads (23 of the XC6SLX45's) took no output, and the *IOB_SINGLE tiles' pad wire -> IBUF PIPs (#3169), so 4
// pads of each took no input. The placer gave them to outputs without a LOC, and nextpnr failed on every seed:
// "Failed to route arc 0.0 of net …, from X6Y4/L_AQ to X5Y0/TIOB_O3_PINW" (the pad A2). Since #3349 (the PIPs measured,
// nextpnr-spartan's spartan6 0.4.1 built with them) every pad has both paths.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { s6Device, s6Phys, s6Verilog, NEXYS3_LD, NEXYS3_SW } from './s6-lib.mjs';
import { loadBitDbS6 } from '../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { padPathsS6 } from '../packages/silinx-fpga/src/fpga/s6/pad-paths.js';
import { PARTS, padFlowTests } from './s6-pad-paths-lib.mjs';

const paths = part => { const { device, sites } = s6Device(part); return { sites, paths: padPathsS6(device, loadBitDbS6(part), sites) }; };
const without = (m, d) => [...m].filter(([, v]) => !v[d]).map(([n]) => n).sort();

// the pads that took no output (no input) before #3349, on the XC6SLX16 and the XC6SLX45
const FORMER = {
  'xc6slx16csg324-3': { out: ['A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
    'C11', 'C12', 'C14', 'C4', 'C6', 'C8', 'C9', 'E11', 'E12', 'E13', 'E6', 'E8', 'F10', 'F8', 'F9'], in: ['F9', 'G9', 'U11', 'V11'] },
  'xc6slx45csg324-3': { out: ['A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
    'A9', 'C11', 'C14', 'C4', 'C6', 'C8', 'C9', 'E13', 'F9'], in: ['F9', 'G9', 'R7', 'T7'] },
};
/** A paths map with the FORMER pads' paths taken away: the placer's mechanism, tested on pads without a path. */
const formerPaths = (m, part) => new Map([...m].map(([p, v]) => [p, { in: v.in && !FORMER[part].in.includes(p), out: v.out && !FORMER[part].out.includes(p) }]));

describe('the Spartan-6 pads\' known I/O paths (#3152)', () => {
  test('#3349: every pad takes an input and an output, on both parts (#3269\'s, #3350\'s slave D1 -> OQ, #3169\'s pad wire -> IBUF PIPs)', () => {
    for (const part of ['xc6slx16csg324-3', 'xc6slx45csg324-3']) {
      const { sites, paths: m } = paths(part);
      assert.equal(m.size, sites.pads.size, part);
      assert.deepEqual(without(m, 'out'), [], part);
      assert.deepEqual(without(m, 'in'), [], part);
      // (the former ones: the top bank's TIOB pads, and the *IOB_SINGLE tiles' for the inputs)
      assert.ok(FORMER[part].out.every(p => /^TIOB/.test(sites.pads.get(p).tile) && sites.pads.get(p).bank === 0), part);
      assert.deepEqual(FORMER[part].in.map(p => sites.pads.get(p).tile.replace(/_X\d+Y\d+$/, '')).sort(),
        ['BIOB_SINGLE', 'BIOB_SINGLE', 'TIOB_SINGLE', 'TIOB_SINGLE'], part);
    }
    // (the Nexys3's switches and LEDs: both ways)
    const { paths: m } = paths('xc6slx16csg324-3');
    assert.ok([...NEXYS3_SW, ...NEXYS3_LD].every(p => m.get(p).in && m.get(p).out));
  });
});

// the flow on the Nexys3's part (s6-pad-paths-lib.mjs; the Atlys's: s6-pad-paths-atlys.test.js, #5813)
padFlowTests(PARTS.find(t => t.board === 'nexys3'));

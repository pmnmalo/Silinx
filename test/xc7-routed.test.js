// The examples' 7-series post-place & route models (#4362) on the boards of the Silinx toolchain's 7-series (XC7_TARGETS: the
// Basys 3's XC7A35T, the Nexys A7's XC7A100T): test/lattice-routed-lib.mjs, each example placed on the board's pins (its XDC:
// nextpnr-himbaechel-xilinx places no port without one), nextpnr's routed design's sites' cells made UNISIM's again
// (core/xc7-routed.js) and simulated with Silinx's UNISIM models.
import { XC7 } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { XDC } from '../packages/silinx-fpga/src/xdc.js';
import { nextpnrXc7Node } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { XC7_TARGETS, exampleBoard, exampleUcf } from './examples-lib.mjs';
import { routedTests } from './lattice-routed-lib.mjs';

// (one nextpnr run at a time, in this thread: the best of 1 seed)
const nextpnr = () => { const n = nextpnrXc7Node(); delete n.runApart; return { xc7: n }; };
const PARTS = { basys3: { part: 'xc7a35tcpg236-1', device: 'xc7a35t', pkg: 'cpg236' }, 'nexys-a7': { part: 'xc7a100tcsg324-1', device: 'xc7a100t', pkg: 'csg324' } };
// the sites' cells of the examples' routed designs (stopwatch's DSP48E1 and RAMB18E1, clock's and traffic's F7 / F8 muxes)
const CELLS = ['BUFGCTRL', 'CARRY4', 'DSP48E1_DSP48E1', 'IOB33_INBUF_EN', 'IOB33_OUTBUF', 'PAD', 'PSEUDO_GND', 'PSEUDO_VCC', 'RAMB18E1_RAMB18E1', 'SELMUX2_1', 'SLICE_FFX', 'SLICE_LUTX'];

for (const t of XC7_TARGETS) {
  routedTests({ name: `7-series (${t.board})`, backend: XC7, spec: { family: 'artix7', ...PARTS[t.board], speed: '-1', seed: 1, resources: [] }, nextpnr,
    constraints: (ex) => XDC.read(exampleUcf(ex, exampleBoard(ex, t)).text), library: '<silinx>/unisim.vhd', cells: CELLS, io: { bitDb: () => null } });
}

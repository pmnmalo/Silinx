// The examples' post-place & route models (#4362) on the Zynq-7000's boards of the Silinx toolchain (ZYNQ_TARGETS, #4681: the
// Zybo Z7-20's XC7Z020 and Z7-10's XC7Z010, their programmable logic, the 7-series' back end's, #4680), as test/xc7-routed.test.js
// does on the Artix-7's (a file of its own: the two take about 6 minutes a board, a file 15 at most): each example placed on the
// board's pins (its XDC), nextpnr's routed design's sites' cells made UNISIM's again (core/xc7-routed.js) and simulated with
// Silinx's UNISIM models.
import { XC7 } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { XDC } from '../packages/silinx-fpga/src/xdc.js';
import { nextpnrXc7Node } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { ZYNQ_TARGETS, exampleBoard, exampleUcf, targetName } from './examples-lib.mjs';
import { routedTests } from './lattice-routed-lib.mjs';

// (one nextpnr run at a time, in this thread: the best of 1 seed)
const nextpnr = () => { const n = nextpnrXc7Node(); delete n.runApart; return { xc7: n }; };
const PARTS = { 'zybo-z7-20': { part: 'xc7z020clg400-1', device: 'xc7z020', pkg: 'clg400' }, 'zybo-z7-10': { part: 'xc7z010clg400-1', device: 'xc7z010', pkg: 'clg400' } };
// the sites' cells of the examples' routed designs (as the Artix-7's)
const CELLS = ['BUFGCTRL', 'CARRY4', 'DSP48E1_DSP48E1', 'IOB33_INBUF_EN', 'IOB33_OUTBUF', 'PAD', 'PSEUDO_GND', 'PSEUDO_VCC', 'RAMB18E1_RAMB18E1', 'SELMUX2_1', 'SLICE_FFX', 'SLICE_LUTX'];

for (const t of ZYNQ_TARGETS) {
  routedTests({ name: `Zynq-7000 (${targetName(t)})`, backend: XC7, spec: { family: 'artix7', ...PARTS[targetName(t)], speed: '-1', seed: 1, resources: [] }, nextpnr,
    constraints: (ex) => XDC.read(exampleUcf(ex, exampleBoard(ex, t)).text), library: '<silinx>/unisim.vhd', cells: CELLS, io: { bitDb: () => null } });
}

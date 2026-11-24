// The Zynq-7000's boards' examples through the Silinx toolchain's 7-series back end (#4681, #4682), shared by each board's
// files (a board's about 5 minutes for its builds, 10 for its post-place & route models, a file 15 at most): their parts,
// the warnings of the examples below their 125 MHz clock, the tests of the post-place & route models.
import { XC7 } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { XDC } from '../packages/silinx-fpga/src/xdc.js';
import { nextpnrXc7Node } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { ZYNQ_TARGETS, exampleBoard, exampleUcf, targetName } from './examples-lib.mjs';
import { routedTests } from './lattice-routed-lib.mjs';

// a board's targets (ZYNQ_TARGETS: its variants)
export const zynqTargets = board => ZYNQ_TARGETS.filter(t => t.board === board);
// each part: its slices and their registers, its pins, its .bit's name and ID code, its frames (the part's, the tiles'
// fasm2frames writes), its clock (MHz, the boards' 125 MHz from their Ethernet PHY), its required features (Project
// X-Ray's required_features.fasm: three), by the variant (20, 10)
const XC7Z020 = { part: 'xc7z020clg400-1', device: 'xc7z020', pkg: 'clg400', slices: 13300, regs: 106400, iobs: 125, bitPart: '7z020clg400', idcode: 0x3727093, frames: [9996, 7802], mhz: 125, required: 3 };
const XC7Z010 = { part: 'xc7z010clg400-1', device: 'xc7z010', pkg: 'clg400', slices: 4400, regs: 35200, iobs: 100, bitPart: '7z010clg400', idcode: 0x3722093, frames: [5144, 2952], mhz: 125, required: 3 };
export const zynqParts = board => Object.fromEntries(zynqTargets(board).map(t => [targetName(t), t.variant === '10' ? XC7Z010 : XC7Z020]));
// the warnings of the examples below the 125 MHz clock (#4877): nextpnr's own, then the timing's. The clocks' net names
// are Yosys's: any. Since #4877 stopwatch and pong meet it with registers of their own (stopwatch's block RAM and its
// multipliers in two cycles, pong's next period and the ball's ends kept in registers), but pong on the Arty Z7 (its
// placement: 106-124 MHz) and micro80 (its light8080 core's paths, kept as they are: 108-115 MHz; nextpnr's placement,
// #3803).
export const FMAX = /^WARNING:Place - Max frequency for clock '.+': [\d.]+ MHz \(FAIL at 125\.00 MHz\)$/;
export const SLOW = /^WARNING:Timing - the clock clk reaches [\d.]+ MHz, not the 125 MHz of its constraint \(nextpnr's estimate\)\.$/;
export const SLOW_ONES = { micro80: [FMAX, SLOW] };
export const SLOW_ARTY = { pong: [FMAX, SLOW], micro80: [FMAX, SLOW] };

// (one nextpnr run at a time, in this thread: the best of 1 seed)
const nextpnr = () => { const n = nextpnrXc7Node(); delete n.runApart; return { xc7: n }; };
// the sites' cells of the examples' routed designs (as the Artix-7's)
const CELLS = ['BUFGCTRL', 'CARRY4', 'DSP48E1_DSP48E1', 'IOB33_INBUF_EN', 'IOB33_OUTBUF', 'PAD', 'PSEUDO_GND', 'PSEUDO_VCC', 'RAMB18E1_RAMB18E1', 'SELMUX2_1', 'SLICE_FFX', 'SLICE_LUTX'];

/** The examples' post-place & route models (#4362) on a board's variants, as test/xc7-routed.test.js on the Artix-7's: each
 *  example placed on the board's pins (its XDC), nextpnr's routed design's sites' cells made UNISIM's again
 *  (core/xc7-routed.js) and simulated with Silinx's UNISIM models. */
export function zynqRoutedTests(board) {
  const parts = zynqParts(board);
  for (const t of zynqTargets(board)) {
    const { part, device, pkg } = parts[targetName(t)];
    routedTests({ name: `Zynq-7000 (${targetName(t)})`, backend: XC7, spec: { family: 'artix7', part, device, pkg, speed: '-1', seed: 1, resources: [] }, nextpnr,
      constraints: (ex) => XDC.read(exampleUcf(ex, exampleBoard(ex, t)).text), library: '<silinx>/unisim.vhd', cells: CELLS, io: { bitDb: () => null } });
  }
}

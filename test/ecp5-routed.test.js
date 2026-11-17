// The examples' ECP5 post-place & route models (#2299, the ULX3S's LFE5U-85F, #2302): test/lattice-routed-lib.mjs.
import { ECP5 } from '../packages/silinx-fpga/src/open-flow-ecp5.js';
import { nextpnrEcp5Node } from '../packages/silinx-fpga/src/nextpnr-ecp5-node.js';
import { routedTests } from './lattice-routed-lib.mjs';

routedTests({ name: 'ECP5', backend: ECP5, spec: { device: 'lfe5u-85f', pkg: 'CABGA381', speed: '6', seed: 1 }, nextpnr: () => ({ ecp5: nextpnrEcp5Node() }),
  library: '<silinx>/ecp5.vhd', cells: ['DCCA', 'DP16KD', 'MULT18X18D', 'TRELLIS_COMB', 'TRELLIS_FF', 'TRELLIS_IO', 'TRELLIS_RAMW'] });

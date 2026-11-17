// The examples' iCE40 post-place & route models (#2299, the iCEBreaker's iCE40UP5K, #2295): test/lattice-routed-lib.mjs.
import { ICE40 } from '../packages/silinx-fpga/src/open-flow-ice40.js';
import { nextpnrIce40Node } from '../packages/silinx-fpga/src/nextpnr-ice40-node.js';
import { routedTests } from './lattice-routed-lib.mjs';

routedTests({ name: 'iCE40', backend: ICE40, spec: { device: 'ice40up5k', pkg: 'sg48', seed: 1 }, nextpnr: () => ({ ice40: nextpnrIce40Node() }),
  library: '<silinx>/ice40.vhd', cells: ['ICESTORM_LC', 'ICESTORM_RAM', 'SB_GB', 'SB_IO'] });

// The examples' Gowin post-place & route models (#4362, the Tang Nano 9K's GW1NR-9C, #2303): test/lattice-routed-lib.mjs, each
// example placed on the board's pins (its CST: nextpnr-himbaechel-gowin places no port without one).
import { GOWIN } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { CST } from '../packages/silinx-fpga/src/cst.js';
import { nextpnrGowinNode } from '../packages/silinx-fpga/src/nextpnr-gowin-node.js';
import { GOWIN_TARGETS, exampleBoard, exampleUcf } from './examples-lib.mjs';
import { routedTests } from './lattice-routed-lib.mjs';

routedTests({ name: 'Gowin', backend: GOWIN, spec: { family: 'gowin', device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', seed: 1 }, nextpnr: () => ({ gowin: nextpnrGowinNode() }),
  constraints: (ex) => CST.read(exampleUcf(ex, exampleBoard(ex, GOWIN_TARGETS[0])).text), library: '<silinx>/gowin.vhd',
  cells: ['ALU', 'DFF', 'DFFC', 'DFFCE', 'DFFE', 'DFFR', 'DFFRE', 'DFFS', 'DFFSE', 'DP', 'DUMMY_CELL', 'GOWIN_GND', 'GOWIN_VCC', 'GSR', 'IBUF', 'LUT1', 'LUT2', 'LUT3', 'LUT4',
    'MULT18X18', 'MUX2_LUT5', 'MUX2_LUT6', 'MUX2_LUT7', 'MUX2_LUT8', 'OBUF', 'RAM16SDP4', 'SP'] });

// The local server runs the 7-series' back end on the Zynq-7000's boards (#4681): every example (gates … micro80) on the
// Zybo Z7-20 (XC7Z020) and the Zybo Z7-10 (XC7Z010), their programmable logic only (no processing system set up, #4679),
// from HDL to its .bit as on the Artix-7's boards (test/xc7-examples-lib.mjs; a file of its own: each board about 5
// minutes, a file 15 at most). The examples' display, LEDs and switches the board lacks are on its Pmods (#3709).
// The Zybo's clock is 125 MHz: micro80 does not meet it by nextpnr's estimate (106-109 MHz; Vivado's builds meet it,
// test/vivado/examples.test.js), its two timing warnings expected (#4877, test/zynq-examples-lib.mjs). (The Z7-20's stopwatch had a hold
// violation, the model's: its clock's tree balanced since nextpnr-himbaechel-xc7 0.5.0, #4878.) The Arty Z7's: test/open-flow-arty-z7-server.test.js (#4682).
import { xc7ExampleTests } from './xc7-examples-lib.mjs';
import { zynqTargets, zynqParts, SLOW_ONES, FMAX, SLOW } from './zynq-examples-lib.mjs';

// each example's LUTs, registers and frequency (MHz, nextpnr's estimate, router2, seed 1) on each board, measured with
// @silinx/nextpnr-himbaechel-xc7 0.5.0 (#4681, #4878), held as the Artix-7's are (#3147: 15 % more LUTs, the registers 10 % apart,
// the frequency 15 % lower at most; the Z7-20's stopwatch 128.57 MHz with Yosys 0.71 and to_decimal's registers of #5654, 151.56 before)
const QUALITY = {
  'zybo-z7-20': { gates: [1, 0, null], breadboard: [4, 8, 250.82], traffic: [74, 60, 145.73], blinky: [79, 96, 181.69],
    pong: [245, 270, 132.12], stopwatch: [177, 213, 128.57], clock: [150, 168, 135.81], vga: [116, 59, 149.43],
    isqrt: [68, 87, 202.76], uart: [104, 143, 177.3], micro80: [153, 187, 108.65], lock: [110, 181, 144.53] },
  'zybo-z7-10': { gates: [1, 0, null], breadboard: [4, 8, 241.25], traffic: [78, 60, 142.59], blinky: [79, 96, 174.03],
    pong: [242, 270, 129.55], stopwatch: [176, 213, 151.31], clock: [150, 168, 136.69], vga: [116, 59, 157.55],
    isqrt: [68, 87, 186.88], uart: [104, 143, 175.01], micro80: [151, 187, 106.04], lock: [110, 181, 145.62] },
};
// the warnings of the examples below the 125 MHz clock (#4877); no hold violation (the Z7-20's stopwatch's, its clock's tree
// balanced in nextpnr-himbaechel-xc7 0.5.0, #4878). Since Yosys 0.71 (#5634) pong too (119-124 MHz), and traffic on the Z7-20
// (124.7 MHz): its netlists' cells in another order, which moves the examples' placement by as much (#5634's comparison)
const SLOW_Z7 = { traffic: [FMAX, SLOW], pong: [FMAX, SLOW], ...SLOW_ONES };
const EXPECTED = { 'zybo-z7-20': SLOW_Z7, 'zybo-z7-10': { pong: [FMAX, SLOW], ...SLOW_ONES } };

xc7ExampleTests(zynqTargets('zybo-z7'), { parts: zynqParts('zybo-z7'), quality: QUALITY, expected: EXPECTED });

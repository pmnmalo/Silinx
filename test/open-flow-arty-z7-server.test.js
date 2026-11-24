// The local server runs the 7-series' back end on the Arty Z7 (#4682): every example (gates … micro80) on the Arty Z7-20
// (XC7Z020) and the Arty Z7-10 (XC7Z010), their programmable logic only (no processing system set up, #4679), from HDL to
// its .bit as on the Zybo Z7 (test/open-flow-zynq-server.test.js, test/xc7-examples-lib.mjs). The examples' display, LEDs
// and switches the board lacks are on its Pmods and its shield header (#3709).
// Its clock is 125 MHz too: pong and micro80 do not meet it by nextpnr's estimate (106-124 MHz), their two timing warnings
// expected (#4877, test/zynq-examples-lib.mjs); no hold violation.
import { xc7ExampleTests } from './xc7-examples-lib.mjs';
import { zynqTargets, zynqParts, SLOW_ARTY } from './zynq-examples-lib.mjs';

// each example's LUTs, registers and frequency (MHz, nextpnr's estimate, router2, seed 1) on each board, measured with
// @silinx/nextpnr-himbaechel-xc7 0.5.0 (#4682, #4878), held as the Artix-7's are (#3147: 15 % more LUTs, the registers 10 % apart,
// the frequency 15 % lower at most; the clock met or not, as the warnings say)
const QUALITY = {
  'arty-z7-20': { gates: [1, 0, null], breadboard: [4, 8, 241.25], traffic: [76, 60, 131.2], blinky: [79, 96, 168.15],
    pong: [244, 270, 105.67], stopwatch: [173, 213, 147.08], clock: [150, 168, 133.99], vga: [116, 59, 153.49],
    isqrt: [68, 87, 179.73], uart: [105, 143, 174.49], micro80: [153, 187, 114.16], lock: [110, 181, 136.59] },
  'arty-z7-10': { gates: [1, 0, null], breadboard: [4, 8, 237.14], traffic: [76, 60, 134.44], blinky: [79, 96, 165.76],
    pong: [244, 270, 123.64], stopwatch: [173, 213, 151.33], clock: [150, 168, 130.99], vga: [116, 59, 147.82],
    isqrt: [69, 87, 182.68], uart: [103, 143, 166.03], micro80: [151, 187, 111.46], lock: [110, 181, 140.61] },
};
// the warnings of the examples below the 125 MHz clock (#4877)
const EXPECTED = { 'arty-z7-20': SLOW_ARTY, 'arty-z7-10': SLOW_ARTY };

xc7ExampleTests(zynqTargets('arty-z7'), { parts: zynqParts('arty-z7'), quality: QUALITY, expected: EXPECTED });

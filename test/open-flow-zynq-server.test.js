// The local server runs the 7-series' back end on the Zynq-7000's boards (#4681): every example (gates … micro80) on the
// Zybo Z7-20 (XC7Z020) and the Zybo Z7-10 (XC7Z010), their programmable logic only (no processing system set up, #4679),
// from HDL to its .bit as on the Artix-7's boards (test/xc7-examples-lib.mjs; a file of its own: each board about 5
// minutes, a file 15 at most). The examples' display, LEDs and switches the board lacks are on its Pmods (#3709).
// The Zybo's clock is 125 MHz: pong, stopwatch and micro80 do not meet it by nextpnr's estimate (97-113 MHz; Vivado's builds
// meet it, test/vivado/examples.test.js), their two timing warnings expected (#4877); the Z7-20's stopwatch has a hold
// violation on its laps RAM's clock too (#4878).
import { ZYNQ_TARGETS } from './examples-lib.mjs';
import { xc7ExampleTests } from './xc7-examples-lib.mjs';

// each board's part: its slices and their registers, its pins, its .bit's name and ID code, its frames (the part's, the
// tiles' fasm2frames writes), its clock (MHz), its required features (Project X-Ray's required_features.fasm: three)
const PARTS = {
  'zybo-z7-20': { part: 'xc7z020clg400-1', slices: 13300, regs: 106400, iobs: 125, bitPart: '7z020clg400', idcode: 0x3727093, frames: [9996, 7802], mhz: 125, required: 3 },
  'zybo-z7-10': { part: 'xc7z010clg400-1', slices: 4400, regs: 35200, iobs: 100, bitPart: '7z010clg400', idcode: 0x3722093, frames: [5144, 2952], mhz: 125, required: 3 },
};
// each example's LUTs, registers and frequency (MHz, nextpnr's estimate, router2, seed 1) on each board, measured with
// @silinx/nextpnr-himbaechel-xc7 0.4.0 (#4681), held as the Artix-7's are (#3147: 15 % more LUTs, the registers 10 % apart,
// the frequency 15 % lower at most)
const QUALITY = {
  'zybo-z7-20': { gates: [1, 0, null], breadboard: [4, 8, 250.82], traffic: [74, 60, 145.73], blinky: [79, 96, 181.69],
    pong: [265, 219, 101.24], stopwatch: [175, 212, 100.02], clock: [150, 168, 135.81], vga: [116, 59, 149.43],
    isqrt: [68, 87, 202.76], uart: [104, 143, 175.96], micro80: [153, 187, 112.83] },
  'zybo-z7-10': { gates: [1, 0, null], breadboard: [4, 8, 241.25], traffic: [78, 60, 142.59], blinky: [79, 96, 174.03],
    pong: [267, 219, 97.05], stopwatch: [176, 212, 97.35], clock: [150, 168, 136.69], vga: [116, 59, 157.55],
    isqrt: [68, 87, 186.88], uart: [104, 143, 175.01], micro80: [151, 187, 104.8] },
};
// the warnings of the examples below the 125 MHz clock (#4877): nextpnr's own, then the timing's; the Z7-20's stopwatch's
// hold violation first (#4878). The clocks' net names are Yosys's: any.
const FMAX = /^WARNING:Place - Max frequency for clock '.+': [\d.]+ MHz \(FAIL at 125\.00 MHz\)$/;
const SLOW = /^WARNING:Timing - the clock clk reaches [\d.]+ MHz, not the 125 MHz of its constraint \(nextpnr's estimate\)\.$/;
const HOLD = /^WARNING:Place - Hold\/min time violation for clock 'posedge .+laps_ram.+CLKARDCLK':$/;
const SLOW_ONES = { pong: [FMAX, SLOW], stopwatch: [FMAX, SLOW], micro80: [FMAX, SLOW] };
const EXPECTED = { 'zybo-z7-20': { ...SLOW_ONES, stopwatch: [HOLD, FMAX, SLOW] }, 'zybo-z7-10': SLOW_ONES };

xc7ExampleTests(ZYNQ_TARGETS, { parts: PARTS, quality: QUALITY, expected: EXPECTED });

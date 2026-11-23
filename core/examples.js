// The example projects (examples/<name>), in the order the interface lists them: from the first
// steps (gates: combinational logic drawn as a schematic; breadboard: 74LS chips wired on a breadboard, #3901;
// traffic: a state diagram and a truth table)
// to the larger designs; uart, serial communication with a terminal (#2537); lock, every kind of source in one design
// (#5111). Isomorphic.

export const EXAMPLE_ORDER = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock'];

/** The co-design examples, in their order after the FPGA ones (core/project-kind.js CODESIGN_EXAMPLES, #5214). */
export const CODESIGN_ORDER = ['uart-avr', 'spi-avr', 'i2c-avr', 'regs-avr'];

/** Example names in the listing order: the known ones first (EXAMPLE_ORDER, then the co-design ones'), then any other,
 *  by name. */
export function orderExamples(names) {
  const known = [...EXAMPLE_ORDER, ...CODESIGN_ORDER];
  const rank = n => { const i = known.indexOf(n); return i < 0 ? known.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

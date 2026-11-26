// The example projects (examples/<name>), in the order the interface lists them: from the first
// steps (gates: combinational logic drawn as a schematic; breadboard: 74LS chips wired on a breadboard, #3901;
// traffic: a state diagram and a truth table)
// to the larger designs; uart, serial communication with a terminal (#2537); lock, every kind of source in one design
// (#5111). Isomorphic.

export const EXAMPLE_ORDER = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock'];

/** The System examples, in their order after the FPGA ones (core/project-kind.js SYSTEM_EXAMPLES, #5214). */
export const SYSTEM_ORDER = ['uart-avr', 'spi-avr', 'i2c-avr', 'regs-avr', 'uart-pic24', 'adc-pmod', 'uart-pico', 'uart-esp32'];

/** The examples a Circuit project can start from (#5757, roadmap #5753): drawings and circuits only, no HDL of their own
 *  (core/project-kind.js ownSources: none), made with no board. They are Board projects' too, on their boards. */
export const CIRCUIT_EXAMPLES = ['gates', 'breadboard'];

/** The modes an example starts a project in (#5757: core/project-mode.js): a System example System; a Circuit example
 *  Circuit or Board; every other Board. New Project's Start from by its card, the MCP's list_examples. */
export const exampleModes = name => (SYSTEM_ORDER.includes(name) ? ['system'] : CIRCUIT_EXAMPLES.includes(name) ? ['circuit', 'board'] : ['board']);

/** Example names in the listing order: the known ones first (EXAMPLE_ORDER, then the System ones'), then any other,
 *  by name. */
export function orderExamples(names) {
  const known = [...EXAMPLE_ORDER, ...SYSTEM_ORDER];
  const rank = n => { const i = known.indexOf(n); return i < 0 ? known.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

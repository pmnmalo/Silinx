// The example projects (examples/<name>), in the order the interface lists them: from the first
// steps (gates: combinational logic drawn as a schematic; breadboard: 74LS chips wired on a breadboard, #3901;
// traffic: a state diagram and a truth table)
// to the larger designs; uart, serial communication with a terminal (#2537); lock, every kind of source in one design
// (#5111). Isomorphic.

export const EXAMPLE_ORDER = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock'];

/** The System examples, in their order after the FPGA ones (core/project-kind.js SYSTEM_EXAMPLES, #5214). */
export const SYSTEM_ORDER = ['uart-avr', 'spi-avr', 'i2c-avr', 'regs-avr', 'uart-fpga-pic24', 'adc-pmod', 'uart-fpga-pico', 'uart-fpga-esp32', 'uart-zynq', 'regs-zynq'];

/** The processor boards' examples (#5874), Board projects of one board alone (core/processor-board.js: a System of its
 *  one microcontroller node, its board named), by Board Type (core/processor-board.js BOARD_TYPES' ids): the FPGA
 *  examples' designs (blinky, traffic, stopwatch, clock, lock), the same behaviour on the board's own LEDs, buttons
 *  and display, named with the board's suffix, so that the hardware and the software solutions of a problem compare.
 *  The Explorer 16/32's in PIC24 assembly; the Arduino's, the Pico's and the ESP32's come with their shields (#5898). */
export const PROCESSOR_EXAMPLES = {
  avr: [],
  pic24: ['blinky-pic24', 'traffic-pic24', 'stopwatch-pic24', 'clock-pic24', 'lock-pic24'],
  rp2040: [],
  esp32: [],
};
/** The processor boards' examples in their order: after the Circuit versions, before the System examples. */
export const PROCESSOR_ORDER = Object.values(PROCESSOR_EXAMPLES).flat();
/** The Board Type of a Board example (#5874: New Project's Board Type, the MCP's list_examples): a processor's (its
 *  arch: avr, pic24, rp2040, esp32), else 'fpga'; null for an example that makes no Board project (a System example, a
 *  Circuit version). */
export function exampleBoardType(name) {
  const t = Object.keys(PROCESSOR_EXAMPLES).find(k => PROCESSOR_EXAMPLES[k].includes(name));
  return t ?? (exampleModes(name).includes('board') ? 'fpga' : null);
}

/** The Circuit versions of the FPGA examples (#5757's 4a, roadmap #5753), Circuit projects of their own: drawings only (a
 *  schematic of the palette's symbols, state diagrams, truth tables, an ASM chart, a Petri net, a breadboard), no board,
 *  each with its self-checking test bench: the crossing, the knight rider, the stopwatch, the combination lock. */
export const CIRCUIT_ORDER = ['traffic-circuit', 'blinky-circuit', 'stopwatch-circuit', 'lock-circuit'];
/** The examples a Circuit project can start from (#5757, roadmap #5753): drawings and circuits only, no HDL of their own
 *  (core/project-kind.js ownSources: none), made with no board. gates and breadboard are Board projects' too, on their
 *  boards; the Circuit versions (CIRCUIT_ORDER) Circuit projects' only. */
export const CIRCUIT_EXAMPLES = ['gates', 'breadboard', ...CIRCUIT_ORDER];

/** The modes an example starts a project in (#5757: core/project-mode.js): a System example System; a Circuit version
 *  Circuit; gates and breadboard Circuit or Board; every other Board (a processor board's too, #5874). New Project's Start from by its card, the MCP's
 *  list_examples. */
export const exampleModes = name => (SYSTEM_ORDER.includes(name) ? ['system'] : CIRCUIT_ORDER.includes(name) ? ['circuit'] : CIRCUIT_EXAMPLES.includes(name) ? ['circuit', 'board'] : ['board']);

/** Example names in the listing order: the known ones first (EXAMPLE_ORDER, the Circuit versions, the processor boards'
 *  (#5874), then the System ones'), then any other, by name. */
export function orderExamples(names) {
  const known = [...EXAMPLE_ORDER, ...CIRCUIT_ORDER, ...PROCESSOR_ORDER, ...SYSTEM_ORDER];
  const rank = n => { const i = known.indexOf(n); return i < 0 ? known.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** The examples renamed (#5894): the System examples of the uart example's FPGA with a microcontroller, now
 *  uart-fpga-<board>, their short names the processor boards' own uart examples'. */
export const EXAMPLE_ALIASES = { 'uart-pic24': 'uart-fpga-pic24', 'uart-pico': 'uart-fpga-pico', 'uart-esp32': 'uart-fpga-esp32' };
/** An example's name as given (a link's, a short link's, the MCP's, New Project's): its new name if it is an old one
 *  that no example has now (#5894), else as it is. */
export const exampleName = name => ([...EXAMPLE_ORDER, ...CIRCUIT_ORDER, ...PROCESSOR_ORDER, ...SYSTEM_ORDER].includes(name) ? name : EXAMPLE_ALIASES[name] ?? name);

// The example projects (examples/<name>), in the order the interface lists them: from the first
// steps (gates: combinational logic drawn as a schematic; breadboard: 74LS chips wired on a breadboard, #3901;
// traffic: a state diagram and a truth table)
// to the larger designs; uart, serial communication with a terminal (#2537); lock, every kind of source in one design
// (#5111). Isomorphic.

export const EXAMPLE_ORDER = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock'];

/** The System examples, in their order after the FPGA ones (core/project-kind.js SYSTEM_EXAMPLES, #5214). */
export const SYSTEM_ORDER = ['uart-avr', 'spi-avr', 'i2c-avr', 'regs-avr', 'uart-pic24', 'adc-pmod', 'uart-pico', 'uart-esp32'];

/** The processor boards' examples (#5874), Board projects of one board alone (core/processor-board.js: a System of its
 *  one microcontroller node, its board named), by Board Type (core/processor-board.js BOARD_TYPES' ids), each type's in
 *  the FPGA examples' teaching order where its board has the parts: an LED blinking; its buttons to its LEDs; a counter;
 *  its console's echo; its potentiometer (ADC) on its LEDs. */
export const PROCESSOR_EXAMPLES = {
  avr: ['blinky-arduino', 'counter-arduino'],
  pic24: ['blinky-pic24', 'buttons-pic24', 'counter-pic24', 'adc-pic24'],
  rp2040: ['blinky-pico', 'counter-pico', 'echo-pico'],
  esp32: ['blinky-esp32', 'counter-esp32'],
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

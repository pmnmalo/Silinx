// The warnings of a build of each example on the Spartan-3A Starter Kit (#3872): the port bits the board has no pin
// for (its display's 12: the board has none; the buttons and switches it lacks), each on a header pin, J18's, J20's,
// then the FX2 connector's, in the order of the ports; shared by test/board-headers.test.js and test/ise/examples.test.js
const POOL = [0, 1, 2, 3].map(i => `j18_io<${i}>`).concat([0, 1, 2, 3].map(i => `j20_io<${i}>`), [...Array(40).keys()].map(i => `fx2_io<${i}>`));
const SEG = [0, 1, 2, 3, 4, 5, 6].map(i => `seg<${i}>`), AN = [0, 1, 2, 3].map(i => `an<${i}>`);
const BTN = ['btn<1>', 'btn<2>', 'btn<3>'], SW = ['sw<4>', 'sw<5>', 'sw<6>', 'sw<7>'];
export const S3A_HEADER_BITS = {
  gates: [], breadboard: [], traffic: [...SEG, 'dp', ...AN], blinky: ['btn<1>', ...SEG, 'dp', ...AN], pong: [...BTN, ...SEG, ...AN, 'dp'],
  stopwatch: [...BTN, ...SEG, 'dp', ...AN], clock: [...BTN, ...SEG, ...AN, 'dp'], vga: BTN, isqrt: [...SW, ...SEG, 'dp', ...AN],
  uart: [...SEG, 'dp', ...AN], micro80: [...SW, ...SEG, 'dp', ...AN],
};
export const s3aHeaderWarnings = name => S3A_HEADER_BITS[name].map((b, i) => `${b}: the s3a-starter has no pin for it; it is on the header pin ${POOL[i]} (the board's constraints)`);

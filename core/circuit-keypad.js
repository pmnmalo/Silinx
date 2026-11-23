// A 4×4 matrix keypad (#5364, part of #3902 and co-design's phase 2; docs/CIRCUITS.md): a membrane keypad's 16 keys
// (1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D) and its ribbon's 8 pins, rows R1..R4 then columns C1..C4, on the 0.1 inch grid
// under it. Each key is a momentary contact joining its row to its column while pressed, as a push button's
// (core/circuit-sim.js: two keys at once, and the ghosting of a real keypad, three keys joining a fourth's row and
// column); each key an input of the HDL, its port the keypad's label and the key's name (KP1_1, KP1_star, KP1_hash,
// KP1_D). A program scans it as on the bench: its rows driven low one at a time, its columns pulled up and read.
// Isomorphic module.

/** The keys in reading order, row by row. */
export const KEYPAD_KEYS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];
// a key's name in a port: a letter or a digit as it is, * and # spelled
const keyName = (k) => ({ '*': 'star', '#': 'hash' }[k] ?? k);

export const KEYPAD_4X4 = {
  type: 'keypad-4x4', title: 'Keypad 4×4 (matrix)', kind: 'input', prefix: 'KP', keys: KEYPAD_KEYS,
  pins: [...[1, 2, 3, 4].map((r) => `R${r}`), ...[1, 2, 3, 4].map((c) => `C${c}`)].map((name, i) => ({ n: i + 1, name, dir: 'pass', dx: i, dy: 0 })),
  inputs: KEYPAD_KEYS.map((k) => ({ k: keyName(k), kind: 'momentary' })),
  contacts: KEYPAD_KEYS.map((_, i) => ({ a: Math.floor(i / 4) + 1, b: 5 + (i % 4), input: i, when: true })),
  // (its body, 2.7 x 3 inch as the membrane's, over its ribbon: the editor's Fit and print)
  size: { x0: -10, y0: -33, x1: 17, y1: 0.6 },
};

/** A key's name as a user says it (`KP1`'s key `5`), by its input's index. */
export const keypadKey = (i) => KEYPAD_KEYS[i];

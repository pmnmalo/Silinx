// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The standard the logic primitives are drawn in (#4113): the viewer's preference, Settings ▸ Schematic Symbols.
//   ieee  IEEE Std 91-1984's distinctive shapes: the AND's D, the OR's shield, the XOR's second back, the inverter's
//         triangle, as ISE draws them (the default)
//   iec   IEC 60617-12's rectangles: a box with its qualifier inside it (& AND, ≥1 OR, =1 XOR, 1 an inverter or a
//         buffer); a negation is the negation circle (a bubble) where the line meets the box, as the distinctive
//         shapes have it, not the polarity indicator (a triangle)
// The look only: a symbol's pins, its box and what it connects are the same in both, so the wires stay where they
// are; the saved schematic, the netlist, the HDL and the ISE export do not change. The schematic's drawing
// (web/js/sch-svg.js), the RTL and technology schematics (web/js/schematic-view.js) and the circuit editor's Show inside
// (web/js/circuit-draw-inside.js) draw an IEC box with iecGate. Isomorphic (no DOM).

/** The standards, in the menu's order: [id, label] (the labels translated by web/js/i18n.js). */
export const SYMBOL_STANDARDS = Object.freeze([
  Object.freeze(['ieee', 'IEEE Std 91-1984 (distinctive shapes)']),
  Object.freeze(['iec', 'IEC 60617-12 (rectangular)']),
]);
export const SYMBOL_STANDARD_IDS = Object.freeze(SYMBOL_STANDARDS.map(([id]) => id));
export const DEFAULT_SYMBOL_STANDARD = 'ieee';
/** v when it is a standard's id, else the default. */
export const symbolStandardOf = (v) => (SYMBOL_STANDARD_IDS.includes(v) ? v : DEFAULT_SYMBOL_STANDARD);

// a gate's function without its negation: and, or, xor or buf (an inverter, a buffer)
const BASE = { and: 'and', nand: 'and', or: 'or', nor: 'or', xor: 'xor', xnor: 'xor', not: 'buf', inv: 'buf', buf: 'buf' };
const QUALIFIER = { and: '&', or: '≥1', xor: '=1', buf: '1' };
/** The IEC qualifier of a gate's function (and, nand, or, nor, xor, xnor, not / inv, buf), null for another. */
export const iecQualifier = (fn) => QUALIFIER[BASE[String(fn).toLowerCase()]] ?? null;
/** Whether the function inverts its output (nand, nor, xnor, not / inv). */
export const invertsOutput = (fn) => /^(nand|nor|xnor|not|inv)$/i.test(String(fn));

/**
 * An IEC gate in the box x, y, w, h (its body: the inputs' lines end at its left side, the output's at its right, or at
 * its bubble's right when it inverts): { rect: {x, y, w, h}, text: {x, y, label}, bubble: {cx, cy, r} | null, outX }.
 * The qualifier in the box's middle (its baseline 3 below it: upright, whichever way the gate is turned); the bubble of
 * radius r on the right side's middle.
 */
export function iecGate(fn, { x, y, w, h, r = 3 }) {
  const inv = invertsOutput(fn);
  return {
    rect: { x, y, w, h },
    text: { x: x + w / 2, y: y + h / 2 + 3, label: iecQualifier(fn) ?? String(fn) },
    bubble: inv ? { cx: x + w + r, cy: y + h / 2, r } : null,
    outX: x + w + (inv ? 2 * r : 0),
  };
}

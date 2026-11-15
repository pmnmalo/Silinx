// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// How two wires that cross without connecting are drawn (#4101): a choice of the schematic's and the circuit's ⋮ menus,
// titled as the wires' style is (Wires: Direct, Orthogonal, Curved): Hop-overs, a small arc (#692), or Plain crossings,
// the wires straight across each other (a connection keeps its dot). A view only: the nets, the HDL the same.
import { menuChoice, setChoice } from './toolbar-menu.js';

const CROSSINGS_TITLE = 'Wire crossings';
const OPTIONS = [
  { value: 'hops', label: 'Hop-overs', title: 'Draw a small arc where two wires cross without connecting' },
  { value: 'plain', label: 'Plain crossings', title: 'Draw two wires that cross without connecting straight across each other (a connection has its dot)' },
];

/** The menu's entries (its title, then its two items): hops() on or off; onChange(on) when the other is chosen. */
export function crossingsChoice(hops, onChange) {
  const items = menuChoice(CROSSINGS_TITLE, OPTIONS, { value: hops ? 'hops' : 'plain', title: 'How two wires that cross without connecting are drawn',
    onChange: v => { onChange(v === 'hops'); setChoice(items, v); } });
  return items;
}

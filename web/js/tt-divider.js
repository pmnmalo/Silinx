// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The divider between a truth table's column (the table, its notes) and its expressions (#4099): dragged left or right
// (ui.js splitter, as the main window's panels), ← → with the keyboard 20px a press (as a state diagram's panel); the
// column's width remembered for the next table opened; dragged, the expressions keep 200px (web/css/truthtable.css).
import { h, splitter } from './ui.js';
import { prefKey } from './prefs.js';

const KEY = 'silinx.tt.leftW';

/** The divider of `left`, the table's column: the element to put between it and the expressions. */
export function ttDivider(left) {
  const divider = h('div', { class: 'tt-split', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', title: 'Drag to resize the panel (← → with the keyboard)' });
  splitter(divider, left, { dir: 'h', min: 120, max: 4000, storageKey: KEY });
  // (a width of its own: no longer at most 48 %, the table's own width)
  left.classList.toggle('tt-sized', !!left.style.width);
  divider.addEventListener('pointerdown', () => left.classList.add('tt-sized'));
  divider.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    left.classList.add('tt-sized');
    left.style.width = `${Math.max(120, left.offsetWidth + (e.key === 'ArrowRight' ? 20 : -20))}px`;
    try { localStorage.setItem(prefKey(KEY), left.style.width); } catch { /* storage unavailable */ }
  });
  return divider;
}

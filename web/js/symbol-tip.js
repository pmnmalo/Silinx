// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A symbol's or a part's tip in the Schematic editor's Symbols panel and the circuit editor's Parts panel (#4524): a card
// beside the row the mouse rests on (or the keyboard's focus), with its drawing larger (the row's own, in Settings ▸
// Schematic Symbols' standard, its IEC qualifier in it), its name, what it does (a gate's function) and how it is drawn
// in the standard ("IEC 60617-12: a box with ≥1, a bubble on its output"), then the row's own tip (how to place it).
// The browser's tip of the row is held back while the card shows (its title kept, given back when it goes).
import { h } from './dom.js';
import { t } from './i18n.js';
import { gateFunction, symbolLook } from '/core/symbol-standard.js';
import { getSymbolStandard } from './symbol-standard.js';

const DELAY = 350, SCALE = 2.5;
/** The card's drawing's size (a thumbnail's, 54 × 34, 2.5 times). */
export const TIP_W = 135, TIP_H = 85;
let current = null;   // (the card shown: one at a time)
// (a row clicked: no card while the mouse stays where it clicked, the panel drawn again under it as it picks the symbol)
let quiet = null;
/** Hides the card shown, if any (a panel drawn again: its rows gone). */
export const hideSymbolTip = () => current?.();

// the card's lines of a symbol or a part: [function, look] (those it has), info: { fn (a gate's function), qualifier
// (an MSI block's IEC general qualifier) } of a row, std the standard
function tipLines({ fn = null, qualifier = null } = {}, std = getSymbolStandard()) {
  return [fn && gateFunction(fn), symbolLook(fn, std, qualifier)].filter(Boolean);
}

/**
 * Gives row (a Symbols panel's or a Parts panel's row, its drawing its first <svg>, its name its `.nm`) the card,
 * shown in the editor's element (host, a selector: its styles draw the symbol); info(): the row's { fn, qualifier };
 * big(): its drawing TIP_W × TIP_H (null: the row's thumbnail 2.5 times larger).
 */
export function attachSymbolTip(row, host, info = () => ({}), big = null) {
  let timer = 0, card = null, held = null;
  const hide = () => {
    if (current === hide) current = null;
    clearTimeout(timer); timer = 0;
    card?.remove(); card = null;
    if (held !== null) { if (!row.hasAttribute('title')) row.setAttribute('title', held); held = null; }
  };
  const show = () => {
    timer = 0;
    if (!row.isConnected) return;
    const pv = big?.() ?? row.querySelector('svg')?.cloneNode(true);
    if (pv && !big) {
      pv.setAttribute('width', Math.round(+pv.getAttribute('width') * SCALE));
      pv.setAttribute('height', Math.round(+pv.getAttribute('height') * SCALE));
    }
    pv?.classList.add('sym-tip-pv');
    const name = row.querySelector('.nm')?.textContent.trim() || '';
    const tip = held ?? row.getAttribute('title') ?? '';
    card = h('div', { class: 'sym-tip', role: 'tooltip', 'data-no-i18n': 'true' }, pv || '',
      h('div', { class: 'sym-tip-name', text: name }),
      ...tipLines(info()).map((l) => h('div', { class: 'sym-tip-line', text: t(l) })),
      ...(tip ? [h('div', { class: 'sym-tip-how', text: tip })] : []));
    (row.closest(host) || document.body).append(card);
    // (beside the row, on the panel's other side of it; kept in the window)
    const r = row.getBoundingClientRect(), c = card.getBoundingClientRect();
    const right = r.right + 8 + c.width <= innerWidth ? r.right + 8 : Math.max(4, r.left - 8 - c.width);
    Object.assign(card.style, { left: `${Math.round(right)}px`, top: `${Math.round(Math.max(4, Math.min(r.top, innerHeight - c.height - 4)))}px` });
  };
  const arm = () => {
    if (timer || card) return;
    // (the browser's own tip held back: the card says it)
    if (held === null && row.hasAttribute('title')) { held = row.getAttribute('title'); row.removeAttribute('title'); }
    if (current !== hide) current?.();
    current = hide;
    timer = setTimeout(show, DELAY);
  };
  row.addEventListener('pointerenter', (e) => {
    if (quiet && Math.hypot(e.clientX - quiet.x, e.clientY - quiet.y) > 2) quiet = null;
    if (e.pointerType === 'mouse' && !quiet) arm();
  });
  row.addEventListener('pointerleave', () => { quiet = null; hide(); });
  row.addEventListener('pointerdown', (e) => { quiet = { x: e.clientX, y: e.clientY }; hide(); });
  row.addEventListener('focus', () => { if (row.matches(':focus-visible')) arm(); });
  row.addEventListener('blur', hide);
  row.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  return hide;
}

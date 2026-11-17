// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// Every side panel's width dragged (#4316): a handle on its inner edge (the left edge of a panel on the right, the
// right edge of one on the left), dragged by the mouse, a pen or a finger (pointer events), ← → from the keyboard when
// focused, 20px a press; between a minimum and a maximum, the canvas keeping room; the width remembered per panel
// (localStorage, its key `silinx.<editor>.<panel>.width`); a double-click gives the panel its default width back (its
// CSS's). Folded, the panel has its strip's width and no handle; on a narrow screen (the panel over the canvas,
// narrow.js) the handle works too, the panel at most 90 % of the editor. Called by mountSideFold (side-fold.js) and
// mountSchPanels (sch-panels.js), so every side panel has it. The handle sits beside the panel, not in it (the panel
// scrolls), placed over its edge. The look: app.css (.side-resize).
import { h } from './dom.js';
import { prefKey } from './prefs.js';
import { isNarrow, NARROW_QUERY } from './narrow.js';

export const SIDE_MIN = 160, SIDE_MAX = 720, CANVAS_MIN = 200, KEY_STEP = 20;

/** `w` between `min` and `max` and at most `room` (the room the canvas leaves), never under `min`; rounded. */
export function clampWidth(w, { min = SIDE_MIN, max = SIDE_MAX, room = Infinity } = {}) {
  return Math.round(Math.max(min, Math.min(max, room, w)));
}
/** The width kept under `key` (a number of pixels), or null. */
export function readWidth(key) {
  let v = null;
  try { v = localStorage.getItem(prefKey(key)); } catch { /* storage unavailable */ }
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function saveWidth(key, w) { try { localStorage.setItem(prefKey(key), String(Math.round(w))); } catch { /* storage unavailable */ } }
export function forgetWidth(key) { try { localStorage.removeItem(prefKey(key)); } catch { /* storage unavailable */ } }

/** The side panel `side` of the editor `root` resizable; `toward`: the side of the editor it is on ('right': its
 *  handle on its left edge); `foldCls`: the class of `root` when it is folded; `key`: its width's preference. Returns
 *  { width(), setWidth(w), reset(), apply(), handle }. */
export function mountSideResize({ root, side, key, toward = 'right', foldCls = null, min = SIDE_MIN, max = SIDE_MAX }) {
  const handle = h('div', {
    class: `side-resize side-resize-${toward === 'left' ? 'left' : 'right'}`, role: 'separator', 'aria-orientation': 'vertical',
    tabindex: '0', title: 'Drag to resize the panel (← → with the keyboard, a double-click: its default width)',
  });
  // (beside the panel once it is in the editor: some are mounted before they are placed)
  let ro = null, row = null;
  function attach() {
    if (!side.parentElement || (handle.parentElement === side.parentElement && handle.previousElementSibling === side)) return;
    side.after(handle);
    if (ro && row !== side.parentElement) { if (row) ro.unobserve(row); row = side.parentElement; ro.observe(row); }
  }
  let w = readWidth(key);
  const folded = () => !isNarrow() && !!foldCls && root.classList.contains(foldCls);
  const shown = () => !!side.getClientRects().length && side.offsetWidth > 0;
  // the room the canvas leaves: the panel's width and the widest other part beside it, less the canvas's minimum
  function room() {
    const row = side.parentElement;
    if (!row) return Infinity;
    if (isNarrow()) return row.clientWidth * 0.9;
    let canvas = 0;
    for (const c of row.children) if (c !== side && c !== handle && !c.classList.contains('side-resize')) canvas = Math.max(canvas, c.offsetWidth);
    return side.offsetWidth + canvas - CANVAS_MIN;
  }
  // over the panel's inner edge, in the handle's containing block
  function place() {
    attach();
    const on = shown() && !folded();
    handle.hidden = !on;
    if (!on) return;
    const cb = handle.offsetParent || document.body, r = cb.getBoundingClientRect(), s = side.getBoundingClientRect();
    const x = (toward === 'left' ? s.right : s.left) - r.left - cb.clientLeft + cb.scrollLeft;
    Object.assign(handle.style, { left: `${Math.round(x - 3)}px`, top: `${Math.round(s.top - r.top - cb.clientTop + cb.scrollTop)}px`, height: `${Math.round(s.height)}px` });
  }
  function apply() {
    const free = folded() || side.classList.contains('wide');   // (the implemented design's enlarged slice, its own width)
    const v = free || !w ? '' : isNarrow() ? `min(${Math.round(w)}px, 90%)` : `${Math.round(w)}px`;
    if (side.style.width !== v) { side.style.width = v; dispatchEvent(new Event('resize')); }
    place();
  }
  function setWidth(v, remember = true) {
    w = clampWidth(v, { min, max, room: room() });
    if (remember) saveWidth(key, w);
    apply();
  }
  function reset() { w = null; forgetWidth(key); apply(); }
  // dragging: the edge follows the pointer (a panel on the right grows to the left)
  handle.addEventListener('mousedown', (e) => e.preventDefault());
  handle.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const x0 = e.clientX, w0 = side.offsetWidth, sign = toward === 'left' ? 1 : -1;
    document.body.classList.add('resizing-h'); handle.classList.add('dragging');
    const mv = (ev) => { if (ev.pointerId === e.pointerId) setWidth(w0 + sign * (ev.clientX - x0), false); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-h'); handle.classList.remove('dragging');
      if (w) saveWidth(key, w);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); reset(); });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    const d = (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP) * (toward === 'left' ? 1 : -1);
    setWidth(side.offsetWidth + d);
  });
  // folded or expanded, enlarged, shown or hidden, the window or the editor resized: the width and the handle again
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (root !== side) new MutationObserver(apply).observe(side, { attributes: true, attributeFilter: ['class', 'hidden'] });
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => place());
    ro.observe(side);
  }
  globalThis.matchMedia?.(NARROW_QUERY).addEventListener?.('change', apply);
  apply();
  return { width: () => w, setWidth, reset, apply, handle };
}

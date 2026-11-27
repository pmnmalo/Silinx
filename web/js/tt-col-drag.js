// The truth table's columns reordered by their headers (#5863, web/js/truthtable.js): an input's or an output's header
// dragged left or right among its own group (a mouse, a finger or a pen: pointer events) lands where it is dropped, a
// mark on the header it will land before or after; a focused header moves one place with Alt+Shift+← / → (as a
// document's tab, docs/UI-GUIDELINES.md), its tip's second line saying so. An input never lands among the outputs,
// nor the reverse. A press that moves less than the threshold is a click (an output's header selects it); Escape leaves
// it where it was. The move itself is core/logic.js moveColumn's (`move(kind, from, to)`, the MCP's set_output_logic's
// shapeTable too); a read-only table refuses it, in the console (`refuse()`).
const SLOP = 8;   // (px: a press that moves less is a click)
export const COL_HINT = 'Drag to move it, or Alt+Shift+← / →';

const headers = (host, kind) => [...host.querySelectorAll(`th.tt-col[data-kind="${kind}"]`)];

/** The place a header of `kind` dragged from `from` lands at, for the pointer at x: before the first header whose middle is
 *  right of x (the dragged one left out). */
function placeAt(host, kind, from, x) {
  const others = headers(host, kind).filter((_, i) => i !== from);
  const j = others.findIndex(th => { const b = th.getBoundingClientRect(); return x < b.left + b.width / 2; });
  return j < 0 ? others.length : j;
}

/** Wires the headers' drag and keys in `host` (the table's box, drawn again at every change): once. */
export function wireColumnDrag(host, { move, readOnly, refuse }) {
  const clearMarks = () => { for (const th of host.querySelectorAll('th.tt-col')) th.classList.remove('tt-drop-before', 'tt-drop-after', 'tt-drag-src'); };
  host.addEventListener('pointerdown', e => {
    const th = e.target.closest?.('th.tt-col');
    if (!th || e.button !== 0 || !e.isPrimary) return;
    const kind = th.dataset.kind, from = Number(th.dataset.i), x0 = e.clientX, y0 = e.clientY;
    let dragging = false, to = from;
    const onMove = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < SLOP) return;
        if (readOnly()) { refuse(); return end(); }
        dragging = true; th.classList.add('tt-drag-src');
        try { th.setPointerCapture(ev.pointerId); } catch { /* (a synthetic pointer) */ }
      }
      ev.preventDefault();
      to = placeAt(host, kind, from, ev.clientX);
      clearMarks(); th.classList.add('tt-drag-src');
      const others = headers(host, kind).filter(x => x !== th);
      if (to < others.length) others[to].classList.add('tt-drop-before'); else others.at(-1)?.classList.add('tt-drop-after');
    };
    const onUp = () => { const was = dragging; end(); if (was && to !== from) move(kind, from, to); };
    const onKey = ev => { if (ev.key === 'Escape' && dragging) { ev.preventDefault(); ev.stopPropagation(); end(); } };
    // (a drag's click is not a click: the output's header not selected again)
    const noClick = ev => { ev.stopPropagation(); ev.preventDefault(); };
    function end() {
      if (dragging) { host.addEventListener('click', noClick, { capture: true, once: true }); setTimeout(() => host.removeEventListener('click', noClick, true), 0); }
      dragging = false; clearMarks();
      removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true);
      removeEventListener('pointercancel', end, true); removeEventListener('keydown', onKey, true);
    }
    addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', end, true); addEventListener('keydown', onKey, true);
  });
  host.addEventListener('keydown', e => {
    const th = e.target.closest?.('th.tt-col');
    if (!th || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); e.stopPropagation();
    if (readOnly()) { refuse(); return; }
    const kind = th.dataset.kind, from = Number(th.dataset.i), to = from + (e.key === 'ArrowLeft' ? -1 : 1);
    if (to < 0 || to >= headers(host, kind).length) return;   // (at its group's end)
    move(kind, from, to);
    headers(host, kind)[to]?.focus();   // (drawn again: the focus on its header in its new place)
  });
}

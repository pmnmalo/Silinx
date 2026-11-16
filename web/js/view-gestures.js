// A drawing's view gestures, all of them (#4291): the schematic editor's, for every editor and viewer of a drawing.
import { twoFingerView } from './ui.js';
import { wheelView, safariPinch } from './canvas-gestures.js';

// The schematic editor's gestures for any drawing `el` (an editor's or a viewer's canvas): the wheel and Safari's
// pinch, its gesture events (canvas-gestures.js); two fingers on a touch screen pan and pinch (ui.js twoFingerView: cancel() undoes what the first finger started); the
// middle button, or the left one with Space held down (the keyboard's focus in `keyEl`), drags the view. Every one is
// the view's: the editor's own tools (select, move, draw a wire) see none of its events, so none of them starts.
// pan(dx, dy) moves the view by client px, zoom(f, cx, cy) zooms it about a client point (each editor keeps its limits).
// `dragPan: false` for an editor that drags its view itself (the schematic's, the ASM chart's).
/** Wires the gestures on `el`; returns { spaceDown() }. */
export function viewGestures(el, { zoom, pan, cancel, keyEl = el, dragPan = true }) {
  // (Safari's pinch: about the pointer last seen on el when its event has none, else el's middle; none of iPadOS's
  // touch pinch, twoFingerView's: a finger on el. Its fingers are counted from their pointer events, the window's ones
  // listened to before twoFingerView's, which stops them; a first finger forgets one lifted unseen.)
  const fingers = new Set();
  let last = null;
  const lifted = e => {
    fingers.delete(e.pointerId);
    if (!fingers.size) { removeEventListener('pointerup', lifted, true); removeEventListener('pointercancel', lifted, true); }
  };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) fingers.clear();
    if (!fingers.size) { addEventListener('pointerup', lifted, true); addEventListener('pointercancel', lifted, true); }
    fingers.add(e.pointerId);
  }, true);
  el.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') last = [e.clientX, e.clientY]; }, { passive: true, capture: true });
  const middle = () => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const pinch = safariPinch({ zoom, touching: () => fingers.size > 0, at: () => last || middle() });
  el.addEventListener('gesturestart', pinch.start);
  el.addEventListener('gesturechange', pinch.change);
  el.addEventListener('gestureend', pinch.end);
  el.addEventListener('wheel', e => { if (!pinch.wheel(e)) wheelView(e, { zoom, pan }); }, { passive: false });
  twoFingerView(el, { cancel, pan, zoom });
  let space = false, drag = null;
  const ready = on => { space = on; el.classList.toggle('pan-ready', on); };
  if (dragPan) {
    // (a key of the drawing itself or of its editor's frame, not of a field or a button of it)
    const ours = t => t === keyEl || el.contains(t);
    keyEl.addEventListener('keydown', e => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || !ours(e.target)) return;
      e.preventDefault();      // (not the page scrolled)
      if (!space) ready(true);
    }, true);
    keyEl.addEventListener('keyup', e => { if (e.key === ' ' && space) ready(false); }, true);
    keyEl.addEventListener('focusout', e => { if (space && !keyEl.contains(e.relatedTarget)) ready(false); });
    const own = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
    const onMove = e => {
      if (e.pointerId !== drag?.id) return;
      own(e);
      pan(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const onUp = e => {
      if (e.pointerId !== drag?.id) return;
      own(e);
      drag = null;
      el.classList.remove('panning');
      removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true);
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || drag || !(e.button === 1 || (e.button === 0 && space))) return;
      own(e);
      keyEl.focus?.({ preventScroll: true });
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.classList.add('panning');
      addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true);
    }, true);
    // (the middle button's own scrolling, Windows' and Linux's, and its paste)
    el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  }
  return { spaceDown: () => space };
}

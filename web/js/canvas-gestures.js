// A drawing's view gestures, shared by its editors and viewers (#405: out of the schematic editor's sch-mouse.js).
// The wheel: a mouse's wheel (a line at a time, or whole notches of 50 px or more), Ctrl / Cmd with it, and a
// trackpad's pinch (which the browsers send as a wheel with Ctrl) zoom about the pointer, as smoothly as the wheel
// turns: by exp(-deltaY · k), never in steps; a trackpad's two-finger scroll pans the view (Shift: across).

/** A wheel event's view change: { zoom: f } (about the pointer: the factor) or { pan: [dx, dy] } (client px). */
export function wheelGesture(e) {
  if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 1 && e.deltaMode !== 0) || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)) {
    return { zoom: Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)) };
  }
  return { pan: [-(e.shiftKey ? e.deltaY : e.deltaX), -(e.shiftKey ? 0 : e.deltaY)] };
}

/** The wheel's 'wheel' handler: zoom(f, clientX, clientY) or pan(dx, dy), the page itself neither scrolled nor zoomed. */
export function wheelView(e, { zoom, pan }) {
  e.preventDefault();
  const g = wheelGesture(e);
  if (g.zoom) zoom(g.zoom, e.clientX, e.clientY);
  else pan(...g.pan);
}

// Safari's pinch (#4296): macOS Safari sends a trackpad's pinch as gesturestart / gesturechange / gestureend, `scale`
// the spread since gesturestart (1 at its start), not as a Ctrl + wheel; each gesturechange zooms by its scale over the
// last one, about the pointer (its clientX / clientY, else `at()`), as smoothly as the fingers. A browser that sends both
// kinds zooms once: in one gesture the first of them to come (a gesturechange or a Ctrl + wheel) zooms, the other is
// dropped. iPadOS Safari sends its gesture events for two fingers on the screen too, with their touch events, which
// twoFingerView (ui.js) zooms already: a gesture while `touching()` zooms nothing (its trackpad's pinch, no touch, does).
/** Safari's gesture events' handlers: start, change, end (each its event), and wheel(e): true when it is to be dropped. */
export function safariPinch({ zoom, touching = () => false, at = () => [0, 0] }) {
  let g = null;      // the gesture: the scale last applied, and what zooms it (null: not yet known, 'gesture', 'wheel', 'touch')
  const start = (e) => { e.preventDefault(); g = { scale: 1, by: touching() ? 'touch' : null }; };
  return {
    start,
    change(e) {
      e.preventDefault();      // (not the page zoomed)
      if (!g) start(e);
      if (g.by !== 'wheel' && touching()) g.by = 'touch';     // (fingers down on the screen: from now on theirs)
      if (g.by === 'touch' || g.by === 'wheel') return;
      const s = e.scale;
      if (!(s > 0) || !Number.isFinite(s)) return;
      g.by = 'gesture';
      const f = s / g.scale;
      g.scale = s;
      if (f === 1) return;
      const p = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? [e.clientX, e.clientY] : at();
      zoom(f, p[0], p[1]);
    },
    end(e) { e.preventDefault(); g = null; },
    wheel(e) {
      if (!g || !e.ctrlKey) return false;
      if (g.by == null) g.by = 'wheel';
      if (g.by === 'wheel') return false;
      e.preventDefault();
      return true;
    },
  };
}

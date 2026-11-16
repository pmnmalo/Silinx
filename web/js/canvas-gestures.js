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

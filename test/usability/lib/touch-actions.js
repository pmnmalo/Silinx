// Usability tests (#5206, phase 6): a person's fingers on a phone's or a tablet's screen, as the touch screen sends them
// (CDP's touch events, the harness's page.tap, touchDrag and touchGesture): a tap, a double tap (a Design row opened), a
// finger held on a button and lifted, one finger dragged (a state moved), two fingers dragged together (the view panned)
// or spread apart (a pinch: the view zoomed about their middle); the phone's panes (#5121, web/js/phone.js: its bar of
// Panels, Document and Console) and its toolbar's More tools (web/js/phone-toolbar.js), each by a tap. The fingers'
// paths are worked out here (pinchPaths, panPaths), apart from the page, for their own tests (test/usability-lib.test.js).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (a person's two taps of a double tap, apart: under the browser's double-tap time)
const DOUBLE_TAP_MS = 120;

/** Two fingers spread apart about `c` (a pinch): from `r0` px either side of it to `r1`, along a line at `angle`
 *  (radians): the view zoomed by r1 / r0 about `c`. touchGesture's [[from, to], [from, to]]. */
export function pinchPaths(c, r0, r1, angle = 0) {
  const at = (r, k) => ({ x: c.x + k * r * Math.cos(angle), y: c.y + k * r * Math.sin(angle) });
  return [[at(r0, -1), at(r1, -1)], [at(r0, 1), at(r1, 1)]];
}

/** Two fingers `gap` px apart (side by side about `c`) dragged together by (dx, dy): the view panned by as much. */
export function panPaths(c, dx, dy, gap = 60) {
  const f = (k) => { const a = { x: c.x + k * gap / 2, y: c.y }; return [a, { x: a.x + dx, y: a.y + dy }]; };
  return [f(-1), f(1)];
}

/** A drawing's view as its viewport's transform writes it: "translate(tx,ty) scale(s)" ({ tx, ty, s }). */
export function viewOfTransform(t = '') {
  const n = (String(t).match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
  return { tx: n[0] || 0, ty: n[1] || 0, s: n[2] ?? 1 };
}

export function touchActions(page) {
  const point = (target, opts) => page.point(target, opts);
  const finger = (x, y, id = 1) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
  const a = {
    tap: (target, opts) => page.tap(target, opts),
    /** Two taps on the same place (a Design row opened, as a double click does). */
    async doubleTap(target, opts) {
      const p = await point(target, opts);
      await page.tap(p);
      await sleep(DOUBLE_TAP_MS);
      await page.tap(p);
    },
    /** A finger put on `target` and kept there (lifted by `lift`). */
    async hold(target, opts) {
      const p = await point(target, opts);
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(p.x, p.y)] });
      return p;
    },
    lift: () => page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    /** One finger dragged from `from` to `to`. */
    drag: (from, to, opts) => page.touchDrag(from, to, opts),
    /** Two fingers dragged together by (dx, dy) about `c`. */
    pan: (c, dx, dy, gap) => page.touchGesture(panPaths(c, dx, dy, gap)),
    /** A pinch about `c`: two fingers spread from `r0` to `r1` px either side of it. */
    pinch: (c, r0, r1, angle) => page.touchGesture(pinchPaths(c, r0, r1, angle)),
    /** A phone's pane shown by its button in the bar at the bottom (side, doc, console). */
    async pane(p) {
      await page.tap(`#phone-panes [data-pane="${p}"]`);
      await page.waitFor((q) => document.documentElement.dataset.pane === q, [p], { what: `the phone's ${p} pane` });
    },
    /** An item of the phone toolbar's More tools (⋯), by its label in the page's language. */
    async more(label) {
      await page.tap('#phone-more');
      await page.waitFor(() => document.querySelector('body > .menu-popup .mi'), [], { what: 'More tools open' });
      await page.tap('body > .menu-popup .mi', { text: label });
    },
  };
  return a;
}

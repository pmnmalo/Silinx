// Usability tests (#5148): what a person does in the circuit editor (a breadboard's parts and wires, web/js/circuit-
// editor.js), through the interface: the parts panel and a click on the canvas, the Wire tool's clicks on holes and pins,
// drags, R, Delete, Edit ▸ Undo / Redo, Check. Coordinates are the circuit's grid (a hole's step, 20 px at 100 %),
// turned into the page's by the drawing's own transform, the view fitted and zoomed about them as a person would.
import { CIRC_CHECKS } from './circ-invariants.js';

export const CED = '.doc:not([hidden]) .circuit-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The circuit editor's actions on `page`. */
export function circActions(page) {
  const getDoc = () => page.eval(() => window.Silinx.active.circuitEditor.getModel());
  const t = (s) => page.eval(async (x) => (await import('/js/i18n.js')).t(x), s);
  const screen = (pts) => page.eval((ed, ps) => {
    const w = document.querySelector(`${ed} .circ-world`);
    const m = w.getScreenCTM();
    const r = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect();
    const rect = { left: r.left + 8, right: r.right - 8, top: r.top + 8, bottom: r.bottom - 8 };
    const all = ps.map(([x, y]) => ({ x: m.a * x * 20 + m.e, y: m.d * y * 20 + m.f }));
    return { scale: m.a, rect, all, qs: all.map((q) => (q.x > rect.left && q.x < rect.right && q.y > rect.top && q.y < rect.bottom ? q : null)) };
  }, CED, pts);
  /** Grid points' places on the page, all in view at a scale a person clicks at (a hole's step 12 px or more). */
  const view = async (pts) => {
    let v = await screen(pts);
    if (v.qs.every(Boolean) && v.scale >= 0.6) return v.qs;
    if (!v.qs.every(Boolean)) { await page.key('f'); await sleep(100); v = await screen(pts); }
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the circuit editor's view, the drawing fitted`);
    if (v.scale < 0.6) {
      const c = { x: v.all.reduce((s, q) => s + q.x, 0) / v.all.length, y: v.all.reduce((s, q) => s + q.y, 0) / v.all.length };
      let f = 0.8 / v.scale;
      for (const q of v.all) {
        if (q.x > c.x) f = Math.min(f, (v.rect.right - c.x) / (q.x - c.x)); else if (q.x < c.x) f = Math.min(f, (c.x - v.rect.left) / (c.x - q.x));
        if (q.y > c.y) f = Math.min(f, (v.rect.bottom - c.y) / (q.y - c.y)); else if (q.y < c.y) f = Math.min(f, (c.y - v.rect.top) / (c.y - q.y));
      }
      f *= 0.95;
      if (f > 1.05) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: -Math.log(f) / 0.01, modifiers: 2 });
        await sleep(100);
        v = await screen(pts);
      }
    }
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the circuit editor's view after the zoom`);
    return v.qs;
  };
  const at = async (x, y) => (await view([[x, y]]))[0];
  /** A part's middle, in grid units (its drawing's box on the page turned back). */
  const middle = (id) => page.eval((ed, pid) => {
    const g = document.querySelector(`${ed} .circ-world [data-id="${pid}"]`);
    if (!g) return null;
    const m = document.querySelector(`${ed} .circ-world`).getScreenCTM();
    const b = g.getBoundingClientRect();
    return [((b.left + b.right) / 2 - m.e) / m.a / 20, ((b.top + b.bottom) / 2 - m.f) / m.d / 20];
  }, CED, id);
  const select = async () => page.click(`${CED} [data-act=select]`);
  const focus = () => page.eval((ed) => document.querySelector(ed).focus(), CED);
  const menu = async (m, item) => page.menu(await t(m), await t(item));

  return {
    getDoc, view, at,
    async open(file) {
      await page.eval((f) => window.SilinxApp.openFile(f), file);
      await page.waitFor((ed) => document.querySelector(`${ed} .circ-world`)?.getScreenCTM(), [CED], { what: 'the circuit drawn' });
    },
    /** A part from the parts panel (searched by its type), placed by a click at (x, y). */
    async place(type, x, y) {
      const q = await at(x, y);
      await page.fill(`${CED} .circ-search`, type);
      await page.waitFor((ed, ty) => document.querySelector(`${ed} .circ-lib-part[data-part="${ty}"]`), [CED, type], { what: `${type} in the parts panel` });
      await page.eval((ed, ty) => document.querySelector(`${ed} .circ-lib-part[data-part="${ty}"]`).scrollIntoView({ block: 'center' }), CED, type);
      await page.click(`${CED} .circ-lib-part[data-part="${type}"]`);
      await page.click(q);
      await page.fill(`${CED} .circ-search`, '');
    },
    /** The Wire tool through the points (holes or pins); Esc ends it there, the Select tool again. */
    async addWire(points) {
      const qs = await view(points);
      await page.click(`${CED} .circ-tool`, { text: await t('Wire') });
      for (const q of qs) await page.click(q);
      await focus();
      await page.key('Escape');
      await select();
    },
    /** A part dragged by (dx, dy) grid steps, by its middle or by the grid point `grip` (a breadboard's channel where
     *  no IC is: its middle may be under one). */
    async movePart(id, dx, dy, { grip = null } = {}) {
      await select();
      const c = grip || await middle(id);
      const [a, b] = await view([c, [c[0] + dx, c[1] + dy]]);
      await page.drag(a, b, { steps: 10 });
    },
    /** A part clicked (selected). */
    async selectPart(id, { grip = null } = {}) { await select(); const c = grip || await middle(id); await page.click(await at(...c)); },
    /** A wire clicked and deleted: at a point of it where it is what a click picks (a part's body is picked before a
     *  wire drawn over it: a wire across an IC is not clicked there). */
    async deleteWire(id) {
      await select();
      const w = (await getDoc()).wires.find((x) => x.id === id);
      const cands = w.points.slice(1).flatMap((p, i) => [0.5, 0.25, 0.75, 0.1, 0.9].map((f) => [w.points[i][0] + (p[0] - w.points[i][0]) * f, w.points[i][1] + (p[1] - w.points[i][1]) * f]));
      const qs = await view(cands.length > 12 ? cands.slice(0, 12) : cands);
      let hit = null;
      for (const q of qs) {
        const top = await page.eval((x, y) => document.elementsFromPoint(x, y).find((e) => e.closest('[data-id]'))?.closest('[data-id]').dataset.id, q.x, q.y);
        if (top === id) { hit = q; break; }
      }
      if (!hit) throw new Error(`no point of wire ${id} a click picks it at`);
      await page.click(hit);
      await page.key('Delete');
    },
    async rotate(id, o) { await this.selectPart(id, o); await page.key('r'); },
    async deletePart(id, o) { await this.selectPart(id, o); await page.key('Delete'); },
    undo: () => menu('Edit', 'Undo'),
    redo: () => menu('Edit', 'Redo'),
    /** Check: the console's text it adds. */
    async check() {
      const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
      await page.click(`${CED} .circ-check`);
      await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
      await sleep(300);
      return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
    },
  };
}

/** The circuit's kit for a session (lib/session.js): its actions and its checks. */
export const CIRC_KIT = { actions: circActions, ...CIRC_CHECKS };

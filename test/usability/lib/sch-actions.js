// Usability tests (#5148): what a person does in the schematic editor, through the interface: the toolbar's tools, clicks
// and drags on the sheet, the Properties panel, Edit ▸ Undo / Redo. Coordinates are the sheet's (its grid of 10), turned
// into the page's by the drawing's own transform, whatever the zoom. The editor is read (getDoc) only to know where
// things are and to check what happened, never to make it happen.
import { symbolPins, symbolBox } from '../../../core/schdoc-symbols.js';

export const ED = '.doc:not([hidden]) .sch-editor';
/** Ctrl (Cmd on a Mac) for the keyboard's shortcuts. */
export const CTRL = process.platform === 'darwin' ? 4 : 2;

/** The schematic editor's actions on `page`. */
export function schActions(page) {
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  /** Sheet points' places on the page, the view's scale and its rectangle; a point out of the view null. */
  const screen = (pts) => page.eval((ed, ps) => {
    const g = document.querySelector(`${ed} svg .se-content`);
    const m = g.getScreenCTM();
    const r = g.ownerSVGElement.getBoundingClientRect();
    const rect = { left: r.left + 8, right: r.right - 8, top: r.top + 8, bottom: r.bottom - 8 };
    const qs = ps.map(([x, y]) => { const p = g.ownerSVGElement.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; });
    return { scale: m.a, rect, qs: qs.map((q) => (q.x > rect.left && q.x < rect.right && q.y > rect.top && q.y < rect.bottom ? q : null)), all: qs };
  }, ED, pts);
  /**
   * Sheet points' places on the page, all in the editor's view at a scale a person can click at (about 100 %, one grid
   * step 10 px): as a person would, the drawing fitted when a point is out of the view, then zoomed (Ctrl + wheel)
   * about the points as far as they all stay in it.
   */
  const view = async (pts) => {
    let v = await screen(pts);
    if (v.qs.every(Boolean) && v.scale >= 0.9) return v.qs;
    if (!v.qs.every(Boolean)) { await page.click(`${ED} .se-btn[data-act=fit]`); v = await screen(pts); }
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the editor's view, the drawing fitted`);
    if (v.scale < 0.9) {
      const c = { x: v.all.reduce((t, q) => t + q.x, 0) / v.all.length, y: v.all.reduce((t, q) => t + q.y, 0) / v.all.length };
      // (the zoom about c that keeps every point in the view: a point's distance from c grows by f)
      let f = 1 / v.scale;
      for (const q of v.all) {
        if (q.x > c.x) f = Math.min(f, (v.rect.right - c.x) / (q.x - c.x)); else if (q.x < c.x) f = Math.min(f, (c.x - v.rect.left) / (c.x - q.x));
        if (q.y > c.y) f = Math.min(f, (v.rect.bottom - c.y) / (q.y - c.y)); else if (q.y < c.y) f = Math.min(f, (c.y - v.rect.top) / (c.y - q.y));
      }
      f *= 0.95;
      if (f > 1.05) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: -Math.log(f) / 0.01, modifiers: 2 });
        await new Promise((r) => setTimeout(r, 100));
        v = await screen(pts);
      }
    }
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the editor's view after the zoom`);
    return v.qs;
  };
  /** A sheet point's place on the page, in the view (`view`). */
  const at = async (x, y) => (await view([[x, y]]))[0];
  const tool = (act) => page.click(`${ED} .se-btn[data-act=${act}]`);
  const symByName = async (name) => {
    const s = (await getDoc()).symbols.find((x) => x.name === name);
    if (!s) throw new Error(`no symbol ${name}`);
    return s;
  };
  // a menu's item by its English labels, in the page's language
  const menu = async (m, item) => {
    const [tm, ti] = await page.eval(async (a, b) => { const { t } = await import('/js/i18n.js'); return [t(a), t(b)]; }, m, item);
    return page.menu(tm, ti);
  };
  // a tool clicked at a point, the name it asks for typed in its box, Enter; the Select tool again
  const prompted = async (act, x, y, name) => {
    await tool(act);
    // (the point measured with the tool chosen: its options in the toolbar may move the sheet)
    await page.click(await at(x, y));
    await page.waitFor((ed) => document.querySelector(`${ed} .se-prompt input`), [ED], { what: 'the name asked' });
    await page.fill(`${ED} .se-prompt input`, name);
    await page.key('Enter');
    await page.waitFor((ed) => !document.querySelector(`${ed} .se-prompt`), [ED], { what: 'the name taken' });
    await tool('select');
  };
  const center = (s) => { const b = symbolBox(s); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };

  return {
    getDoc, at, view, tool,
    async open(file) {
      await page.eval((f) => window.SilinxApp.openSch(f), file);
      await page.waitFor((ed) => document.querySelector(`${ed} svg .se-content`)?.getScreenCTM(), [ED], { what: 'the schematic drawn' });
    },
    /** Add Wire through the points (sheet coordinates); Esc ends it where the last point is not a pin. */
    async addWire(points) {
      const qs = await view(points);
      await tool('wire');
      for (const q of qs) await page.click(q);
      await page.key('Escape');
      await tool('select');
    },
    /** Select a symbol (a click on its body). */
    async select(name) {
      await tool('select');
      const c = center(await symByName(name));
      await page.click(await at(c.x, c.y));
    },
    /** Drag a symbol by (dx, dy): its wires follow (rubber band). */
    async moveSymbol(name, dx, dy) {
      await tool('select');
      const c = center(await symByName(name));
      const [a, b] = await view([[c.x, c.y], [c.x + dx, c.y + dy]]);
      await page.drag(a, b, { steps: 10 });
    },
    /** Drag the segment of a wire at (x, y) by (dx, dy). */
    async moveSegment(x, y, dx, dy) {
      await tool('select');
      const [a, b] = await view([[x, y], [x + dx, y + dy]]);
      await page.drag(a, b, { steps: 10 });
    },
    /** A pin's sheet point ('U1', 'O'). */
    async pin(name, pinName) {
      const p = symbolPins(await symByName(name)).find((q) => q.name === pinName);
      if (!p) throw new Error(`no pin ${pinName} on ${name}`);
      return [p.x, p.y];
    },
    /** A parameter of a symbol in Properties (Width, the gate's inputs…), as typed or chosen there. */
    async setParam(name, param, value, { fresh = false } = {}) {
      // (fresh: the selection cleared first, a click on an empty corner of the sheet: the panel of a symbol selected
      // before a wire was drawn edits a stale copy of it, #5159)
      if (fresh) { await tool('select'); await page.click(await at(30, 1080)); }
      await this.select(name);
      // (the panel drawn again for it: its Instance name, the first field, is the symbol's)
      await page.waitFor((ed, n) => document.querySelector(`${ed} .se-props .se-field input`)?.value === n, [ED, name], { what: `${name}'s Properties` });
      await new Promise((r) => setTimeout(r, 100));
      const sel = `${ED} .se-props [data-param=${param}]`;
      await page.waitFor((s) => document.querySelector(s), [sel], { what: `the ${param} field` });
      await page.fill(sel, String(value));
    },
    async rotate(name) { await this.select(name); await tool('rotate'); },
    async deleteSymbol(name) { await this.select(name); await page.key('Delete'); },
    /** Place a symbol from the palette (its title searched) with its body's corner near (x, y). */
    async place(title, x, y) {
      const q = await at(x, y);
      await page.fill(`${ED} .se-search`, title);
      await page.click(`${ED} .se-symrow .nm`, { text: title });
      await page.click(q);
      await page.key('Escape');
      await tool('select');
      await page.fill(`${ED} .se-search`, '');
    },
    /** Select a wire's segment (a click on it at (x, y)). */
    async selectAt(x, y) { await tool('select'); await page.click(await at(x, y)); },
    /** Delete the wire whose segment is at (x, y) (selected with a click, Delete). */
    async deleteWire(x, y) { await this.selectAt(x, y); await page.key('Delete'); },
    /** The Net Name tool on the wire at (x, y): the name typed in the box it asks with. */
    async netName(x, y, name) { await prompted('net', x, y, name); },
    /** The I/O Marker tool on a pin or a wire's end at (x, y): its name typed in the box it asks with. */
    async ioMarker(x, y, name) { await prompted('io', x, y, name); },
    /** The symbols named copied (Ctrl+C, the editor focused) and pasted (Ctrl+V) with the mouse at (x, y). */
    async copyPaste(names, x, y) {
      await this.select(names[0]);
      for (const n of names.slice(1)) {
        const c = center(await symByName(n));
        await page.click(await at(c.x, c.y), { modifiers: 8 });   // (Shift + click: added to the selection)
      }
      await page.key('c', { modifiers: CTRL });
      const q = await at(x, y);
      await page.mouse('mouseMoved', q.x, q.y);
      await page.key('v', { modifiers: CTRL });
    },
    /** The toolbar's menu (⋮): Rearrange Wires ('rewire') or Rearrange Schematic ('relayout'). */
    async rearrange(act) {
      await page.click(`${ED} .se-btn[data-act=more]`);
      await page.click(`${ED} [data-act=${act}]`);
    },
    /** The junction dots drawn ('x,y', sorted). */
    dots: () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .junction`)].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).sort(), ED),
    undo: () => menu('Edit', 'Undo'),
    redo: () => menu('Edit', 'Redo'),
    /** Check Schematic: the console's lines it adds. */
    async check() {
      const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
      await tool('check');
      await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
      await new Promise((r) => setTimeout(r, 300));
      return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
    },
  };
}

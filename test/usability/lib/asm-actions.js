// Usability tests (#5148): what a person does in the ASM chart editor (web/js/asm-*.js), through the interface: the
// toolbar's add tools (a box at a click on the background, or on a box's free exit), a port dragged to a box (an arrow),
// a box dragged or nudged with the arrow keys, its text typed in Properties (or in the field a double click on it
// focuses), Delete. Points are the chart's, turned into the page's by the drawing's own transform; the view zoomed
// (Ctrl + wheel) to about 100 % about the points a step needs, as a person would. The editor is read (getModel) only
// to know where things are and to check what happened, never to make it happen.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The ASM chart editor's own actions (`base`: the drawing kit's, lib/draw-kit.js: its root's selector `ed`, `t`). */
export function asmActions(page, { ed, t, getDoc }) {
  /** Chart points' places on the page, the view's scale and its rectangle; a point out of the view null. */
  const screen = (pts) => page.eval((e, ps) => {
    const vp = document.querySelector(`${e} .asm-vp`);
    const m = vp.getScreenCTM(), b = vp.ownerSVGElement.getBoundingClientRect();
    const rect = { left: b.left + 8, right: b.right - 8, top: b.top + 8, bottom: b.bottom - 8 };
    const all = ps.map(([x, y]) => ({ x: m.a * x + m.e, y: m.d * y + m.f }));
    return { scale: m.a, rect, all, qs: all.map((q) => (q.x > rect.left && q.x < rect.right && q.y > rect.top && q.y < rect.bottom ? q : null)) };
  }, ed, pts);
  /** Chart points' places, all in the view at about 100 %: as a person would, the chart fitted when a point is out of
 *  the view, then zoomed (Ctrl + wheel) about the points as far as they all stay in it. */
  const view = async (pts) => {
    let v = await screen(pts);
    if (v.qs.every(Boolean) && v.scale >= 0.9) return v.qs;
    if (!v.qs.every(Boolean)) { await page.click(`${ed} .asm-btn[data-act=fit]`); v = await screen(pts); }
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the editor's view, the chart fitted`);
    if (v.scale >= 0.9) return v.qs;
    const c = { x: v.all.reduce((s, q) => s + q.x, 0) / v.all.length, y: v.all.reduce((s, q) => s + q.y, 0) / v.all.length };
    let f = 1 / v.scale;
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
    if (!v.qs.every(Boolean)) throw new Error(`${JSON.stringify(pts)} out of the editor's view after the zoom`);
    return v.qs;
  };
  // (boxes' points with their ports, above and below them, in the view)
  const around = (...ns) => ns.flatMap((q) => [[q.x, q.y - 50], [q.x, q.y + 50]]);
  const node = async (id) => {
    const n = (await getDoc()).nodes.find((x) => x.id === id);
    if (!n) throw new Error(`no box ${id}`);
    return n;
  };
  /** A box's middle on the page (zoomed with `more` chart points in the view too). */
  const boxAt = async (id, more = []) => { const n = await node(id); return (await view([[n.x, n.y], ...more]))[0]; };
  /** A port of a box on the page (the view already zoomed). */
  const portAt = (id, port) => page.eval((e, i, p) => {
    const b = document.querySelector(`${e} [data-node="${i}"] [data-port="${p}"]`)?.getBoundingClientRect();
    return b && { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, ed, id, port);
  const select = async (id) => {
    await page.click(await boxAt(id));
    await page.waitFor((e, i) => document.querySelector(`${e} [data-node="${i}"].sel`), [ed, id], { what: `${id} selected` });
  };
  /** The field of the selection's Properties under its label (in the page's language). */
  const field = async (label) => {
    const l = await t(label);
    const sel = await page.eval((e, x) => {
      const f = [...document.querySelectorAll(`${e} .asm-field`)].find((q) => q.querySelector('.asm-label')?.textContent === x);
      const i = f?.querySelector('input, textarea, select');
      if (!i) return null;
      i.dataset.usab = '1';
      return `${e} [data-usab]`;
    }, ed, l);
    if (!sel) throw new Error(`no field '${label}'`);
    return sel;
  };
  const tool = async (label) => page.click(`${ed} .draw-tool`, { text: await t(label) });
  return {
    view, boxAt, portAt, select,
    /** An add tool ('State', 'Decision', 'Cond. output'…) and a click on the background at (x, y); the arrow again. */
    async addAt(label, x, y) {
      const [q] = await view([[x, y]]);
      await tool(label);
      await page.click(q);
      await page.key('Escape');
    },
    /** An add tool and a click on a box: the new box on its free exit; the arrow again. */
    async addOn(label, id) {
      const q = await boxAt(id);
      await tool(label);
      await page.click(q);
      await page.key('Escape');
    },
    /** An exit's port of `from` dragged to the box `to`: the arrow drawn (an exit already drawn: moved there). */
    async connect(from, port, to) {
      const [a, b] = [await node(from), await node(to)];
      // (the port and the box measured in the same view)
      await view(around(a, b));
      const p = await portAt(from, port), [q] = (await screen([[b.x, b.y]])).all;
      await page.drag(p, q, { steps: 12 });
    },
    /** A box dragged by its middle by (dx, dy) of the chart. */
    async moveBox(id, dx, dy) {
      const n = await node(id);
      const [a, b] = await view([[n.x, n.y], [n.x + dx, n.y + dy]]);
      await page.drag(a, b, { steps: 10 });
    },
    /** A box selected, an arrow key pressed `times` (a grid step each). */
    async nudge(id, key, times = 1) { await select(id); for (let i = 0; i < times; i++) await page.key(key); },
    /** A box selected, its field under `label` in Properties typed. */
    async setField(id, label, value) { await select(id); await page.fill(await field(label), value); },
    /** A box double-clicked: the field it focuses (its text selected) typed over. */
    async typeOver(id, value) {
      await page.dblclick(await boxAt(id));
      await page.waitFor((e) => document.activeElement?.closest(`${e} .asm-side`) && document.activeElement.matches('[data-focus]'), [ed], { what: 'its field focused' });
      await page.type(value);
    },
    /** A box selected, Delete. */
    async deleteBox(id) { await select(id); await page.key('Delete'); },
    /** An arrow selected (a click on it, where no other is), Delete. */
    async deleteArrow(id) {
      const d = await getDoc(), e = d.edges.find((x) => x.id === id);
      const [a, b] = [d.nodes.find((x) => x.id === e.from), d.nodes.find((x) => x.id === e.to)];
      await view(around(a, b));
      const q = await page.eval((ed2, i) => {
        const p = document.querySelector(`${ed2} [data-edge="${i}"] .asm-edge-hit`);
        const c = p.getScreenCTM(), L = p.getTotalLength();
        for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          const r = p.getPointAtLength(L * f);
          const x = c.a * r.x + c.e, y = c.d * r.y + c.f;
          if (document.elementFromPoint(x, y)?.closest('[data-edge]')?.dataset.edge === i) return { x, y };
        }
        return null;
      }, ed, id);
      if (!q) throw new Error(`no point of the arrow ${id} to click`);
      await page.click(q);
      await page.waitFor((ed2, i) => document.querySelector(`${ed2} [data-edge="${i}"].sel`), [ed, id], { what: `${id} selected` });
      await page.key('Delete');
    },
  };
}

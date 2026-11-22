// Usability tests (#5148): what a person does in the Petri net editor (web/js/petri-*.js), through the interface (moved
// from petri.test.js, #5206, for the random sequences too): its tools, clicks and drags on the net, its Properties.
import { PLACE_R, TRANS_W, TRANS_H } from '../../../core/petri.js';
import { arcGeometry } from '../../../core/petri-geometry.js';

/** The Petri net editor's actions: its tools, clicks and drags on the net (its coordinates, turned into the page's by
 *  the drawing's own transform), its Properties. The net is read only to know where things are. */
export const pnActions = (page, { ed, t, getDoc }) => {
  const TOOLS = ['select', 'place', 'transition', 'arc', 'inhibitor'];   // (the toolbar's .pn-tool, in order)
  const tool = (name) => page.click(`${ed} .pn-tool`, { index: TOOLS.indexOf(name) });
  // points of the net on the page, the net fitted (Zoom to Full View) when one is out of the view, then zoomed out (a
  // point beyond the net, #5206)
  const screen = (pts) => page.eval((e, ps) => {
    const w = document.querySelector(`${e} .pn-world`), r = w.ownerSVGElement.getBoundingClientRect();
    return ps.map(([px, py]) => new DOMPoint(px, py).matrixTransform(w.getScreenCTM()))
      .map((q) => (q.x > r.left + 8 && q.x < r.right - 8 && q.y > r.top + 8 && q.y < r.bottom - 8 ? { x: q.x, y: q.y } : null));
  }, ed, pts);
  const view = async (pts) => {
    for (let i = 0; i < 6; i++) {
      const qs = await screen(pts);
      if (qs.every(Boolean)) return qs;
      await page.click(`${ed} [data-act=${i ? 'zout' : 'fit'}]`);
    }
    throw new Error(`${JSON.stringify(pts)} out of the editor's view, the net fitted`);
  };
  const at = async (x, y) => (await view([[x, y]]))[0];
  const nodeById = async (id) => {
    const m = await getDoc();
    const nd = [...m.places, ...m.transitions].find((x) => x.id === id);
    if (!nd) throw new Error(`no node ${id}`);
    return nd;
  };
  const centre = async (id) => { const nd = await nodeById(id); return at(nd.x, nd.y); };
  return {
    tool,
    async addPlace(x, y) { await tool('place'); await page.click(await at(x, y)); await tool('select'); },
    async addTransition(x, y) { await tool('transition'); await page.click(await at(x, y)); await tool('select'); },
    /** An arc drawn with the Arc (or Inhibitor) tool: a click on one node, then on the other. */
    async arc(from, to, { inhibitor = false } = {}) {
      await tool(inhibitor ? 'inhibitor' : 'arc');
      const [p, q] = await Promise.all([nodeById(from), nodeById(to)]);
      const [a, b] = await view([[p.x, p.y], [q.x, q.y]]);
      await page.click(a);
      await page.click(b);
      await tool('select');
    },
    /** A node selected (a click on it). */
    async select(id) { await tool('select'); await page.click(await centre(id)); },
    /** An arc selected (a click on its middle: a line's, or a curve's when an arc goes back beside it, #5266). */
    async selectArc(id) {
      const m = await getDoc();
      const g = arcGeometry(m, m.arcs.find((x) => x.id === id));
      if (!g) throw new Error(`no arc ${id}`);
      await tool('select');
      await page.click(await at(g.mid.x, g.mid.y));
    },
    /** A node dragged by (dx, dy). */
    async move(id, dx, dy) {
      const nd = await nodeById(id);
      await tool('select');
      const [p, q] = await view([[nd.x, nd.y], [nd.x + dx, nd.y + dy]]);
      await page.drag(p, q, { steps: 10 });
    },
    /** A field of the selection's Properties (its label in English) typed in. */
    async field(label, value) {
      const l = await t(label);
      const i = await page.waitFor((e, x) => [...document.querySelectorAll(`${e} .pn-selection .asm-field`)]
        .findIndex((f) => f.querySelector('.asm-label')?.textContent === x) + 1, [ed, l], { what: `the field ${label}` });
      await page.fill(`${ed} .pn-selection .asm-field:nth-of-type(${i}) :is(input, textarea)`, String(value));
    },
    /** The selection deleted (Del). */
    del: () => page.key('Delete'),
    /** The arcs as drawn whose ends are not on their nodes' rims ([] when every one is). */
    arcsOffNodes: (m) => page.eval((e, m, R, W, H) => {
      const node = (id) => [...m.places, ...m.transitions].find((x) => x.id === id);
      const on = (nd, x, y) => (m.places.includes(nd) ? Math.abs(Math.hypot(x - nd.x, y - nd.y) - R) < 1
        : Math.abs(x - nd.x) <= W / 2 + 3 && Math.abs(y - nd.y) <= H / 2 + 3);
      return [...document.querySelectorAll(`${e} .pn-arc`)].map((g) => {
        const a = m.arcs.find((x) => x.id === g.dataset.id), l = g.querySelector('.pn-arc-hit');
        const [p, q] = [l.getPointAtLength(0), l.getPointAtLength(l.getTotalLength())];
        return on(node(a.from), p.x, p.y) && on(node(a.to), q.x, q.y) ? null : a.id;
      }).filter(Boolean);
    }, ed, m, PLACE_R, TRANS_W, TRANS_H),
  };
};

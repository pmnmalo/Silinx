// Usability tests (#5148): what a person does in the state diagram editor (web/js/fsm-*.js), through the interface (moved
// from fsm.test.js, #5206, for the random sequences too): the State tool, a transition drawn from a state's rim, the text
// in place, drags, Properties' fields, Delete.
/** The state diagram's own actions: points of the diagram (its coordinates) turned into the page's by the drawing's
 *  transform; a state or a transition found by its id. */
export const fsmActions = (page, { ed, t, getDoc }) => {
  /** Diagram points' places on the page, null for one out of the canvas (a state's radius in from its edges). */
  const screen = (pts) => page.eval((e, ps) => {
    const vp = document.querySelector(`${e} .fsm-vp`), m = vp.getScreenCTM(), r = vp.ownerSVGElement.getBoundingClientRect();
    const k = 40;
    return ps.map(([x, y]) => ({ x: m.a * x + m.e, y: m.d * y + m.f })).map((q) => (q.x > r.left + k && q.x < r.right - k && q.y > r.top + k && q.y < r.bottom - k ? q : null));
  }, ed, pts);
  /** Diagram points' places, all in the view: as a person would, the diagram fitted (Zoom to Full View) when one is
   *  out of it, then zoomed out (#5206: a state added or moved beyond the view). */
  const view = async (pts) => {
    for (let i = 0; i < 6; i++) {
      const qs = await screen(pts);
      if (qs.every(Boolean)) return qs;
      await page.click(`${ed} .asm-btn[data-act=${i ? 'zout' : 'fit'}]`);
    }
    throw new Error(`${JSON.stringify(pts)} out of the state diagram's view`);
  };
  const stateAt = async (id) => (await getDoc()).states.find((s) => s.id === id);
  /** A state's circle on the page: its centre and radius (the state in the view). */
  const circle = async (id) => {
    const s = await stateAt(id);
    if (s) await view([[s.x, s.y]]);
    return circleOf(id);
  };
  const circleOf = (id) => page.eval((e, s) => {
    const b = document.querySelector(`${e} [data-state="${s}"] .fsm-circle`)?.getBoundingClientRect();
    return b && { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  }, ed, id);
  /** A point of the diagram on the page. */
  const at = (x, y) => page.eval((e, px, py) => {
    const m = document.querySelector(`${e} .fsm-vp`).getScreenCTM();
    return { x: m.a * px + m.e, y: m.d * py + m.f };
  }, ed, x, y);
  const select = async (id) => {
    const c = await circle(id);
    await page.click(c);
    await page.waitFor((e, s) => document.querySelector(`${e} [data-state="${s}"].sel`) && document.querySelector(`${e} .fsm-sname`), [ed, id], { what: `${id} selected` });
  };
  const selectTrans = async (id) => {
    await page.click(`${ed} [data-trans="${id}"] .fsm-label`);
    await page.waitFor((e) => document.querySelector(`${e} .fsm-cond`), [ed], { what: `${id} selected` });
  };
  return {
    circle, at, view, select, selectTrans,
    /** The State tool, a click on the diagram at (x, y); the arrow again (Escape). */
    async addState(x, y) {
      await page.click(`${ed} .draw-tool`, { text: await t('State') });
      const [q] = await view([[x, y]]);
      await page.click(q);
      await page.key('Escape');
    },
    /** A transition drawn from the rim of `from` (on the side facing `to`) to `to`'s centre: its text in place open. */
    async drawTransition(from, to) {
      const [p, q] = [await stateAt(from), await stateAt(to)];
      await view([[p.x, p.y], [q.x, q.y]]);
      const a = await circleOf(from), b = await circleOf(to);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const k = await page.eval((e) => document.querySelectorAll(`${e} [data-trans]`).length, ed);
      await page.drag({ x: a.x + (b.x - a.x) / d * (a.r - 3), y: a.y + (b.y - a.y) / d * (a.r - 3) }, b, { steps: 12 });
      await page.waitFor((e, m) => document.querySelectorAll(`${e} [data-trans]`).length === m + 1 && document.querySelector(`${e} .fsm-inline`), [ed, k], { what: 'the new transition, its text in place' });
    },
    /** The text in place (open) typed, Enter. */
    async typeInPlace(text) {
      await page.type(text);
      await page.key('Enter');
      await page.waitFor((e) => !document.querySelector(`${e} .fsm-inline`), [ed], { what: 'the text in place closed' });
    },
    /** A state dragged by its middle by (dx, dy) of the diagram. */
    async moveState(id, dx, dy) {
      const s = await stateAt(id);
      const [p, q] = await view([[s.x, s.y], [s.x + dx, s.y + dy]]);
      await page.drag(p, q, { steps: 10 });
    },
    /** A state selected, F2: its name and outputs in place. */
    async editInPlace(id) {
      await select(id);
      await page.key('F2');
      await page.waitFor((e) => document.activeElement?.matches(`${e} .fsm-inline`), [ed], { what: 'the text in place' });
    },
    /** A state's name typed in Properties. */
    async renameState(id, name) { await select(id); await page.fill(`${ed} .fsm-sname`, name); },
    /** A state's output value typed in Properties (its table's field). */
    async stateOutput(id, out, value) { await select(id); await page.fill(`${ed} .fsm-outvals.souts input[data-key="souts:${out}"]`, value); },
    /** A transition's condition typed in Properties. */
    async condition(id, cond) { await selectTrans(id); await page.fill(`${ed} .fsm-cond`, cond); },
    /** A state or a transition selected, Delete. */
    async deleteState(id) { await select(id); await page.key('Delete'); },
    async deleteTrans(id) { await selectTrans(id); await page.key('Delete'); },
    /** The ends of a transition's arc as drawn, on the page. */
    arcEnds: (id) => page.eval((e, tr) => {
      const p = document.querySelector(`${e} [data-trans="${tr}"] .fsm-edge-line`);
      const m = p.getScreenCTM(), L = p.getTotalLength();
      return [p.getPointAtLength(0), p.getPointAtLength(L)].map((q) => ({ x: m.a * q.x + m.e, y: m.d * q.y + m.f }));
    }, ed, id),
  };
};

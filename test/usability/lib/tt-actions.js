// Usability tests (#5148): what a person does in the truth table editor (web/js/truthtable.js), through the interface
// (moved from truthtable.test.js, #5206, for the random sequences too): the Inputs and Outputs boxes, the cells, an
// output's expression, its HDL logic ticked, the Karnaugh map.
/** The truth table editor's actions: its toolbar's boxes, the table's cells, an output's tab and expression, the
 *  Karnaugh map. The table is read only to check what happened. */
export const ttActions = (page, { ed }) => {
  // a text box's whole text replaced by what is typed, then Enter
  const retype = async (sel, text) => {
    await page.click(sel);
    await page.eval((s) => document.querySelector(s).select(), sel);
    await page.type(text);
    await page.key('Enter');
  };
  const mapShown = () => page.eval((e) => !!document.querySelector(`${e} .tt-kmap-res .tt-kmap-on.active`), ed);
  return {
    /** The Inputs (or Outputs) box: its names typed. */
    inputs: (names) => retype(`${ed} .tt-inputs`, names),
    outputs: (names) => retype(`${ed} .tt-outputs`, names),
    /** The box typed in left: a click on the table's caption. */
    leave: () => page.click(`${ed} .tt-left .tt-caption`),
    /** An output's cell of the table clicked (row r): scrolled to the middle of the table first, as a person does (a
     *  cell scrolled only into view, at its bottom edge, is under the table's scroll bar, #5206). */
    async cell(out, r) {
      const c = `${ed} .tt-cell[data-out=${out}][data-row="${r}"]`;
      await page.eval((x) => document.querySelector(x).scrollIntoView({ block: 'center', inline: 'center' }), c);
      await page.click(c);
    },
    /** An output's tab clicked. */
    tab: (out) => page.click(`${ed} .tt-tab[data-out=${out}]`),
    /** An output's column filled from an expression typed in its box (its tab first), Enter. */
    async expr(out, text) { await this.tab(out); await retype(`${ed} .tt-expr-in`, text); },
    /** The output's Karnaugh map shown (Show K-map under its result), when it is not. */
    async showKmap() {
      if (!(await mapShown())) await page.click(`${ed} .tt-kmap-res .tt-kmap-on`);
      await page.waitFor((e) => document.querySelector(`${e} svg.tt-kmap .tt-kcell`), [ed], { what: 'the Karnaugh map' });
    },
    /** A cell of the Karnaugh map clicked (its minterm). */
    kcell: (mt) => page.click(`${ed} svg.tt-kmap .tt-kcell[data-row="${mt}"] .tt-k-m`),
    /** An output's result ticked as its HDL logic (`form`: nand, nor, xor, kmap-res…). */
    async tick(out, form) {
      await this.tab(out);
      // (scrolled to the middle of the results first, as a person does: scrolled only into view, at their bottom edge, the
      // click falls on the results' pane, not on the tick box)
      const box = `${ed} .tt-res.tt-${form} .tt-hdl`;
      await page.eval((b) => document.querySelector(b).scrollIntoView({ block: 'center' }), box);
      await page.click(box);
    },
    /** What the editor shows: the cells of an output, its map's groups. */
    cells: (out) => page.eval((e, o) => [...document.querySelectorAll(`${e} .tt-cell[data-out=${o}]`)].map((c) => c.textContent).join(''), ed, out),
    groups: () => page.eval((e) => new Set([...document.querySelectorAll(`${e} svg.tt-kmap .tt-group`)].map((g) => g.dataset.term)).size, ed),
    kvalues: () => page.eval((e) => Object.fromEntries([...document.querySelectorAll(`${e} svg.tt-kmap .tt-kcell`)].map((g) => [g.dataset.row, g.classList[1].slice(1)])), ed),
  };
};

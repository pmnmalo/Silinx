// Usability (#5148, part 4): the Boolean Algebra / Karnaugh Map editor (the truth table) as a person uses it: on a new
// empty table, inputs and outputs added in their boxes (typed, Enter), the output cells clicked (0 → 1 → X → 0), a
// column filled from a typed expression, the Karnaugh map shown and a cell clicked on it; on the traffic example's
// lamps (examples/traffic, src/lamps.bool.json) a value changed and changed back, an output's HDL logic ticked (its
// NAND form), an input removed; on the lock's digit_ok (examples/lock, src/digit_ok.bool.json, six inputs: four maps)
// an output added, filled and its map clicked. After every step the HDL the table makes in VHDL and Verilog is compiled
// and elaborated (the table has no Check of its own); Undo back to the start and Redo to the end. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { newTable } from '../../core/logic.js';

const FILE = 'test/usability/truthtable.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

/** The truth table editor's actions: its toolbar's boxes, the table's cells, an output's tab and expression, the
 *  Karnaugh map. The table is read only to check what happened. */
const ttActions = (page, { ed }) => {
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
    /** An output's cell of the table clicked (row r). */
    cell: (out, r) => page.click(`${ed} .tt-cell[data-out=${out}][data-row="${r}"]`),
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
const KIT = drawKit('tt', ttActions);

async function table(page, title, { template, file, files }) {
  const name = `UsabTt${++n}`;
  await makeProject(env, { name, ...(files ? { top: '', files } : { template }) });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, kit: KIT });
  await s.open(file);
  return s;
}
const col = (out, v) => (d) => assert.equal(d.table[out], v, `${out}: ${d.table[out]}`);
/** The cells the editor shows are the table's, every output's. */
const shown = (a) => async (d) => { for (const o of d.outputs) assert.equal(await a.cells(o), d.table[o], `${o}'s cells`); };

uiTest('usability: truth table: a new table: an input and an output added, cells clicked (0, 1, X), an expression; the K-map; Undo, Redo', E, async (page) => {
  const s = await table(page, 'new table', { file: 'src/maj.bool.json', files: { 'src/maj.bool.json': JSON.stringify(newTable('maj', ['a', 'b'], ['f']), null, 2) } });
  const { a } = s;
  await s.step('inputs', { names: 'a, b, c' }, () => a.inputs('a, b, c'), {
    expect: (d) => { assert.deepEqual(d.inputs, ['a', 'b', 'c']); col('f', '00000000')(d); },
  });
  await s.step('outputs', { names: 'f, g' }, () => a.outputs('f, g'), {
    expect: (d) => { assert.deepEqual(d.outputs, ['f', 'g']); col('g', '00000000')(d); },
  });
  // f the majority: its 1s at rows 3, 5, 6, 7
  for (const r of [3, 5, 6, 7]) await s.step('cell', { out: 'f', row: r }, () => a.cell('f', r), { expect: (d) => assert.equal(d.table.f[r], '1') });
  // row 0 clicked twice: 1, then don't care
  await s.step('cell', { out: 'f', row: 0 }, () => a.cell('f', 0), { expect: col('f', '10010111') });
  await s.step('cell', { out: 'f', row: 0 }, () => a.cell('f', 0), { expect: async (d) => { col('f', 'X0010111')(d); await shown(a)(d); } });
  // g from an expression typed in its box (in the text notation, any notation is read)
  await s.step('expr', { out: 'g', text: '/a.b + c' }, () => a.expr('g', '/a.b + c'), {
    expect: async (d) => { col('g', '01110101')(d); assert.equal(d.exprs.g, '/a.b + c'); await shown(a)(d); },
  });
  // f's map: its three groups of two (the don't care left out); a cell clicked on it: row 1 (a 0) a 1, a fourth group
  await s.step('showKmap', { out: 'f' }, async () => { await a.tab('f'); await a.showKmap(); }, {
    changes: false, expect: async () => assert.equal(await a.groups(), 3),
  });
  await s.step('kcell', { out: 'f', minterm: 1 }, () => a.kcell(1), {
    expect: async (d) => { col('f', 'X1010111')(d); assert.equal((await a.kvalues())[1], '1'); await shown(a)(d); },
  });
  await s.undoRedo();
});

uiTest('usability: truth table: the traffic lamps: a value changed and changed back, an output\'s NAND form, an input removed; Undo, Redo', E, async (page) => {
  const s = await table(page, 'lamps', { template: 'traffic', file: 'src/lamps.bool.json' });
  const { a } = s;
  const car_r = s.doc.table.car_r;   // 00001111111100XX
  // car_r at CARS (row 0): 0 → 1 → X → 0, back as it was
  await s.step('cell', { out: 'car_r', row: 0 }, () => a.cell('car_r', 0), { expect: col('car_r', `1${car_r.slice(1)}`) });
  await s.step('cell', { out: 'car_r', row: 0 }, () => a.cell('car_r', 0), { expect: col('car_r', `X${car_r.slice(1)}`) });
  await s.step('cell', { out: 'car_r', row: 0 }, () => a.cell('car_r', 0), { expect: async (d) => { col('car_r', car_r)(d); await shown(a)(d); } });
  // walk_g's cell of row 7 (WALK, blink on): 1 → X (its column clicked straight in the table, another output's tab selected)
  await s.step('cell', { out: 'walk_g', row: 7 }, () => a.cell('walk_g', 7), { expect: col('walk_g', '0000001X010000XX') });
  // car_y's HDL logic: its NAND form ticked
  await s.step('tick', { out: 'car_y', form: 'nand' }, () => a.tick('car_y', 'nand'), {
    expect: (d, b) => { assert.deepEqual(d.forms, { car_y: 'nand' }); assert.equal(d.table.car_y, b.table.car_y); },
  });
  // blink removed: the rows of blink 0 kept
  await s.step('inputs', { names: 'phase2, phase1, phase0' }, () => a.inputs('phase2, phase1, phase0'), {
    expect: async (d, b) => {
      assert.deepEqual(d.inputs, ['phase2', 'phase1', 'phase0']);
      for (const o of d.outputs) col(o, [...b.table[o]].filter((_, r) => r % 2 === 0).join(''))(d);
      await shown(a)(d);
    },
  });
  await s.undoRedo();
});

uiTest('usability: truth table: the lock\'s digit_ok (six inputs): an output added, filled from an expression, a cell clicked on its map; Undo, Redo', E, async (page) => {
  const s = await table(page, 'digit_ok', { template: 'lock', file: 'src/digit_ok.bool.json' });
  const { a } = s;
  await s.step('outputs', { names: 'ok, high' }, () => a.outputs('ok, high'), {
    expect: (d, b) => { assert.deepEqual(d.outputs, ['ok', 'high']); col('ok', b.table.ok)(d); col('high', '0'.repeat(64))(d); },
  });
  // high: a digit of 8 or more (d3)
  await s.step('expr', { out: 'high', text: 'd3' }, () => a.expr('high', 'd3'), {
    expect: col('high', '0000000011111111'.repeat(4)),
  });
  // ok's four maps (pos1 pos0 = 00 … 11), its three groups (2 at positions 0 and 2 one); the code's first digit, 2 at
  // position 0 (row 2), a don't care on the map
  await s.step('showKmap', { out: 'ok' }, async () => { await a.tab('ok'); await a.showKmap(); }, { changes: false, expect: async () => assert.equal(await a.groups(), 3) });
  await s.step('kcell', { out: 'ok', minterm: 2 }, () => a.kcell(2), {
    expect: async (d, b) => { col('ok', `00X${b.table.ok.slice(3)}`)(d); await shown(a)(d); },
  });
  await s.undoRedo();
});

uiTest('usability: truth table: an output renamed in the Outputs box keeps its column (#5165)', E, async (page) => {
  const s = await table(page, 'output renamed', { template: 'lock', file: 'src/digit_ok.bool.json' });
  await s.step('outputs', { names: 'match' }, () => s.a.outputs('match'), {
    expect: (d, b) => { assert.deepEqual(d.outputs, ['match']); col('match', b.table.ok)(d); },
  });
  await s.undoRedo();
});

uiTest('usability: truth table: an input renamed in the Inputs box keeps the table (#5165)', E, async (page) => {
  const s = await table(page, 'input renamed', { template: 'traffic', file: 'src/lamps.bool.json' });
  await s.step('inputs', { names: 'phase2, phase1, phase0, flash' }, () => s.a.inputs('phase2, phase1, phase0, flash'), {
    expect: (d, b) => { assert.deepEqual(d.inputs, ['phase2', 'phase1', 'phase0', 'flash']); assert.deepEqual(d.table, b.table); },
  });
  await s.undoRedo();
});

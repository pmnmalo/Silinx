// Usability tests (#5206, phase 3): the truth table's vocabulary of random actions (lib/draw-random.js), on the traffic
// example's lamps (examples/traffic, src/lamps.bool.json): an input or an output added, renamed or removed in the Inputs
// and Outputs boxes; an output's cell clicked in the table (0, 1, X) or on its Karnaugh map; an output's column typed as
// an expression; an output's HDL logic ticked (its NAND or NOR form); Undo, Redo. A table has nothing to move or to
// link: its "connect" is an expression over the inputs. Each step's table is computed here, apart from the editor's
// (core/logic.js): a new input is the last, the least significant bit of a row, the columns not depending on it; an input
// removed keeps the rows where it is 0; a new output is all 0s, its logic the least gates (the table's is SOP).
import { vocabulary } from './draw-random.js';

const MAX_INPUTS = 5;
const IN_NAMES = ['en', 'mode', 'sel', 'test', 'dim'];
const OUT_NAMES = ['led', 'beep', 'ok', 'warn', 'lamp'];
const NEXT = { 0: '1', 1: 'X', X: '0' };

/** A table's model: its inputs, outputs, columns, typed expressions and each output's HDL logic (but the table's). */
export function ttModel(d) {
  return { inputs: [...d.inputs], outputs: [...d.outputs], table: { ...d.table }, exprs: { ...(d.exprs || {}) }, forms: { ...(d.forms || {}) } };
}

const used = (m) => [...m.inputs, ...m.outputs].map((x) => x.toLowerCase());
const fresh = (m, rng, list) => { const n = rng.pick(list); return used(m).includes(n) ? null : n; };
const renameKey = (o, from, to) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]));
const bit = (r, n, j) => (r >> (n - 1 - j)) & 1;

/** An expression over the inputs (the editor's text notation: `/` not, `.` and, `+` or) and its value on a row. */
function expression(m, rng) {
  const [a, b, c] = [rng.pick(m.inputs), rng.pick(m.inputs), rng.pick(m.inputs)];
  return rng.pick([
    { text: `${a}.${b}`, f: (v) => v[a] & v[b] },
    { text: `${a} + ${b}`, f: (v) => v[a] | v[b] },
    { text: `/${a}`, f: (v) => 1 - v[a] },
    { text: `/${a}.${b} + ${c}`, f: (v) => ((1 - v[a]) & v[b]) | v[c] },
  ]);
}
/** An expression's column, row by row (the first input the most significant bit). */
export function column(m, text) {
  const n = m.inputs.length;
  // (the expression drawn again from its text: inputs' names, /, ., + and spaces)
  const js = text.replace(/\//g, '!').replace(/\./g, '&&').replace(/\+/g, '||').replace(/[A-Za-z_]\w*/g, (x) => `v[${JSON.stringify(x)}]`);
  const f = new Function('v', `return (${js}) ? 1 : 0`);
  let col = '';
  for (let r = 0; r < 1 << n; r++) col += f(Object.fromEntries(m.inputs.map((x, j) => [x, bit(r, n, j)])));
  return col;
}
const twoValued = (col) => col.includes('0') && col.includes('1');

const SPECS = [
  {
    name: 'addInput', weight: 1,
    gen(m, rng) { const name = m.inputs.length < MAX_INPUTS && fresh(m, rng, IN_NAMES); return name ? { name } : null; },
    apply(m, { name }) {
      for (const o of m.outputs) m.table[o] = [...m.table[o]].map((c) => c + c).join('');
      m.inputs.push(name);
      m.exprs = {};
      return m;
    },
    act: (a, { name }, s) => a.inputs([...s.doc.inputs, name].join(', ')),
  },
  {
    name: 'removeInput', weight: 1,
    gen(m, rng) { return m.inputs.length > 2 ? { name: rng.pick(m.inputs) } : null; },
    apply(m, { name }) {
      const n = m.inputs.length, j = m.inputs.indexOf(name);
      for (const o of m.outputs) m.table[o] = [...m.table[o]].filter((_, r) => !bit(r, n, j)).join('');
      m.inputs.splice(j, 1);
      m.exprs = {};
      return m;
    },
    act: (a, { name }, s) => a.inputs(s.doc.inputs.filter((x) => x !== name).join(', ')),
  },
  {
    // a name changed in place: the table kept, the expressions' words renamed
    name: 'renameInput', weight: 1,
    gen(m, rng) { const from = rng.pick(m.inputs), to = fresh(m, rng, IN_NAMES); return to ? { from, to } : null; },
    apply(m, { from, to }) {
      m.inputs = m.inputs.map((x) => (x === from ? to : x));
      const word = new RegExp(`(?<!\\w)${from}(?!\\w)`, 'gi');
      m.exprs = Object.fromEntries(Object.entries(m.exprs).map(([k, e]) => [k, e.replace(word, to)]));
      return m;
    },
    act: (a, { from, to }, s) => a.inputs(s.doc.inputs.map((x) => (x === from ? to : x)).join(', ')),
  },
  {
    name: 'addOutput', weight: 1,
    gen(m, rng) { const name = m.outputs.length < 7 && fresh(m, rng, OUT_NAMES); return name ? { name } : null; },
    apply(m, { name }) { m.outputs.push(name); m.table[name] = '0'.repeat(1 << m.inputs.length); m.forms[name] = 'gates'; return m; },
    act: (a, { name }, s) => a.outputs([...s.doc.outputs, name].join(', ')),
  },
  {
    name: 'removeOutput', weight: 1,
    gen(m, rng) { return m.outputs.length > 2 ? { name: rng.pick(m.outputs) } : null; },
    apply(m, { name }) {
      m.outputs = m.outputs.filter((x) => x !== name);
      for (const k of ['table', 'exprs', 'forms']) delete m[k][name];
      return m;
    },
    act: (a, { name }, s) => a.outputs(s.doc.outputs.filter((x) => x !== name).join(', ')),
  },
  {
    name: 'renameOutput', weight: 1,
    gen(m, rng) { const from = rng.pick(m.outputs), to = fresh(m, rng, OUT_NAMES); return to ? { from, to } : null; },
    apply(m, { from, to }) {
      m.outputs = m.outputs.map((x) => (x === from ? to : x));
      for (const k of ['table', 'exprs', 'forms']) m[k] = renameKey(m[k], from, to);
      return m;
    },
    act: (a, { from, to }, s) => a.outputs(s.doc.outputs.map((x) => (x === from ? to : x)).join(', ')),
  },
  {
    // a cell of the table (or of the output's Karnaugh map): 0 → 1 → X → 0; the column no longer its expression's
    name: 'cell', weight: 4,
    // (on the map: an output with 0s and 1s, whose results show their map)
    gen(m, rng) { const out = rng.pick(m.outputs); return { out, row: rng.int(0, (1 << m.inputs.length) - 1), kmap: rng.next() < 0.3 && twoValued(m.table[out]) }; },
    apply(m, { out, row }) {
      const c = m.table[out];
      m.table[out] = c.slice(0, row) + NEXT[c[row]] + c.slice(row + 1);
      delete m.exprs[out];
      return m;
    },
    async act(a, { out, row, kmap }) {
      if (!kmap) return a.cell(out, row);
      await a.tab(out);
      await a.showKmap();
      await a.kcell(row);
    },
  },
  {
    name: 'expr', weight: 2,
    gen(m, rng) {
      const out = rng.pick(m.outputs), { text } = expression(m, rng);
      return m.exprs[out] === text ? null : { out, text };
    },
    apply(m, { out, text }) { m.table[out] = column(m, text); m.exprs[out] = text; return m; },
    act: (a, { out, text }) => a.expr(out, text),
  },
  {
    // an output's NAND or NOR form ticked as its HDL logic (an output with 0s and 1s: a constant one has none)
    name: 'tick', weight: 1,
    gen(m, rng) {
      const out = rng.pick(m.outputs.filter((o) => twoValued(m.table[o]))), form = rng.pick(['nand', 'nor']);
      return out && m.forms[out] !== form ? { out, form } : null;
    },
    apply(m, { out, form }) { m.forms[out] = form; return m; },
    act: (a, { out, form }) => a.tick(out, form),
  },
];

export const TT_VOCAB = vocabulary(ttModel, SPECS);

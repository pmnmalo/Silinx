// A truth table's columns reordered (core/logic.js moveColumn, #5863: its editor's column headers dragged, Alt+Shift+← / →;
// the MCP's set_output_logic with its inputs or outputs reordered): an input moved sorts the rows again in the new order,
// each row's values (0, 1, X) kept with its input combination; an output moved moves its column only. Checked against an
// independent evaluation of every input combination by name, before and after, from 1 to 6 inputs with don't cares and
// several outputs; the expressions and forms kept; the module compiled, elaborated and simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTable, normalizeTable, moveColumn, shapeTable, generateTableHdl, truthTableFromModule, parseExpr, exprColumn, LogicError } from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';

// a small seeded generator (the same tables at every run)
const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/** A table of n inputs and `no` outputs, its cells 0, 1 and X at random. */
function randomTable(n, no, rand) {
  const inputs = Array.from({ length: n }, (_, i) => `i${i}`), outputs = Array.from({ length: no }, (_, i) => `o${i}`);
  const table = Object.fromEntries(outputs.map(o => [o, Array.from({ length: 2 ** n }, () => '01X'[Math.floor(rand() * 3)]).join('')]));
  return normalizeTable({ ...newTable('m', inputs, outputs), table });
}

/** The reference: output o's value for the inputs' values by name (`value`: name → 0 / 1), read from doc's own order. */
const valueOf = (doc, o, value) => doc.table[o][doc.inputs.reduce((r, v) => r * 2 + value[v], 0)];

/** Every row of `next` against `doc`: each combination of its inputs, by name, has the same value of every output. */
function sameFunction(doc, next) {
  assert.deepEqual([...next.inputs].sort(), [...doc.inputs].sort());
  assert.deepEqual([...next.outputs].sort(), [...doc.outputs].sort());
  const n = next.inputs.length;
  for (let r = 0; r < 2 ** n; r++) {
    const value = Object.fromEntries(next.inputs.map((v, j) => [v, (r >> (n - 1 - j)) & 1]));
    for (const o of next.outputs) assert.equal(next.table[o][r], valueOf(doc, o, value), `row ${r}, ${o}`);
  }
}

/** The module of a table compiled, elaborated (no error nor warning) and simulated: its outputs' columns. */
function simulated(doc, lang) {
  const g = generateTableHdl(doc, lang);
  const lib = compile([{ path: g.filename, text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, doc.name).diags].map(x => `${x.severity}: ${x.message}`), [], lang);
  const t = truthTableFromModule([{ path: g.filename, text: g.code }], doc.name);
  assert.deepEqual(t.warnings, [], lang);
  return t;
}

test('an input moved: the rows sorted again in the new order, the function unchanged (1 to 6 inputs, X, several outputs)', () => {
  const rand = rng(5863);
  for (let n = 1; n <= 6; n++) {
    const d = randomTable(n, 1 + (n % 3), rand);
    for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) {
      const r = moveColumn(d, 'inputs', from, to);
      const names = [...d.inputs]; names.splice(to, 0, ...names.splice(from, 1));
      assert.deepEqual([r.inputs, r.outputs], [names, d.outputs], `${n}: ${from} → ${to}`);
      sameFunction(d, r);
      // and back: the table it was
      assert.deepEqual(moveColumn(r, 'inputs', to, from).table, d.table);
    }
  }
});

test('the rows of a known table: a, b, c → c, a, b', () => {
  // f = a.b̅ (X when c), g: the row number's lowest bit
  const d = normalizeTable({ ...newTable('m', ['a', 'b', 'c'], ['f', 'g']), table: { f: '0X0X1X0X', g: '01010101' } });
  const r = moveColumn(d, 'inputs', 2, 0);
  assert.deepEqual(r.inputs, ['c', 'a', 'b']);
  // rows c a b: 000 001 010 011 100 101 110 111 → f: a.b̅ when c = 0, X when c = 1; g = c
  assert.deepEqual(r.table, { f: '0010XXXX', g: '00001111' });
});

test('an output moved: its column moved, the rows as they were', () => {
  const rand = rng(17);
  for (let n = 1; n <= 6; n++) {
    const d = randomTable(n, 4, rand);
    const r = moveColumn(d, 'outputs', 0, 3);
    assert.deepEqual([r.inputs, r.outputs], [d.inputs, ['o1', 'o2', 'o3', 'o0']]);
    assert.deepEqual(Object.keys(r.table), r.outputs);
    for (const o of d.outputs) assert.equal(r.table[o], d.table[o]);
    sameFunction(d, r);
  }
});

test('the expressions and forms kept; the solutions kept for an output moved, the first again for an input moved', () => {
  const d = normalizeTable({
    ...newTable('m', ['a', 'b', 'c'], ['f', 'g']), form: 'sop',
    table: { f: exprColumn(parseExpr('a./b + c'), ['a', 'b', 'c']), g: '01011110' },
    exprs: { f: 'a./b + c' }, forms: { g: 'pos' }, solutions: { g: { sop: 1 } },
  });
  const r = moveColumn(d, 'inputs', 0, 2);
  assert.deepEqual([r.inputs, r.exprs, r.forms, r.solutions], [['b', 'c', 'a'], { f: 'a./b + c' }, { g: 'pos' }, undefined]);
  assert.equal(exprColumn(parseExpr(r.exprs.f, { vars: r.inputs }), r.inputs), r.table.f);   // (the expression still the column's)
  const o = moveColumn(d, 'outputs', 1, 0);
  assert.deepEqual([o.outputs, o.exprs, o.forms, o.solutions], [['g', 'f'], { f: 'a./b + c' }, { g: 'pos' }, { g: { sop: 1 } }]);
  // the Inputs box's names reordered: the same table (shapeTable, the MCP's inputs)
  assert.deepEqual(shapeTable(d, ['b', 'c', 'a'], d.outputs), r);
});

test('its module: the ports in the new order, the same function simulated in VHDL and Verilog', () => {
  const rand = rng(99);
  const d = { ...randomTable(4, 2, rand), name: 'reorder4' };
  const r = moveColumn(moveColumn(d, 'inputs', 3, 0), 'outputs', 1, 0);
  for (const lang of ['vhdl', 'verilog']) {
    const before = simulated(d, lang), after = simulated(r, lang);
    assert.deepEqual([after.inputs, after.outputs], [r.inputs, r.outputs], lang);
    // each one's don't cares as the module drives them: compared by name, the specified cells equal the table's
    const spec = (doc, t) => Object.fromEntries(doc.outputs.map(o => [o, [...t.table[o]].map((c, i) => (doc.table[o][i] === 'X' ? 'X' : c)).join('')]));
    assert.deepEqual(spec(d, before), d.table, lang);
    assert.deepEqual(spec(r, after), r.table, lang);
    sameFunction({ ...d, table: before.table }, { ...r, inputs: after.inputs, outputs: after.outputs, table: after.table });
  }
});

test('a column or a place out of range, a kind that is not one: refused', () => {
  const d = newTable('m', ['a', 'b'], ['f']);
  assert.throws(() => moveColumn(d, 'inputs', 2, 0), new LogicError('No input column 2 (it has 2)'));
  assert.throws(() => moveColumn(d, 'outputs', 0, 1), new LogicError('No output column 1 (it has 1)'));
  assert.throws(() => moveColumn(d, 'inputs', 0, -1), new LogicError('No input column -1 (it has 2)'));
  assert.throws(() => moveColumn(d, 'rows', 0, 1), new LogicError('rows: inputs or outputs'));
  // in place: the same table
  assert.deepEqual(moveColumn(d, 'inputs', 1, 1), normalizeTable(d));
});

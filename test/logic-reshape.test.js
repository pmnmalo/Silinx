// A truth table's inputs and outputs changed (core/logic.js reshapeTable, shapeTable: its editor's Inputs and Outputs
// boxes, the MCP's set_output_logic): the columns follow their names, a new output is 0s, and one name changed in place
// is a rename (#5165): its column (an output) or its rows (an input) kept, its expression, form and solutions too.
// Against an independent reference (each row's values by name); the renamed table's HDL compiled, elaborated and
// simulated in VHDL and Verilog with no warnings; shapeTable's refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newTable, normalizeTable, reshapeTable, shapeTable, generateTableHdl, truthTableFromModule, parseExpr, exprColumn, LogicError, MAX_EDIT_INPUTS,
} from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';

/** The reference: the column of each new output, its old one (`from`: new name → old name, else the same name; none:
 *  0s) read at the row of the same values by name (`was`: new input → old input, else the same; the others at 0). */
function expected(doc, inputs, outputs, { from = {}, was = {} } = {}) {
  const n = inputs.length, n0 = doc.inputs.length;
  return Object.fromEntries(outputs.map(o => {
    const old = doc.table[from[o] ?? o];
    let col = '';
    for (let r = 0; r < 2 ** n; r++) {
      const value = {};
      inputs.forEach((v, j) => { value[(was[v] ?? v).toLowerCase()] = Math.floor(r / 2 ** (n - 1 - j)) % 2; });
      const r0 = doc.inputs.reduce((s, v, j) => s + (value[v.toLowerCase()] ?? 0) * 2 ** (n0 - 1 - j), 0);
      col += old ? old[r0] : '0';
    }
    return [o, col];
  }));
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

// three inputs, two outputs (f from its expression, g with a form and a second minimal solution of its own)
const T = () => normalizeTable({
  ...newTable('m', ['a', 'b', 'c'], ['f', 'g']), form: 'sop',
  table: { f: '01111111', g: '01011110' }, exprs: { f: 'a + b + c' }, forms: { g: 'pos' }, solutions: { g: { sop: 1 } },
});

test('an output renamed in place keeps its column, its expression, form and solutions (#5165)', () => {
  const d = T();
  const r = shapeTable(d, d.inputs, ['f', 'h']);
  assert.deepEqual(r.outputs, ['f', 'h']);
  assert.deepEqual(r.table, expected(d, d.inputs, ['f', 'h'], { from: { h: 'g' } }));
  assert.deepEqual(r.table, { f: d.table.f, h: d.table.g });
  assert.deepEqual([r.exprs, r.forms, r.solutions], [{ f: 'a + b + c' }, { h: 'pos' }, { h: { sop: 1 } }]);
  // the first one, and one renamed in its letter case and more (F → out_f)
  const r1 = shapeTable(d, d.inputs, ['out_f', 'g']);
  assert.deepEqual([r1.table, r1.exprs], [{ out_f: d.table.f, g: d.table.g }, { out_f: 'a + b + c' }]);
  // its module: the new port, the same function
  for (const lang of ['vhdl', 'verilog']) {
    const t = simulated(r, lang);
    assert.deepEqual([Object.keys(t.table), t.table], [['f', 'h'], r.table], lang);
  }
});

test('an input renamed in place keeps the rows: the table, the solutions, the expressions in the new name (#5165)', () => {
  const d = T();
  const r = shapeTable(d, ['a', 'flash', 'c'], d.outputs);
  assert.deepEqual(r.inputs, ['a', 'flash', 'c']);
  assert.deepEqual(r.table, d.table);
  assert.deepEqual(r.table, expected(d, r.inputs, d.outputs, { was: { flash: 'b' } }));
  assert.deepEqual([r.exprs, r.forms, r.solutions], [{ f: 'a + flash + c' }, { g: 'pos' }, { g: { sop: 1 } }]);
  assert.equal(exprColumn(parseExpr(r.exprs.f, { vars: r.inputs }), r.inputs), r.table.f);
  // a name inside another or in another letter case: only the name itself (a.ab + A → x.ab + x)
  const w = shapeTable({ ...newTable('w', ['a', 'ab'], ['y']), table: { y: '0011' }, exprs: { y: 'a.ab + A' } }, ['x', 'ab'], ['y']);
  assert.deepEqual([w.table, w.exprs], [{ y: '0011' }, { y: 'x.ab + x' }]);
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(simulated(r, lang).table, r.table, lang);
});

test('an input and an output renamed at once: both kept (#5165)', () => {
  const d = T();
  const r = shapeTable(d, ['p', 'b', 'c'], ['f', 'h']);
  assert.deepEqual(r.table, { f: d.table.f, h: d.table.g });
  assert.deepEqual(r.exprs, { f: 'p + b + c' });
  // an input renamed to an output's old name while that output is renamed too (c → f, f → c)
  const s = shapeTable(d, ['a', 'b', 'f'], ['c', 'g']);
  assert.deepEqual([s.inputs, s.outputs, s.table, s.exprs], [['a', 'b', 'f'], ['c', 'g'], { c: d.table.f, g: d.table.g }, { c: 'a + b + f' }]);
});

test('not a rename: two names changed, a rename with a reorder, names added or removed: the columns follow their names (#196, #5165)', () => {
  const d = T();
  const cases = [
    // two inputs changed: both new (at 0), the rows of a kept
    [['a', 'x', 'y'], d.outputs],
    // two outputs changed: both new outputs of 0s
    [d.inputs, ['h', 'k']],
    // reordered (two places differ): the rows follow the names
    [['b', 'a', 'c'], d.outputs],
    [d.inputs, ['g', 'f']],
    // a name changed and the others reordered: c a x (b dropped, x new)
    [['c', 'a', 'x'], d.outputs],
    // a name changed and one added or one removed
    [['a', 'b', 'x', 'd'], ['f', 'h', 'k']],
    [['a', 'x'], ['h']],
  ];
  for (const [ins, outs] of cases) {
    const r = shapeTable(d, ins, outs);
    assert.deepEqual(r.table, expected(d, ins, outs), `${ins} / ${outs}`);
  }
  // the outputs dropped and new: no expression nor solutions of the old ones; a new output's form: least gates
  const r = shapeTable(d, d.inputs, ['h', 'k']);
  assert.deepEqual([r.table, r.exprs, r.forms, r.solutions], [{ h: '00000000', k: '00000000' }, {}, { h: 'gates', k: 'gates' }, undefined]);
  // a letter case changed only: the same names (no rename needed), its column kept
  assert.deepEqual(shapeTable(d, ['A', 'b', 'c'], ['F', 'g']).table, { F: d.table.f, g: d.table.g });
});

test('a name changed onto another one is refused, nothing renamed (#5165)', () => {
  const d = T();
  const refused = (ins, outs, message) => assert.throws(() => shapeTable(d, ins, outs), e => e instanceof LogicError && e.message === message);
  refused(['a', 'a', 'c'], d.outputs, "the name 'a' is used twice");
  refused(d.inputs, ['f', 'f'], "the name 'f' is used twice");
  refused(['a', 'b', 'f'], d.outputs, "the name 'f' is used twice");
  refused(d.inputs, ['f', 'a'], "the name 'a' is used twice");
  // reshapeTable alone: a name onto one of the list is no rename (its column follows its name)
  assert.deepEqual(reshapeTable(d, d.inputs, ['f', 'f']).table, { f: d.table.f });
});

test('shapeTable: its refusals, as the editor\'s Inputs and Outputs boxes say them', () => {
  const d = T();
  const refused = (ins, outs, message) => assert.throws(() => shapeTable(d, ins, outs), e => e instanceof LogicError && e.message === message);
  refused([], d.outputs, `1 to ${MAX_EDIT_INPUTS} inputs`);
  refused(Array.from({ length: MAX_EDIT_INPUTS + 1 }, (_, k) => `i${k}`), d.outputs, `1 to ${MAX_EDIT_INPUTS} inputs`);
  refused(d.inputs, [], 'At least 1 output');
  refused(['a', 'b', 'signal'], d.outputs, "'signal' is a reserved word of VHDL: choose another name.");
  refused(d.inputs, ['f', 'h_'], "'h_' is not a valid name (a letter, then letters, digits and single _; not a VHDL/Verilog keyword)");
  // the same shape: the same table
  assert.deepEqual(shapeTable(d, d.inputs, d.outputs), d);
});

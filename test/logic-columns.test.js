// A truth table's columns edited one at a time (core/logic-columns.js, #5869: its editor's column header's right-click
// menu; the MCP's set_output_logic): renamed, an output duplicated, a column inserted, deleted. Against an independent
// evaluation of every input combination by name (1 to 5 inputs, don't cares, several outputs); the expressions, forms and
// solutions kept or copied; the fresh names; the refusals; the module compiled, elaborated and simulated in VHDL and
// Verilog with no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTable, normalizeTable, generateTableHdl, truthTableFromModule, parseExpr, exprColumn, LogicError } from '../core/logic.js';
import { renameColumn, deleteColumn, insertColumn, duplicateOutput, freshName } from '../core/logic-columns.js';
import { compile, elaborate } from '../core/compile.js';

const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function randomTable(n, no, rand) {
  const inputs = Array.from({ length: n }, (_, i) => `i${i}`), outputs = Array.from({ length: no }, (_, i) => `o${i}`);
  const table = Object.fromEntries(outputs.map(o => [o, Array.from({ length: 2 ** n }, () => '01X'[Math.floor(rand() * 3)]).join('')]));
  return normalizeTable({ ...newTable('m', inputs, outputs), table });
}

/** The reference: output o of `doc` for the inputs' values by name (an input it does not have ignored, one `next` lacks
 *  at 0). */
const valueOf = (doc, o, value) => doc.table[o][doc.inputs.reduce((r, v) => r * 2 + (value[v] ?? 0), 0)];
/** Every row of `next`: each output it shares with `doc` (`from`: its name in doc) as doc's at the same values by name. */
function follows(doc, next, from = {}) {
  const n = next.inputs.length;
  for (let r = 0; r < 2 ** n; r++) {
    const value = Object.fromEntries(next.inputs.map((v, j) => [v, (r >> (n - 1 - j)) & 1]));
    for (const o of next.outputs) {
      const was = from[o] ?? o;
      assert.equal(next.table[o][r], doc.outputs.includes(was) ? valueOf(doc, was, value) : '0', `row ${r}, ${o}`);
    }
  }
}

function simulated(doc, lang) {
  const g = generateTableHdl(doc, lang);
  const lib = compile([{ path: g.filename, text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, doc.name).diags].map(x => `${x.severity}: ${x.message}`), [], lang);
  const t = truthTableFromModule([{ path: g.filename, text: g.code }], doc.name);
  assert.deepEqual(t.warnings, [], lang);
  return t;
}

test('an input inserted at every place: each output independent of it, the rows of the others kept (1 to 5 inputs)', () => {
  const rand = rng(5869);
  for (let n = 1; n <= 5; n++) {
    const d = randomTable(n, 2, rand);
    for (let at = 0; at <= n; at++) {
      const r = insertColumn(d, 'inputs', at);
      assert.equal(r.inputs[at], 'a');
      assert.deepEqual(r.inputs.filter((_, j) => j !== at), d.inputs);
      follows(d, r);
    }
  }
});

test('an input deleted: the rows where it is 0 kept; an output deleted: the others as they were', () => {
  const rand = rng(7);
  for (let n = 2; n <= 5; n++) {
    const d = randomTable(n, 3, rand);
    for (let i = 0; i < n; i++) {
      const r = deleteColumn(d, 'inputs', i);
      assert.deepEqual(r.inputs, d.inputs.filter((_, j) => j !== i));
      follows(d, r);   // (the deleted input at 0)
    }
    const o = deleteColumn(d, 'outputs', 1);
    assert.deepEqual([o.outputs, o.table], [['o0', 'o2'], { o0: d.table.o0, o2: d.table.o2 }]);
  }
  // a known one: f = a ⊕ b, b deleted: the rows of b = 0, f = a
  assert.deepEqual(deleteColumn({ ...newTable('m', ['a', 'b'], ['f']), table: { f: '0110' } }, 'inputs', 1).table, { f: '01' });
});

test('renamed: an input keeps its rows and its name in the expressions, an output its column, expression and form', () => {
  const d = normalizeTable({
    ...newTable('m', ['a', 'b', 'c'], ['f', 'g']), form: 'sop',
    table: { f: exprColumn(parseExpr('a./b + c'), ['a', 'b', 'c']), g: '01011110' }, exprs: { f: 'a./b + c' }, forms: { g: 'pos' }, solutions: { g: { sop: 1 } },
  });
  const i = renameColumn(d, 'inputs', 1, 'go');
  assert.deepEqual([i.inputs, i.table, i.exprs, i.forms, i.solutions], [['a', 'go', 'c'], d.table, { f: 'a./go + c' }, { g: 'pos' }, { g: { sop: 1 } }]);
  assert.equal(exprColumn(parseExpr(i.exprs.f, { vars: i.inputs }), i.inputs), i.table.f);
  const o = renameColumn(d, 'outputs', 1, 'y');
  assert.deepEqual([o.outputs, o.table, o.forms, o.solutions], [['f', 'y'], { f: d.table.f, y: d.table.g }, { y: 'pos' }, { y: { sop: 1 } }]);
  // its own letter case changed; the same name: the same table
  assert.deepEqual(renameColumn(d, 'outputs', 0, 'F').outputs, ['F', 'g']);
  assert.deepEqual(renameColumn(d, 'inputs', 0, ' a '), d);
});

test('an output duplicated: its column, expression, form and solutions after it, named f2 (f3 when f2 is taken)', () => {
  const d = normalizeTable({
    ...newTable('m', ['a', 'b'], ['f', 'f2', 'g']), form: 'sop',
    table: { f: '0111', f2: '0001', g: '0110' }, exprs: { f: 'a + b' }, forms: { f: 'pos' }, solutions: { f: { pos: 1 } },
  });
  const r = duplicateOutput(d, 0);
  assert.deepEqual(r.outputs, ['f', 'f3', 'f2', 'g']);
  assert.deepEqual([r.table.f3, r.exprs.f3, r.forms.f3, r.solutions.f3], ['0111', 'a + b', 'pos', { pos: 1 }]);
  follows(d, r, { f3: 'f' });
  // one of the table's form: its copy's the table's too (no form of its own)
  const g = duplicateOutput(d, 2);
  assert.deepEqual([g.outputs, g.table.g2, g.forms?.g2, g.exprs.g2], [['f', 'f2', 'g', 'g2'], '0110', undefined, undefined]);
  assert.deepEqual(duplicateOutput(d, 2, 'xor_g').outputs, ['f', 'f2', 'g', 'xor_g']);
});

test('the fresh names: the first letter free (inputs from a, outputs from f), then x1…; a new output is 0s', () => {
  const d = newTable('m', ['a', 'b'], ['f']);
  assert.deepEqual([freshName(d), freshName(d, { from: 'f' }), freshName(d, { base: 'f' })], ['c', 'g', 'f2']);
  const r = insertColumn(d, 'outputs', 0);
  assert.deepEqual([r.outputs, r.table], [['g', 'f'], { g: '0000', f: '0000' }]);
  // the module's name is taken too
  assert.equal(freshName(newTable('c', ['a', 'b'], ['f'])), 'd');
  const all = newTable('m', 'abcdefghijklmnopqrstuvwxyz'.split('').slice(0, 13), ['n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']);
  assert.equal(freshName(all), 'x1');
});

test('refused: a name taken or reserved, the last input or output deleted, a column or place out of range', () => {
  const d = newTable('m', ['a', 'b'], ['f']);
  assert.throws(() => renameColumn(d, 'inputs', 0, 'B'), new LogicError("The name 'B' is used already"));
  assert.throws(() => renameColumn(d, 'outputs', 0, 'm'), new LogicError("The name 'm' is used already"));
  assert.throws(() => renameColumn(d, 'outputs', 0, 'signal'), /signal/);
  assert.throws(() => renameColumn(d, 'outputs', 0, '2x'), /'2x' is not a valid name/);
  assert.throws(() => insertColumn(d, 'inputs', 0, 'f'), new LogicError("The name 'f' is used already"));
  assert.throws(() => deleteColumn(d, 'outputs', 0), new LogicError('At least 1 output'));
  assert.throws(() => deleteColumn(newTable('m', ['a'], ['f']), 'inputs', 0), new LogicError('1 to 16 inputs'));
  assert.throws(() => deleteColumn(d, 'inputs', 2), new LogicError('No input column 2 (it has 2)'));
  assert.throws(() => insertColumn(d, 'outputs', 2), new LogicError('No place 2 among the outputs (0 to 1)'));
  assert.throws(() => duplicateOutput(d, 1), new LogicError('No output column 1 (it has 1)'));
  assert.throws(() => renameColumn(d, 'rows', 0, 'x'), new LogicError('rows: inputs or outputs'));
  assert.throws(() => insertColumn(newTable('m', Array.from({ length: 16 }, (_, i) => `i${i}`), ['f']), 'inputs', 0), new LogicError('1 to 16 inputs'));
});

test('its module after a column inserted, an output duplicated and one renamed: simulated in VHDL and Verilog as the table', () => {
  const d = { ...randomTable(3, 2, rng(42)), name: 'cols3' };
  const r = renameColumn(duplicateOutput(insertColumn(d, 'inputs', 1), 0), 'outputs', 2, 'z');
  assert.deepEqual([r.inputs, r.outputs], [['i0', 'a', 'i1', 'i2'], ['o0', 'o02', 'z']]);
  for (const lang of ['vhdl', 'verilog']) {
    const t = simulated(r, lang);
    assert.deepEqual([t.inputs, t.outputs], [r.inputs, r.outputs], lang);
    // the specified cells as the table's (a don't care: whatever the module drives)
    for (const o of r.outputs) assert.equal([...t.table[o]].map((c, k) => (r.table[o][k] === 'X' ? 'X' : c)).join(''), r.table[o], `${lang} ${o}`);
  }
});

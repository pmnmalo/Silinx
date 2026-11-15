// Unit tests (#1427): a form of a table's output as a circuit (core/logic-cost.js circuitCost: its gates as the schematic
// draws them, #4091: an inverted input of an AND, OR, NAND or NOR no gate, AND2B1…; its delay, the gates on its longest path), and the
// forms of the fewest gates and of the least delay (core/logic.js outputForm 'gates', 'delay'): checked against every
// other form, on random tables, their expressions equal to the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitCost, formCost, outputForm, normalizeTable, newTable, exprColumn, parseExpr, generateTableHdl } from '../core/logic.js';
import { circuitGates, gatesText } from '../core/logic-sch.js';

const cost = (src, inputs = ['a', 'b', 'c', 'd']) => circuitCost(parseExpr(src, { inputs }));

test('circuitCost (#4091): the schematic\'s gates, an inverted input of an AND, OR, NAND or NOR no gate, NOT of a gate its complement gate', () => {
  assert.deepEqual(circuitCost({ t: 'var', name: 'a' }), { gates: 0, delay: 0 });
  assert.deepEqual(circuitCost({ t: 'const', v: 1 }), { gates: 0, delay: 0 });
  assert.deepEqual(cost('/a'), { gates: 1, delay: 1 }, 'the output complemented: an inverter');
  assert.deepEqual(cost('a & b & c & d'), { gates: 1, delay: 1 }, 'one AND of 4 inputs: one gate');
  assert.deepEqual(cost('a & /b | c'), { gates: 2, delay: 2 }, 'an AND2B1, the OR');
  assert.deepEqual(cost('/a & b | /a & c | /a & d'), { gates: 4, delay: 2 }, 'three AND2B1, the OR');
  assert.deepEqual(cost('a ^ b ^ c'), { gates: 1, delay: 1 });
  assert.deepEqual(cost('/(a ^ b)'), { gates: 1, delay: 1 }, 'an XNOR');
  assert.deepEqual(cost('/(a & b) | c'), { gates: 2, delay: 2 }, 'a NAND, the OR');
  assert.deepEqual(cost('/a ^ b'), { gates: 2, delay: 2 }, 'an XOR\'s complemented input: an inverter');
  assert.deepEqual(cost('a & b & c & d & e & f', ['a', 'b', 'c', 'd', 'e', 'f']), { gates: 2, delay: 2 }, 'six inputs: an AND5 and an AND2');
  assert.deepEqual(circuitCost({ t: 'nand', args: [{ t: 'nand', args: [{ t: 'var', name: 'a' }] }, { t: 'var', name: 'b' }] }), { gates: 2, delay: 2 }, 'a NAND of one input an inverter');
});

test('circuitGates and formCost (#4091): the gates by type, as the library names them, the terms and literals', () => {
  const types = (src, inputs = ['a', 'b', 'c', 'd']) => gatesText(circuitGates(parseExpr(src, { inputs })));
  assert.equal(types('a & /b | c'), '1 AND2B1, 1 OR2');
  assert.equal(types('/a & b | /a & c | /a & d'), '3 AND2B1, 1 OR3');
  assert.equal(types('/a & /b & /c | d & /a'), '1 AND2B1, 1 AND3B3, 1 OR2', 'the inverted inputs counted per gate');
  assert.equal(types('(a | /b) & (/a | /c | d)'), '1 AND2, 1 OR2B1, 1 OR3B2');
  assert.equal(types('/(a & /b) | /(c | d)'), '1 OR2, 1 NAND2B1, 1 NOR2');
  assert.equal(types('/a ^ b ^ /(c ^ d)'), '1 XOR3, 1 XNOR2, 1 INV', 'an XOR of three: its complemented input an inverter');
  assert.equal(types('a & b & c & d & e & f & g', ['a', 'b', 'c', 'd', 'e', 'f', 'g']), '2 AND2, 1 AND5', 'seven inputs: AND5(a…e), AND2(f, g), the AND2 of both');
  assert.equal(types('/a'), '1 INV');
  assert.equal(types('a'), 'none');
  const nand = { t: 'nand', args: [{ t: 'nand', args: [{ t: 'var', name: 'a' }, { t: 'nand', args: [{ t: 'var', name: 'b' }] }] }, { t: 'nand', args: [{ t: 'var', name: 'a' }] }] };
  assert.equal(gatesText(circuitGates(nand)), '4 NAND2', 'NAND gates only: two NANDs, the inverters of a and b NAND2s with their inputs tied');
  assert.deepEqual(circuitGates(parseExpr('a & /b | c', { inputs: ['a', 'b', 'c'] })), { types: [['AND2B1', 1], ['OR2', 1]], gates: 2, inputs: 4, delay: 2 });
  const fc = (src, form) => formCost(parseExpr(src, { inputs: ['a', 'b', 'c', 'd'] }), form);
  assert.equal(fc('/a & b | a & /c | d', 'sop').text, '3 term(s), 5 literal(s); gates: 2 AND2B1, 1 OR3');
  assert.equal(fc('(a | /b) & (/a | c)', 'pos').text, '2 term(s), 4 literal(s); gates: 1 AND2, 2 OR2B1');
  assert.equal(fc('a & /b', 'sop').text, '1 term(s), 2 literal(s); gates: 1 AND2B1', 'one product: one term');
  assert.equal(fc('a ^ c | b ^ d', 'xor').text, '2 term(s), 4 literal(s); gates: 1 OR2, 2 XOR2');
  assert.equal(formCost({ t: 'const', v: 0 }, 'sop').text, '0 term(s), 0 literal(s); gates: none');
});

const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randCol = (r, n, dc = 0.15) => Array.from({ length: 1 << n }, () => { const x = r(); return x < dc ? 'X' : x < 0.5 + dc / 2 ? '1' : '0'; }).join('');
const careEqual = (want, got) => [...want].every((c, i) => c === 'X' || c === got[i]);

test('least gates and least delay: the cheapest of the forms by their goal, their expression the table\'s', () => {
  const r = rng(1427);
  for (let k = 0; k < 40; k++) {
    const n = 2 + (k % 5);
    const doc = normalizeTable({ ...newTable(`t${k}`, ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), ['y']), table: { y: randCol(r, n) } });
    const all = ['sop', 'pos', 'xor', 'nand', 'nor'].map((f) => outputForm(doc, 'y', f));
    for (const goal of ['gates', 'delay']) {
      const b = outputForm(doc, 'y', goal);
      assert.deepEqual(b.cost, circuitCost(b.ast));
      assert.ok(careEqual(doc.table.y, exprColumn(b.ast, doc.inputs)), `${goal} ${doc.table.y}`);
      for (const o of all) {
        const [x, y] = goal === 'gates' ? [b.cost.gates, o.cost.gates] : [b.cost.delay, o.cost.delay];
        assert.ok(x <= y, `${goal}: ${JSON.stringify(b.cost)} (${b.form}) vs ${JSON.stringify(o.cost)} (${o.form})`);
        if (x === y) assert.ok((goal === 'gates' ? b.cost.delay <= o.cost.delay : b.cost.gates <= o.cost.gates), `${goal}: the tie broken by the other`);
      }
      assert.match(b.what, new RegExp(`^least ${goal}: .*, ${b.cost.gates} gate\\(s\\), delay ${b.cost.delay}$`));
    }
  }
});

test('least gates and least delay: a parity is its XOR, a majority its minimal SOP; the HDL says which, its gates and delay', () => {
  const doc = normalizeTable({ ...newTable('t', ['a', 'b', 'c'], ['p', 'm']), table: { p: '01101001', m: '00010111' } });
  for (const goal of ['gates', 'delay']) {
    assert.deepEqual([outputForm(doc, 'p', goal).form, outputForm(doc, 'p', goal).cost], ['xor', { gates: 1, delay: 1 }]);
    assert.deepEqual([outputForm(doc, 'm', goal).form, outputForm(doc, 'm', goal).cost], ['sop', { gates: 4, delay: 2 }]);
    const hdl = generateTableHdl({ ...doc, form: goal }, 'vhdl').code;
    assert.match(hdl, new RegExp(`-- p = .*\\(least ${goal}: XOR form, 3 literal\\(s\\), 1 gate\\(s\\), delay 1\\)`));
    assert.match(hdl, new RegExp(`-- m = .*\\(least ${goal}: minimal SOP, 6 literal\\(s\\), 4 gate\\(s\\), delay 2\\)`));
  }
});

test('circuitGates (#4091): the gates its table\'s schematic draws, every form of random tables of 2 to 6 inputs', async () => {
  const { schematicFromTable } = await import('../core/logic-sch.js');
  const r = rng(4091);
  const GATE = /^(and|or|nand|nor|xor|xnor)\d+(b\d+)?$|^inv$/;
  let checked = 0;
  for (let k = 0; k < 60; k++) {
    const n = 2 + (k % 5), inputs = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
    const doc = normalizeTable({ ...newTable('t', inputs, ['y']), table: { y: randCol(r, n) } });
    for (const form of ['sop', 'pos', 'xor', 'nand', 'nor', 'csop', 'cpos', 'qsop', 'qpos']) {
      const { ast } = outputForm(doc, 'y', form);
      const drawn = new Map();
      for (const s of schematicFromTable(doc, { form }).symbols) if (GATE.test(s.type)) drawn.set(s.type.toUpperCase(), (drawn.get(s.type.toUpperCase()) || 0) + 1);
      const want = [...drawn].sort().map(([t, c]) => `${c} ${t}`).join(', ');
      const got = circuitGates(ast).types.slice().sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([t, c]) => `${c} ${t}`).join(', ');
      assert.equal(got, want, `${form} of ${doc.table.y}`);
      checked++;
    }
  }
  assert.equal(checked, 540);
});

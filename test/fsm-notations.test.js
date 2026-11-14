// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The notations of a condition's logic operators (#3907): C-style (&&, ||, !), bitwise (&, |, ~), words (AND, OR,
// NOT), Boolean algebra (a.b, a·b, a + b, a', /a); the otherwise transition (else, default, true, 1); a transition
// label with a '/' NOT; the errors' columns; the HDL generated from each notation the same, simulated in VHDL and
// Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCondition, exprToString } from '../core/asm-expr.js';
import {
  normalizeFsm, validateFsm, parseLabel, parseCond, evalCond, isOtherwise, transitionsFrom, generateFsm, simulateFsm,
} from '../core/fsm.js';
import { validate as validateAsm, generate as generateAsm } from '../core/asm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const tree = (s) => { const r = parseCondition(s); assert.equal(r.error, undefined, `${s}: ${r.error}`); return exprToString(r.ast); };

// every combination of a, b, c (1 bit each)
const combos = [];
for (let k = 0; k < 8; k++) combos.push({ a: (k >> 2) & 1, b: (k >> 1) & 1, c: k & 1 });
const truth = (text) => combos.map((v) => evalCond(parseCond(text).ast, { a: BigInt(v.a), b: BigInt(v.b), c: BigInt(v.c) }, () => 1) ? 1 : 0);
// (the reference: the operators written in JavaScript, not parsed)
const ref = (f) => combos.map((v) => (f(!!v.a, !!v.b, !!v.c) ? 1 : 0));

test('#3907 every notation of AND, OR and NOT: the same tree as the C-style form, the truth table of its reference', () => {
  const cases = [
    // AND
    ['a && b', 'a && b', (a, b) => a && b],
    ['a & b', 'a & b', (a, b) => a && b],
    ['a AND b', 'a && b', (a, b) => a && b],
    ['a and b', 'a && b', (a, b) => a && b],
    ['a·b', 'a && b', (a, b) => a && b],
    ['a ⋅ b', 'a && b', (a, b) => a && b],
    ['a.b', 'a && b', (a, b) => a && b],
    ['a . b', 'a && b', (a, b) => a && b],
    ['a ∧ b', 'a && b', (a, b) => a && b],
    // OR
    ['a || b', 'a || b', (a, b) => a || b],
    ['a | b', 'a | b', (a, b) => a || b],
    ['a OR b', 'a || b', (a, b) => a || b],
    ['a + b', 'a || b', (a, b) => a || b],
    ['a ∨ b', 'a || b', (a, b) => a || b],
    // NOT
    ['!a', '!a', (a) => !a],
    ['~a', '~a', (a) => !a],
    ['NOT a', '!a', (a) => !a],
    ["a'", '!a', (a) => !a],
    ['/a', '!a', (a) => !a],
    ['¬a', '!a', (a) => !a],
    ['¬(a ∧ b) ∨ c', '!(a && b) || c', (a, b, c) => !(a && b) || c],
    ['a ∨ b ∧ ¬c', 'a || (b && !c)', (a, b, c) => a || (b && !c)],
    ["a''", '!!a', (a) => a],
    ['//a', '!!a', (a) => a],
    // together
    ["a.b' + /c", '(a && !b) || !c', (a, b, c) => (a && !b) || !c],
    ["(a + b)'", '!(a || b)', (a, b) => !(a || b)],
    ["/(a·b) + c", '!(a && b) || c', (a, b, c) => !(a && b) || c],
    ["a.(b + c)'", 'a && !(b || c)', (a, b, c) => a && !(b || c)],
    ["NOT a AND b OR c'", '(!a && b) || !c', (a, b, c) => (!a && b) || !c],
    ["a' . b' . c'", '(!a && !b) && !c', (a, b, c) => !a && !b && !c],
    ['a xor b', 'a ^ b', (a, b) => a !== b],
  ];
  for (const [text, want, f] of cases) {
    assert.equal(tree(text), want, text);
    assert.deepEqual(truth(text), ref(f), text);
  }
});

test('#3907 precedence: NOT, then AND, then OR; comparisons bind tighter than AND; parentheses', () => {
  assert.equal(tree('a + b.c'), 'a || (b && c)');
  assert.equal(tree('a.b + c'), '(a && b) || c');
  assert.equal(tree("a + b.c'"), 'a || (b && !c)');
  assert.equal(tree('/a.b'), '!a && b');
  assert.equal(tree('/(a.b)'), '!(a && b)');
  assert.equal(tree('(a + b).c'), '(a || b) && c');
  assert.equal(tree('a OR b AND NOT c'), 'a || (b && !c)');
  assert.equal(tree('a || b && !c'), 'a || (b && !c)');
  assert.equal(tree('x == 2 . y != 0'), '(x == 2) && (y != 0)');
  assert.equal(tree('count >= max + a'), 'count >= (max + a)');
  assert.deepEqual(truth('a + b.c'), ref((a, b, c) => a || (b && c)));
  assert.deepEqual(truth('(a + b).c'), ref((a, b, c) => (a || b) && c));
});

test("#3907 '+' is OR, but adds in a comparison's operand; no clash with literals, '/=' or names", () => {
  assert.equal(tree('count + 1 >= max'), '(count + 1) >= max');
  assert.equal(tree('(a + b) == c'), '(a + b) == c');
  assert.equal(tree('a + b == c'), '(a + b) == c');
  assert.equal(tree('a + (b == c)'), 'a || (b == c)');
  assert.equal(tree('a.(x + 1 == y) + b'), '(a && ((x + 1) == y)) || b');
  assert.equal(tree('((x + 1)) < 3 + c'), '(x + 1) < (3 + c)');
  // the apostrophe: bit and based literals stay literals
  assert.equal(tree("a = '1'"), "a == 1'b1");
  assert.equal(tree("v == 4'b1010"), "v == 4'b1010");
  assert.equal(tree("v == 'hA . a'"), "(v == 4'hA) && !a");
  assert.equal(tree("'0' + a'"), "1'b0 || !a");
  // the slash: VHDL's not-equal stays
  assert.equal(tree('a /= b'), 'a != b');
  assert.equal(tree('a /= b . /c'), '(a != b) && !c');
  // names with digits and underscores
  assert.equal(tree('x1.y_2 + z3'), '(x1 && y_2) || z3');
  assert.equal(tree('v[2].v[0]\''), 'v[2] && !v[0]');
  assert.equal(tree('v(3 downto 1) == 2 . w[1]'), '(v[3:1] == 2) && w[1]');
});

test('#3907 the errors: what is wrong and its column', () => {
  const err = (s) => { const r = parseCondition(s); return [r.error, r.column]; };
  assert.deepEqual(err('1.5'), ["a condition has no real numbers ('.' is AND: a.b)", 2]);
  assert.deepEqual(err('x == 2.5'), ["a condition has no real numbers ('.' is AND: a.b)", 7]);
  assert.deepEqual(err('a / b'), ["unexpected '/' (a condition has no division: '/' before an operand is NOT, /a)", 3]);
  assert.deepEqual(err('a b'), ["unexpected 'b' (an operator missing before it: a && b, a.b)", 3]);
  assert.deepEqual(err('ab cd'), ["unexpected 'cd' (an operator missing before it: a && b, a.b)", 4]);
  assert.deepEqual(err("a'b"), ["unexpected 'b' (an operator missing before it: a && b, a.b)", 3]);
  assert.deepEqual(err('(a) (b)'), ["unexpected '(' (an operator missing before it: a && b, a.b)", 5]);
  assert.deepEqual(err("'a"), ["unexpected ' (NOT after an operand: a')", 1]);
  assert.deepEqual(err('a +'), ['unexpected end of expression', 4]);
  assert.deepEqual(err('a.'), ['unexpected end of expression', 3]);
  assert.deepEqual(err('.a'), ["unexpected '.'", 1]);
  assert.deepEqual(err('(a + b'), ["expected ')' at end", 7]);
  assert.deepEqual(err('a + b)'), ["unexpected ')'", 6]);
  assert.deepEqual(err('a $ b'), ["unexpected character '$'", 3]);
  assert.deepEqual(err(''), ['empty condition', undefined]);
  // Check names the column
  const m = normalizeFsm({ inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], states: [{ id: 's', name: 'S' }],
    transitions: [{ id: 't', from: 's', to: 's', cond: '  a.b c' }] });
  assert.deepEqual(validateFsm(m).map((d) => `${d.severity}: ${d.message}`),
    ["error: Transition S → S: the condition 'a.b c' is not valid (column 5: unexpected 'c' (an operator missing before it: a && b, a.b))",
      'warning: State S has no exit: once there, the machine stays in it until a reset']);
});

test('#3907 actions keep their arithmetic: + adds, . / and \' are not operators there', async () => {
  const { parseAction } = await import('../core/asm-expr.js');
  assert.equal(exprToString(parseAction('y = a + b').ast), 'a + b');
  assert.ok(parseAction('y = a.b').error);
  assert.ok(parseAction('y = /a').error);
  assert.ok(parseAction("y = a'").error);
});

test('#3907 the otherwise transition: else, default, true, 1, always or none; taken last; one per state', () => {
  for (const w of ['', '1', 'true', 'TRUE', 'always', 'else', 'Else', 'default', ' default ']) {
    assert.ok(isOtherwise(w), w);
    assert.deepEqual(parseCond(w), { ast: null }, w);
  }
  for (const w of ['0', 'false', 'a', 'elsewhere', 'else a']) assert.ok(!isOtherwise(w), w);
  const mk = (first, other = '') => normalizeFsm({
    inputs: [{ name: 'a', width: 1 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 's', name: 'S' }, { id: 'u', name: 'U', outputs: { z: '1' } }, { id: 'v', name: 'V' }],
    transitions: [{ id: 't1', from: 's', to: 'v', cond: first }, { id: 't2', from: 's', to: 'u', cond: 'a' },
      { id: 't3', from: 'u', to: 's', cond: other }, { id: 't4', from: 'v', to: 's', cond: '1' }],
    initial: 's',
  });
  const base = mk('');
  for (const w of ['else', 'default', 'true', '1']) {
    const m = mk(w);
    assert.equal(m.transitions[0].cond, w);   // kept as typed
    assert.deepEqual(transitionsFrom(m, 's').map((t) => t.id), ['t2', 't1']);
    assert.deepEqual(validateFsm(m), [], w);   // no message: the otherwise listed first is still taken last
    // the same HDL as with no condition but its comments, which show the drawing's text
    for (const lang of ['vhdl', 'verilog']) assert.equal(code(generateFsm(m, lang).code), code(generateFsm(base, lang).code), `${w} ${lang}`);
    const runs = simulateFsm(m, [{ a: 1n }, { a: 0n }, { a: 0n }, { a: 0n }]).map((r) => r.state);
    assert.deepEqual(runs, simulateFsm(base, [{ a: 1n }, { a: 0n }, { a: 0n }, { a: 0n }]).map((r) => r.state));
  }
  // two in one state: an error
  const two = mk('else');
  two.transitions.push({ id: 't5', from: 's', to: 's', cond: 'default', outputs: {} });
  assert.deepEqual(validateFsm(two).filter((d) => d.severity === 'error').map((d) => d.message),
    ['State S has 2 otherwise transitions (else, default, true, 1 or no condition), to V, S; a state has one at most']);
});

test('#3907 a transition label: the condition\'s / NOT and the outputs\' / separator', () => {
  const outs = [{ name: 'z' }, { name: 'y' }];
  assert.deepEqual(parseLabel('/a', outs), { cond: '/a', outputs: {}, error: undefined });
  assert.deepEqual(parseLabel('a./b', outs), { cond: 'a./b', outputs: {}, error: undefined });
  assert.deepEqual(parseLabel('/a / z=1', outs), { cond: '/a', outputs: { z: '1' }, error: undefined });
  assert.deepEqual(parseLabel('a./b / z=1, y=0', outs), { cond: 'a./b', outputs: { z: '1', y: '0' }, error: undefined });
  assert.deepEqual(parseLabel("a' / z", outs), { cond: "a'", outputs: { z: '1' }, error: undefined });
  assert.deepEqual(parseLabel('/a /', outs), { cond: '/a', outputs: {}, error: undefined });
  assert.deepEqual(parseLabel('else / z=1', outs), { cond: 'else', outputs: { z: '1' }, error: undefined });
  assert.deepEqual(parseLabel('/ z=1', outs), { cond: '', outputs: { z: '1' }, error: undefined });
  assert.deepEqual(parseLabel('a /= b / z', outs), { cond: 'a /= b', outputs: { z: '1' }, error: undefined });
  // a wrong output: the error, as before
  assert.deepEqual(parseLabel('a / q=1', outs), { cond: 'a', outputs: {}, error: "'q' is not an output" });
});

// the generated code without its comments (they quote the drawing's conditions)
const code = (s) => s.split('\n').filter((l) => !/^\s*(--|\/\/)/.test(l)).map((l) => l.replace(/\s*(--|\/\/).*$/, '')).join('\n');

// a machine whose conditions use the new notations, and the same in C-style
function machine(lang, boolean) {
  const c = (bool, cs) => (boolean ? bool : cs);
  return normalizeFsm({
    name: 'notations', lang,
    inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'c', width: 1 }, { name: 'n', width: 4 }],
    outputs: [{ name: 'z', width: 2, default: '0' }, { name: 'w', width: 1, default: '0' }],
    states: [{ id: 's0', name: 'S0' }, { id: 's1', name: 'S1', outputs: { z: '1' } }, { id: 's2', name: 'S2', outputs: { z: '2' } },
      { id: 's3', name: 'S3', outputs: { z: '3' } }],
    transitions: [
      { id: 't0', from: 's0', to: 's0', cond: c('else', '') },
      { id: 't1', from: 's0', to: 's1', cond: c("a.b + c'", 'a && b || !c'), outputs: { w: '1' } },
      { id: 't2', from: 's0', to: 's2', cond: c('/a · c', '!a && c') },
      { id: 't3', from: 's1', to: 's0', cond: c("(a + b)' AND NOT c", '!(a || b) && !c') },
      { id: 't4', from: 's1', to: 's2', cond: c('n + 1 >= 8 . a', 'n + 1 >= 8 && a') },
      { id: 't5', from: 's1', to: 's1', cond: c('default', '1') },
      { id: 't6', from: 's2', to: 's0', cond: c("a' + b'", '!a || !b') },
      { id: 't7', from: 's2', to: 's3', cond: c('a OR b', 'a || b') },
      { id: 't8', from: 's3', to: 's0', cond: c('true', '') },
    ],
    initial: 's0',
  });
}

test('#3907 a machine in the new notations: no message, the HDL of its C-style form, simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = machine(lang, true), r = machine(lang, false);
    // (S2's second transition: a OR b is also true when a' + b' is, listed first: an overlap, as in the C-style form)
    const msgs = (x) => validateFsm(x).map((d) => `${d.severity}: ${d.message}`);
    assert.deepEqual(msgs(m), ["warning: State S2: the transitions to S0 ('a' + b'') and to S3 ('a OR b') are both true when a=0, b=1; the one listed first (to S0) is taken"]);
    assert.deepEqual(msgs(r), ["warning: State S2: the transitions to S0 ('!a || !b') and to S3 ('a || b') are both true when a=0, b=1; the one listed first (to S0) is taken"]);
    assert.equal(code(generateFsm(m, lang).code), code(generateFsm(r, lang).code), lang);
    const vectors = randomVectors(m, 200, 3907);
    const want = runModel(r, vectors);
    assert.deepEqual(runModel(m, vectors), want);
    assert.deepEqual(runHdl(generateFsm(m, lang).code, lang, m, vectors), want, lang);
  }
});

test('#3907 an ASM chart\'s decision in the new notations: valid, the HDL of its C-style form', () => {
  const chart = (cond) => ({
    version: 1, name: 'dec', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
    nodes: [
      { id: 'sA', type: 'state', name: 'A', x: 0, y: 0, actions: [] },
      { id: 'd', type: 'decision', x: 0, y: 100, cond },
      { id: 'sB', type: 'state', name: 'B', x: 0, y: 200, actions: ['z = 1'] },
    ],
    edges: [
      { id: 'e1', from: 'sA', to: 'd', port: 'next' }, { id: 'e2', from: 'd', to: 'sB', port: 'true' },
      { id: 'e3', from: 'd', to: 'sA', port: 'false' }, { id: 'e4', from: 'sB', to: 'sA', port: 'next' },
    ],
    initial: 'sA',
  });
  assert.deepEqual(validateAsm(chart("a.b' + /a")), []);
  for (const lang of ['vhdl', 'verilog']) {
    assert.equal(code(generateAsm({ ...chart("a.b' + /a"), lang }, lang).code), code(generateAsm({ ...chart('a && !b || !a'), lang }, lang).code), lang);
  }
});

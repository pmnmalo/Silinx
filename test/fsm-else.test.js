// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state's otherwise transition spelled as StateCAD spells it (#4489): @else / @ELSE, others and otherwise accepted
// as else, default, true, 1 and none are (#3907): recognised (and what is not), tried last, one per state (Check's
// error), drawn as else (core/fsm.js drawnAsElse), the transition table's rows, the conversion to an ASM chart, and
// the HDL generated the same as from else: compiled, elaborated (no warnings) and simulated in VHDL and in Verilog
// against a reference written by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFsm, validateFsm, generateFsm, transitionsFrom, isOtherwise, isElseWord, drawnAsElse, parseLabel, transitionTable,
  fsmToAsm, ELSE_COND,
} from '../core/fsm.js';
import { generate as generateAsm } from '../core/asm.js';
import { compile, elaborate } from '../core/compile.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const SPELLINGS = ['@else', '@ELSE', '@Else', ' @ else ', 'others', 'OTHERS', 'otherwise', 'Otherwise', 'else', 'ELSE', 'default'];

test('#4489 the otherwise spellings: StateCAD\'s @else, others, otherwise, besides else, default, true, 1 and none', () => {
  for (const s of SPELLINGS) {
    assert.equal(isOtherwise(s), true, s);
    assert.equal(isElseWord(s), true, s);
  }
  // (the otherwise, not a word: the Else box not ticked)
  for (const s of ['', '  ', '1', 'true', 'TRUE', 'always', null, undefined]) {
    assert.equal(isOtherwise(s), true, String(s));
    assert.equal(isElseWord(s), false, String(s));
  }
  for (const s of ['@', '@@else', 'elsewhere', 'other', 'otherwise x', 'else && a', '@default', 'a', '0', 'x | !x']) {
    assert.equal(isOtherwise(s), false, s);
    assert.equal(isElseWord(s), false, s);
  }
  assert.equal(ELSE_COND, 'else');
  // typed in place with outputs: the condition, then the outputs
  assert.equal(parseLabel('@ELSE / z=1').cond, '@ELSE');
  assert.deepEqual(parseLabel('@ELSE / z=1').outputs, parseLabel('else / z=1').outputs);
});

// A --a--> B, A --@ELSE--> C; B --otherwise--> A (listed first), B --b--> C; C --others--> A. Moore output st: the
// state's number.
const machine = (lang, conds = ['a', '@ELSE', 'otherwise', 'b', 'others']) => normalizeFsm({
  name: 'els', lang, inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'st', width: 2, default: '0' }],
  states: [{ id: 'A', name: 'A', x: 100, y: 100 }, { id: 'B', name: 'B', x: 300, y: 100, outputs: { st: '1' } }, { id: 'C', name: 'C', x: 200, y: 300, outputs: { st: '2' } }],
  transitions: [['A', 'B'], ['A', 'C'], ['B', 'A'], ['B', 'C'], ['C', 'A']].map(([from, to], i) => ({ id: `t${i + 1}`, from, to, cond: conds[i] })),
  initial: 'A',
});
// (the reference, by hand: the outputs sampled before each clock edge, from the reset state A)
function byHand(vectors) {
  const next = { A: (v) => (v.a ? 'B' : 'C'), B: (v) => (v.b ? 'C' : 'A'), C: () => 'A' };
  const code = { A: '00', B: '01', C: '10' };
  let s = 'A';
  return vectors.map((v) => { const o = code[s]; s = next[s](v); return o; });
}
const problems = (m) => validateFsm(m).filter((d) => d.severity !== 'info').map((d) => `${d.severity}: ${d.message}`);
// (the generated code without its comments: they quote the drawing's conditions)
const code = (s) => s.split('\n').filter((l) => !/^\s*(--|\/\/)/.test(l)).map((l) => l.replace(/\s*(--|\/\/).*$/, '')).join('\n');

test('#4489 tried last wherever listed, no warning; two in a state: Check\'s error, whatever their spellings', () => {
  const m = machine('vhdl');
  assert.deepEqual(transitionsFrom(m, 'B').map((t) => t.id), ['t4', 't3']);
  assert.deepEqual(transitionsFrom(m, 'A').map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(problems(m), []);
  for (const [x, y] of [['@ELSE', 'others'], ['otherwise', '@else'], ['others', ''], ['@Else', '1']]) {
    const two = machine('vhdl', ['a', '!a', x, y, 'others']);
    assert.deepEqual(problems(two), ['error: State B has 2 otherwise transitions (else, @else, default, others, otherwise, true, 1 or no condition), to A, C; a state has one at most'], `${x} ${y}`);
  }
});

test('#4489 drawn as else: a word always, none / 1 / true when its state has another transition', () => {
  const m = machine('vhdl', ['a', '@ELSE', '', 'b', 'others']);
  assert.deepEqual(m.transitions.map((t) => drawnAsElse(m, t)), [false, true, true, false, true]);
  // (alone in its state: 1, true or none drawn as typed; a word still else)
  const one = machine('vhdl', ['a', '@ELSE', 'otherwise', 'b', '1']);
  assert.equal(drawnAsElse(one, one.transitions[4]), false);
  one.transitions[4].cond = '';
  assert.equal(drawnAsElse(one, one.transitions[4]), false);
  one.transitions[4].cond = 'Otherwise';
  assert.equal(drawnAsElse(one, one.transitions[4]), true);
});

test('#4489 the transition table: the otherwise transitions last, their conditions as typed', () => {
  const t = transitionTable(machine('vhdl'));
  const rows = Array.isArray(t) ? t : t.rows;
  assert.deepEqual(rows.filter((r) => !r.stays).map((r) => [r.state, r.cond, r.next]),
    [['A', 'a', 'B'], ['A', '@ELSE', 'C'], ['B', 'b', 'C'], ['B', 'otherwise', 'A'], ['C', 'others', 'A']]);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#4489 the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: as from else; compiled, elaborated with no warnings, simulated as the reference by hand`, () => {
    const m = machine(lang);
    const g = generateFsm(m, lang);
    assert.equal(code(g.code), code(generateFsm(machine(lang, ['a', 'else', 'else', 'b', 'else']), lang).code));
    assert.equal(code(g.code), code(generateFsm(machine(lang, ['a', '', '', 'b', '']), lang).code));
    const lib = compile([{ path: g.filename, lang, text: g.code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), []);
    assert.deepEqual(elaborate(lib, 'els').diags.map((e) => `${e.severity}: ${e.message}`), []);
    const vectors = randomVectors(m, 160, lang === 'vhdl' ? 7 : 8);
    const want = byHand(vectors);
    assert.deepEqual(runModel(m, vectors), want);
    assert.deepEqual(runHdl(g.code, lang, m, vectors), want);
  });
}

test('#4489 converted to an ASM chart: the otherwise the decisions\' last exit, its HDL simulated as the reference', () => {
  const m = machine('verilog');
  const asm = fsmToAsm(m);
  assert.deepEqual(asm.nodes.filter((n) => n.type === 'decision').map((n) => n.cond), ['a', 'b']);
  const vectors = randomVectors(m, 120, 9);
  assert.deepEqual(runHdl(generateAsm(asm, 'verilog').code, 'verilog', m, vectors), byHand(vectors));
});

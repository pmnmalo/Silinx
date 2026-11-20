// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A transition's condition is shown as it was typed (#4888): on its arc, in its Properties, saved and read back. The
// Boolean notation draws it as it is (the Engineering one's slash NOTs as bars only); the generated HDL writes each
// language's own literals and operators, whatever notation was typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFsm, generateFsm, validateFsm, parseCond } from '../core/fsm.js';
import { drawnAsTyped, showCondText, NOTATION_IDS } from '../core/expr-notation.js';
import { condAsText } from '../core/cond-notation.js';
import { overline } from '../core/overline.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const B = '̅';
// the notations a student types: VHDL's and Verilog's literals and comparisons, hex, single bits, and / &&
const TYPED = [
  'oper == "000"',
  'oper = "001"',
  "oper == 3'b010",
  "oper = 3'h3",
  'oper == 0x4',
  "go = '1' and oper /= \"111\"",
  "go && oper[0] == '1'",
  'not go or oper = "110"',
];

/** A machine of the inputs `oper` (3 bits) and `go`: a ring of states S0…S7, Si → S(i+1) on TYPED[i] (one transition
 *  a state: no two true at once), each state its own value of z. */
function machine(lang) {
  const n = TYPED.length;
  return normalizeFsm({
    name: 'ops', lang, inputs: [{ name: 'oper', width: 3 }, { name: 'go', width: 1 }],
    outputs: [{ name: 'z', width: 3, default: '"000"' }],
    states: TYPED.map((_, i) => ({ id: `s${i}`, name: `S${i}`, x: 100 + 80 * i, y: 100, outputs: { z: `"${i.toString(2).padStart(3, '0')}"` } })),
    transitions: TYPED.map((cond, i) => ({ id: `t${i}`, from: `s${i}`, to: `s${(i + 1) % n}`, cond })),
    initial: 's0',
  });
}

test('#4888 a condition is drawn as it was typed in every notation, never written again from its tree', () => {
  for (const n of NOTATION_IDS) for (const c of TYPED) assert.equal(drawnAsTyped(c, n), c, `${n}: ${c}`);
  // (the case reported: the notation wrote its literal again)
  assert.equal(showCondText('oper == "000"', 'engineering'), "oper == 3'b000");
  assert.equal(drawnAsTyped('oper == "000"', 'engineering'), 'oper == "000"');
  for (const c of ['a && !b', 'a and not b', '!(a || b)', 'a.b + c', '¬a ∧ b', '~a & b', "a' + b"]) {
    for (const n of NOTATION_IDS) assert.equal(drawnAsTyped(c, n), c, `${n}: ${c}`);
  }
});

test('#4888 the Engineering notation: a NOT typed as a slash drawn as its bar (as #4417 drew it), the rest as typed', () => {
  const cases = [
    ['/a.b', `a${B}.b`],
    ['/(a + b)', overline('a + b')],
    ['/(a.b) + c', `${overline('a.b')} + c`],
    ['//a', `a${B}${B}`],
    ['/ x[2] && y', `${overline('x[2]')} && y`],
    ['/(/a + b)', overline(`a${B} + b`)],
    ['oper /= "000"', 'oper /= "000"'],
    ['/go && oper == "000"', `g${B}o${B} && oper == "000"`],
  ];
  for (const [typed, drawn] of cases) {
    assert.equal(drawnAsTyped(typed, 'engineering'), drawn, typed);
    assert.equal(drawnAsTyped(typed, 'slash'), typed, `text only: ${typed}`);
  }
  // (a condition the conversions wrote, in the text only notation: drawn as #4417's showCond drew it)
  for (const c of ['/a.b', '/(a + b)', '/(a.b) + c', 'a./b + /c']) assert.equal(drawnAsTyped(c, 'engineering'), showCondText(c, 'engineering'), c);
  // not valid, the otherwise words, empty: as they are
  for (const c of ['/a &&', 'else', '@ELSE', '', '/(a']) assert.equal(drawnAsTyped(c, 'engineering'), c, c);
});

test('#4888 the typed text round-trips: kept as typed, saved and read back the same', () => {
  const m = machine('vhdl');
  assert.deepEqual(m.transitions.map((t) => t.cond), TYPED);
  const back = normalizeFsm(JSON.parse(JSON.stringify(m, null, 2)));
  assert.deepEqual(back.transitions.map((t) => t.cond), m.transitions.map((t) => t.cond));
  for (const c of TYPED) assert.equal(condAsText(c), c);   // (what the Properties box and the inline edit keep)
  // the outputs, as typed too
  assert.deepEqual(back.states.slice(0, 2).map((s) => s.outputs), [{ z: '"000"' }, { z: '"001"' }]);
  // (a drawing saved with the normalised text: the same machine, drawn as it was saved)
  const old = normalizeFsm({ ...JSON.parse(JSON.stringify(m)), transitions: m.transitions.map((t) => ({ ...t, cond: t.cond && showCondText(t.cond, 'verilog') })) });
  const vectors = randomVectors(m, 200, 4888);
  assert.deepEqual(runModel(old, vectors), runModel(m, vectors));
  assert.equal(drawnAsTyped(old.transitions[0].cond, 'engineering'), "oper == 3'b000");
});

test('#4888 the generated VHDL and Verilog: each its own literals whatever was typed, no warnings, compiled, elaborated and simulated', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = machine(lang);
    // Check: no error, no warning; its information only, each state staying when its condition is false
    const problems = validateFsm(m);
    assert.deepEqual(problems.filter((p) => p.severity !== 'info'), [], `${lang}: Check`);
    assert.deepEqual(problems.map((p) => [p.state, /^State S\d: no transition is true when .*; the machine stays in S\d$/.test(p.message)]), m.states.map((s) => [s.id, true]));
    const g = generateFsm(m, lang);
    assert.deepEqual(g.warnings ?? [], [], `${lang}: no warnings`);
    const lines = g.code.split('\n').filter((l) => /\boper\b/.test(l) && /\bif\b/.test(l)).map((l) => l.trim());
    assert.equal(lines.length, TYPED.length, `${lang}: one test per condition`);
    if (lang === 'verilog') {
      assert.ok(lines[0].includes("oper == 3'b000") && lines[1].includes("oper == 3'b001") && lines[2].includes("oper == 3'b010"), lines.join('\n'));
      assert.ok(lines.every((l) => !/"|\/=|\band\b/.test(l)), `no VHDL in the Verilog:\n${lines.join('\n')}`);
    } else {
      assert.ok(lines[0].includes('unsigned(oper) = 0') && lines[1].includes('unsigned(oper) = 1') && lines[5].includes('/= 7'), lines.join('\n'));
      assert.ok(lines.every((l) => !/'b|'h|==|&&|\b0x/.test(l)), `no Verilog in the VHDL:\n${lines.join('\n')}`);
    }
    // (every condition read as the same function: the HDL against the model, every value of oper and go)
    const vectors = randomVectors(m, 400, 4888);
    assert.deepEqual(runHdl(g.code, lang, m, vectors), runModel(m, vectors), `${lang}: simulated`);
    for (const c of TYPED) assert.ok(!parseCond(c).error, c);
  }
});

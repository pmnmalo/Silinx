// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A drawing keeps its conditions as text (#4417): the Boolean notation is how a state diagram's arc and an ASM chart's
// decision are drawn, never what is kept. The conversions write a notation's text form (the Engineering notation's:
// the text only one's), a condition written with overbars (a drawing an earlier version saved, a text pasted) is read
// as the text only notation's /…, the same function; a condition with none is kept as it was typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeFsm, parseCond, evalCond, condNames, generateFsm, fsmToAsm } from '../core/fsm.js';
import { normalizeModel } from '../core/asm.js';
import { NOTATION_IDS, showCond } from '../core/expr-notation.js';
import { condAsText, textNotation, writeCond } from '../core/cond-notation.js';
import { overline } from '../core/overline.js';
import { randomVectors, runModel } from './fsm-sim.js';

const BAR = '̅';
const CONDS = ['!equal', 'x && !y', '!(a || b) && c', 'a ^ !b', '!(a && b) || !c', 'cnt == 3 && !go', 'v[0] || !(v[1] && x)'];

// a condition's truth table over its names (each 0/1; cnt 0..4)
function table(text) {
  const p = parseCond(text);
  assert.ok(!p.error, `${text}: ${p.error}`);
  const names = [...condNames(p.ast)].sort();
  const rows = [];
  const n = names.length;
  for (let k = 0; k < 5 ** n; k++) {
    const env = {};
    let v = k;
    names.forEach((nm) => { env[nm] = BigInt(nm === 'cnt' ? v % 5 : v % 2); v = Math.floor(v / 5); });
    if (names.includes('v')) env.v = BigInt(k % 4);
    rows.push(String(evalCond(p.ast, env, (nm) => (nm === 'cnt' ? 3 : nm === 'v' ? 2 : 1))));
  }
  return rows.join('');
}

test('#4417 the text form of each notation: the Engineering one\'s the text only one\'s, the others their own', () => {
  assert.deepEqual(NOTATION_IDS.map(textNotation), ['slash', 'slash', 'logic', 'vhdl', 'verilog']);
  assert.equal(textNotation('nonsense'), 'slash');   // (the default, Engineering)
  assert.equal(textNotation(undefined), 'slash');
});

test('#4417 writeCond: a condition in each notation\'s text form, never an overbar, read back as the same function', () => {
  for (const c of CONDS) {
    const ast = parseCond(c).ast;
    for (const n of NOTATION_IDS) {
      const w = writeCond(ast, n);
      assert.ok(!w.includes(BAR), `${c} ${n}: ${w}`);
      assert.equal(w, showCond(ast, textNotation(n)), `${c} ${n}`);
      assert.equal(table(w), table(c), `${c} ${n}: ${w}`);
    }
  }
  assert.equal(writeCond(parseCond('!equal').ast, 'engineering'), '/equal');
  assert.equal(writeCond(parseCond('x && !y').ast, 'engineering'), 'x./y');
});

test('#4417 condAsText: an overbar read as the text only notation\'s NOT, a text with none as it is', () => {
  assert.equal(condAsText(`e${BAR}q${BAR}u${BAR}a${BAR}l${BAR}`), '/equal');
  assert.equal(condAsText(showCond(parseCond('x && !y').ast, 'engineering')), 'x./y');
  assert.equal(condAsText(showCond(parseCond('!(a || b) && c').ast, 'engineering')), '/(a + b).c');
  // every condition written with bars: no bar left, the same function
  for (const c of CONDS) {
    const eng = showCond(parseCond(c).ast, 'engineering');
    const t = condAsText(eng);
    assert.ok(!t.includes(BAR), `${c}: ${t}`);
    assert.equal(table(t), table(c), `${c}: ${eng} -> ${t}`);
  }
  // no bar: as typed (its spelling, its blanks, the otherwise words, nothing)
  for (const s of ['x && !y', '  a AND NOT b ', 'else', 'default', '', 'not a valid (']) assert.equal(condAsText(s), s);
  assert.equal(condAsText(undefined), '');
  assert.equal(condAsText(null), '');
  // a bar in a text that is not a condition: each run under a bar as /( … ), no bar left
  const bad = `${overline('ab')} &&`;
  assert.equal(condAsText(bad), '/(ab) &&');
});

test('#4417 a state diagram saved with overbars (15.27, the Engineering notation) read back as text, the same machine', () => {
  const traffic = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8'));
  const typed = normalizeFsm(traffic);
  // (the diagram as a conversion of 15.27 wrote it: each condition in the Engineering notation, its bars)
  const barred = JSON.parse(JSON.stringify(traffic));
  for (const t of barred.transitions) { const p = parseCond(t.cond); if (p.ast) t.cond = showCond(p.ast, 'engineering'); }
  assert.ok(barred.transitions.some((t) => t.cond.includes(BAR)), 'the sample has bars');
  const m = normalizeFsm(barred);
  for (const t of m.transitions) assert.ok(!t.cond.includes(BAR), t.cond);
  assert.ok(m.transitions.some((t) => t.cond.includes('/')), m.transitions.map((t) => t.cond).join(' | '));
  const vectors = randomVectors(typed, 150, 4417);
  assert.deepEqual(runModel(m, vectors), runModel(typed, vectors));
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateFsm({ ...m, lang }, lang).warnings ?? [], generateFsm({ ...typed, lang }, lang).warnings ?? [], lang);
  // a typed diagram unchanged
  assert.deepEqual(normalizeFsm(typed), typed);
});

test('#4417 an ASM chart\'s decision saved with overbars read back as text', () => {
  const traffic = normalizeFsm(JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8')));
  const asm = fsmToAsm(traffic);
  const decisions = (a) => a.nodes.filter((n) => n.type === 'decision');
  assert.ok(decisions(asm).length, 'the chart has decisions');
  const barred = JSON.parse(JSON.stringify(asm));
  for (const n of decisions(barred)) n.cond = showCond(parseCond(n.cond).ast, 'engineering');
  const back = normalizeModel(barred);
  decisions(back).forEach((n, i) => {
    assert.ok(!n.cond.includes(BAR), n.cond);
    assert.equal(table(n.cond), table(decisions(asm)[i].cond), n.cond);
  });
  // typed decisions kept as they are
  assert.deepEqual(decisions(normalizeModel(asm)).map((n) => n.cond), decisions(asm).map((n) => n.cond));
});

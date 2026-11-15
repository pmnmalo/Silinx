// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The conditions the conversions write, in a notation (#3915 part 2): an HDL module made a state diagram or an ASM chart
// (fsmFromHdl, asmFromHdl), an ASM chart's state diagram (asmToFsm), a Petri net's state machine (petriToFsm). Each
// condition the conversion writes is the neutral one (no notation, as before) shown in the notation; the machine the
// same (simulated as the model, its HDL the same but its comments (the Verilog notation's: the bitwise operators), that
// HDL simulated in VHDL and Verilog); a previous
// diagram's conditions kept as they were typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fsmFromHdl, asmToFsm, fsmToAsm, generateFsm, normalizeFsm, parseCond, isOtherwise } from '../core/fsm.js';
import { asmFromHdl } from '../core/asm-from-hdl.js';
import { validate as validateAsm } from '../core/asm.js';
import { petriToFsm } from '../core/petri-fsm.js';
import { newPetri } from '../core/petri.js';
import { NOTATION_IDS, showCond } from '../core/expr-notation.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const ex = (f) => fs.readFileSync(new URL(`../examples/traffic/src/${f}`, import.meta.url), 'utf8');
const TRAFFIC = ex('traffic.vhd');
const TRAFFIC_FSM = JSON.parse(ex('traffic.fsm.json'));
// the generated code without its comments (they quote the drawing's conditions)
const code = (s) => s.split('\n').filter((l) => !/^\s*(--|\/\/)/.test(l)).map((l) => l.replace(/\s*(--|\/\/).*$/, '')).join('\n');
// a condition in a notation: the neutral one shown in it (the otherwise words as they are)
const shown = (text, n) => (isOtherwise(text) ? text : showCond(parseCond(text).ast, n));

test('#3915 an HDL module made a state diagram: its conditions in each notation, the same machine, its HDL simulated in VHDL and Verilog', () => {
  const plain = fsmFromHdl(TRAFFIC, { path: 'traffic.vhd' }).model;
  assert.deepEqual(plain.transitions.map((t) => t.cond), fsmFromHdl(TRAFFIC, { path: 'traffic.vhd', notation: null }).model.transitions.map((t) => t.cond));
  const vectors = randomVectors(plain, 150, 3915);
  const want = runModel(plain, vectors);
  for (const n of NOTATION_IDS) {
    const m = fsmFromHdl(TRAFFIC, { path: 'traffic.vhd', notation: n }).model;
    assert.deepEqual(m.transitions.map((t) => t.cond), plain.transitions.map((t) => shown(t.cond, n)), n);
    assert.deepEqual(runModel(m, vectors), want, n);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateFsm({ ...m, lang }, lang).code;
      // (the same code; the Verilog notation's ~ & | are the bitwise operators, the HDL writes them so: the same function)
      if (n !== 'verilog') assert.equal(code(g), code(generateFsm({ ...plain, lang }, lang).code), `${n} ${lang}`);
      assert.deepEqual(runHdl(g, lang, m, vectors), want, `${n} ${lang}`);
    }
  }
  // (a sample: the Engineering notation's overbar, the logic notation's signs)
  const eng = fsmFromHdl(TRAFFIC, { path: 'traffic.vhd', notation: 'engineering' }).model.transitions.map((t) => t.cond);
  assert.ok(eng.some((c) => c.includes('̅')), eng.join(' | '));
  assert.ok(fsmFromHdl(TRAFFIC, { path: 'traffic.vhd', notation: 'logic' }).model.transitions.some((t) => /[¬∧∨]/.test(t.cond)));
});

test('#3915 the previous diagram\'s conditions are kept as typed, whatever the notation', () => {
  const prev = normalizeFsm(TRAFFIC_FSM);
  for (const n of NOTATION_IDS) {
    const m = fsmFromHdl(TRAFFIC, { path: 'traffic.vhd', previous: prev, notation: n }).model;
    assert.deepEqual(m.transitions.map((t) => t.cond), prev.transitions.map((t) => t.cond), n);
  }
  // an ASM chart made from the diagram and back: its conditions, typed, kept
  const back = asmToFsm(fsmToAsm(prev), { previous: prev, notation: 'logic' });
  assert.deepEqual(back.transitions.map((t) => t.cond), prev.transitions.map((t) => t.cond));
});

test('#3915 an HDL module made an ASM chart, an ASM chart\'s state diagram: their conditions in the notation, valid', () => {
  const plain = asmFromHdl(TRAFFIC, { path: 'traffic.vhd' }).model;
  const decisions = (a) => a.nodes.filter((x) => x.type === 'decision').map((x) => x.cond);
  for (const n of NOTATION_IDS) {
    const a = asmFromHdl(TRAFFIC, { path: 'traffic.vhd', notation: n }).model;
    assert.deepEqual(decisions(a), decisions(plain).map((c) => shown(c, n)), n);
    assert.deepEqual(validateAsm(a).filter((d) => d.severity === 'error'), [], n);
    // its state diagram (a related view): written in the notation, the machine the same
    const f = asmToFsm(a, { notation: n }), f0 = asmToFsm(plain);
    assert.deepEqual(f.transitions.map((t) => t.cond), f0.transitions.map((t) => shown(t.cond, n)), n);
    const vectors = randomVectors(f0, 100, 7);
    assert.deepEqual(runModel(f, vectors), runModel(f0, vectors), n);
  }
});

test('#3915 a Petri net\'s state machine: its conditions in the notation', () => {
  const net = newPetri('ctl', 'vhdl');
  const plain = petriToFsm(net).fsm;
  for (const n of NOTATION_IDS) {
    const f = petriToFsm(net, { notation: n }).fsm;
    assert.deepEqual(f.transitions.map((t) => t.cond), plain.transitions.map((t) => (t.cond ? shown(t.cond, n) : t.cond)), n);
  }
  assert.ok(plain.transitions.some((t) => t.cond), 'the net has conditions');
});

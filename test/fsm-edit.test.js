// A state diagram edited through its transition table (core/fsm-edit.js, #4974): a row's next state, condition and
// outputs, a row added or removed, a state added or renamed; their messages and their refusals. The 3-bit up/down
// counter of the course (S0…S7, the input up, the output q) made from an empty machine through these alone: Check's
// problems none, its transition table the course's, its VHDL and its Verilog compiled, elaborated with no warnings and
// simulated as a counter by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFsm, validateFsm, transitionTable, generateFsm, nameOf } from '../core/fsm.js';
import { compile, elaborate } from '../core/compile.js';
import * as E from '../core/fsm-edit.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

/** A machine of two states, A (z=1) and B, A → B on x, B → A always. */
const two = (type) => normalizeFsm({
  name: 'two', inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }, { name: 'y', width: 2, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 100, y: 100, outputs: { z: '1' } }, { id: 'b', name: 'B', x: 300, y: 100, outputs: {} }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x', bend: 30, outputs: type === 'mealy' ? { y: '2' } : {} }, { id: 't2', from: 'b', to: 'a', cond: '' }],
  initial: 'a',
});
const problems = (m) => validateFsm(m).map((d) => `${d.severity}: ${d.message}`);

test('#4974 a row\'s next state: the transition goes there, its arrow\'s shape the default; a state not there refused', () => {
  const m = two();
  assert.deepEqual(E.setNextState(m, 't1', 'a'), { message: 'Transition A → B: its next state is now A' });
  assert.deepEqual([m.transitions[0].to, 'bend' in m.transitions[0]], ['a', false]);
  assert.deepEqual(E.setNextState(m, 't1', 'a'), { message: 'Transition A → A: already its next state' });
  assert.deepEqual(E.setNextState(m, 't1', 'zz'), { error: "no state 'zz'" });
  assert.deepEqual(E.setNextState(m, 't9', 'a'), { error: "no transition 't9'" });
  assert.equal(m.transitions[0].to, 'a');
});

test('#4974 a row\'s condition kept as typed (#4888): an overbar as /, empty always, else the otherwise', () => {
  const m = two();
  assert.deepEqual(E.setCondition(m, 't1', '  !x  '), { message: 'Transition A → B: condition !x' });
  assert.equal(m.transitions[0].cond, '!x');
  E.setCondition(m, 't1', 'x̅');   // (an overbar pasted: kept as the text notation's /x, #4417)
  assert.equal(m.transitions[0].cond, '/x');
  assert.deepEqual(E.setCondition(m, 't2', ''), { message: 'Transition B → A: condition (empty: always)' });
  assert.deepEqual(E.setCondition(m, 't2', 'else'), { message: 'Transition B → A: condition else' });
  assert.deepEqual(E.setCondition(m, 't9', 'x'), { error: "no transition 't9'" });
  // (a condition not valid is Check's error, as the diagram's)
  E.setCondition(m, 't1', 'x &&');
  assert.ok(problems(m).some((p) => p.startsWith('error:') && /x &&/.test(p)), problems(m).join('\n'));
});

test('#4974 a row\'s outputs: a Moore machine\'s the state\'s, a Mealy machine\'s the transition\'s; X kept (#4891); refusals', () => {
  const m = two();
  const rowA = transitionTable(m).rows.find((r) => r.transition === 't1');
  assert.deepEqual(E.rowOutputsOwner(m, rowA), { type: 'state', id: 'a' });
  assert.deepEqual(E.setRowOutputs(m, rowA, 'z=0, y=X'), { message: 'State A: outputs z=0, y=X' });
  assert.deepEqual(m.states[0].outputs, { z: '0', y: 'X' });
  assert.deepEqual(E.setRowOutputs(m, rowA, 'y="1X"'), { message: 'State A: outputs y="1X"' });
  assert.deepEqual(m.states[0].outputs, { y: '"1X"' });   // (z not written: its default)
  assert.deepEqual(E.setRowOutputs(m, rowA, ''), { message: 'State A: outputs (none: the defaults)' });
  assert.deepEqual(m.states[0].outputs, {});
  // refused, nothing changed
  m.states[0].outputs = { z: '1' };
  assert.deepEqual(E.setRowOutputs(m, rowA, 'w=1'), { error: "'w' is not an output" });
  assert.deepEqual(E.setRowOutputs(m, rowA, 'y=5'), { error: 'State A: the value 5 of y does not fit in 2 bit(s)' });
  assert.deepEqual(E.setRowOutputs(m, rowA, 'z=1z=1'), { error: "the value '1z=1' of z must be a constant (e.g. 0, 1, 4'b1010, 5)" });   // (a comma missing)
  assert.deepEqual(m.states[0].outputs, { z: '1' });
  // a Mealy machine: the transition's (the state's values for the outputs not written)
  const ml = two('mealy');
  const r1 = transitionTable(ml).rows.find((r) => r.transition === 't1');
  assert.deepEqual(E.rowOutputsOwner(ml, r1), { type: 'trans', id: 't1' });
  assert.deepEqual(E.setRowOutputs(ml, r1, 'y=3'), { message: 'Transition A → B: outputs y=3' });
  assert.deepEqual([ml.transitions[0].outputs, ml.states[0].outputs], [{ y: '3' }, { z: '1' }]);
  // a row of a state that stays (no transition): the state's
  assert.deepEqual(E.rowOutputsOwner(ml, { stateId: 'b', stays: true }), { type: 'state', id: 'b' });
});

test('#4974 a row added (before the state\'s otherwise, or after a row) and removed; the otherwise given a next state', () => {
  const m = two();
  m.transitions.push({ id: 't3', from: 'a', to: 'a', cond: 'else', outputs: {} });
  const r = E.addTransition(m, 'a', 'b', '!x');
  assert.deepEqual(r, { message: 'Transition A → B added: condition !x', id: 't4' });
  assert.deepEqual(m.transitions.map((t) => t.id), ['t1', 't2', 't4', 't3']);   // (before A's else)
  assert.deepEqual(E.addTransition(m, 'a', 'a', '', 't1').id, 't5');
  assert.deepEqual(m.transitions.filter((t) => t.from === 'a').map((t) => t.id), ['t1', 't5', 't4', 't3']);
  assert.deepEqual(E.addTransition(m, 'zz', 'a'), { error: "no state 'zz'" });
  assert.deepEqual(E.removeTransition(m, 't5'), { message: 'Transition A → A removed' });
  assert.deepEqual(E.removeTransition(m, 't5'), { error: "no transition 't5'" });
  // B's row "otherwise (stays)": given the next state A, a transition else of its own
  const n = two();
  n.transitions = n.transitions.filter((t) => t.id !== 't2');
  assert.deepEqual(E.setStayNext(n, 'b', 'a'), { message: 'State B: in every other case, to A', id: 't2' });
  assert.deepEqual(n.transitions.at(-1), { id: 't2', from: 'b', to: 'a', cond: 'else', outputs: {} });
  assert.deepEqual(E.setStayNext(n, 'b', 'b'), { message: 'State B: already stays' });
});

test('#4974 a state added (S<n>, or its name; placed beside the others) and renamed; a name used twice refused', () => {
  const m = two();
  assert.deepEqual(E.addState(m), { message: 'State S0 added', id: 's1' });
  assert.deepEqual(E.addState(m, 'S0'), { error: "The name 'S0' is used twice (letter case does not count)" });
  assert.deepEqual(E.addState(m, 'b'), { error: "The name 'b' is used twice (letter case does not count)" });
  assert.deepEqual(E.addState(m, ' Wait '), { message: 'State Wait added', id: 's2' });
  const [s0, w] = m.states.slice(2);
  assert.deepEqual([s0.x > 300, w.x > s0.x, m.states[0].x, m.initial], [true, true, 100, 'a']);   // (each to the right of the others)
  assert.deepEqual(E.renameState(m, 's2', 'Idle'), { message: 'State Wait renamed Idle' });
  assert.deepEqual(E.renameState(m, 's2', 'idle'), { message: 'State Idle renamed idle' });
  assert.deepEqual(E.renameState(m, 's2', 'a'), { error: "State idle: The name 'a' is used twice (letter case does not count)" });
  assert.deepEqual(E.renameState(m, 's2', ' '), { error: 'State idle: a name is needed' });
  assert.deepEqual(E.renameState(m, 'zz', 'Q'), { error: "no state 'zz'" });
  // (a name not valid: Check's error, as the diagram's)
  E.renameState(m, 's2', '2go');
  assert.ok(problems(m).some((p) => /'2go' is not a valid name/.test(p)), problems(m).join('\n'));
  // the first state of an empty machine: the initial one
  const e = normalizeFsm({ name: 'e', inputs: [], outputs: [], states: [], transitions: [] });
  assert.equal(E.addState(e).id, 's1');
  assert.equal(e.initial, 's1');
  assert.equal(E.freeStateName(e), 'S1');
});

/** The course's 3-bit up/down counter made through the table: 8 states, up / !up, q the state's number. */
function counter(lang) {
  const m = normalizeFsm({ name: 'updown', lang, encoding: 'binary', inputs: [{ name: 'up', width: 1 }], outputs: [{ name: 'q', width: 3, default: '0' }], states: [], transitions: [] });
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(E.addState(m).id);
  for (let i = 0; i < 8; i++) {
    const r = E.addTransition(m, ids[i], ids[(i + 1) % 8], 'up');
    E.addTransition(m, ids[i], ids[i], '!up', r.id);
    const row = transitionTable(m).rows.find((x) => x.transition === r.id);
    assert.equal(E.setRowOutputs(m, row, `q=${i}`).error, undefined);
  }
  // the down transitions' next states set as a row's next state
  for (let i = 0; i < 8; i++) E.setNextState(m, m.transitions.find((t) => t.from === ids[i] && t.cond === '!up').id, ids[(i + 7) % 8]);
  return normalizeFsm(m);
}

test('#4974 the course\'s up/down counter made through the table: no problems, its transition table the course\'s', () => {
  const m = counter('vhdl');
  assert.deepEqual(problems(m), []);
  const rows = transitionTable(m).rows;
  assert.deepEqual(rows.slice(0, 4).map((r) => [r.state, r.code, r.cond, r.next, r.nextCode, r.outputs]),
    [['S0', '000', 'up', 'S1', '001', 'q=0'], ['S0', '000', '!up', 'S7', '111', 'q=0'], ['S1', '001', 'up', 'S2', '010', 'q=1'], ['S1', '001', '!up', 'S0', '000', 'q=1']]);
  assert.equal(rows.length, 16);
  assert.deepEqual([nameOf(m, m.initial), rows.some((r) => r.stays)], ['S0', false]);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#4974 the counter made through the table, its ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}: compiled, elaborated with no warnings, simulated as a counter by hand`, () => {
    const m = counter(lang);
    const g = generateFsm(m, lang);
    const lib = compile([{ path: g.filename, lang, text: g.code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), []);
    assert.deepEqual(elaborate(lib, 'updown').diags.map((e) => `${e.severity}: ${e.message}`), []);
    const vectors = randomVectors(m, 120, lang === 'vhdl' ? 3 : 4);
    // by hand: q the count before the edge, up counting up, else down, modulo 8
    let q = 0;
    const want = vectors.map((v) => { const out = q.toString(2).padStart(3, '0'); q = (q + (v.up ? 1 : 7)) % 8; return out; });
    assert.deepEqual(runModel(m, vectors), want);
    assert.deepEqual(runHdl(g.code, lang, m, vectors), want);
  });
}

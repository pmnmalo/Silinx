// Usability (#5148, part 4): the state diagram editor (web/js/fsm-*.js) as a person uses it, on the traffic example's
// controller (examples/traffic, src/traffic.fsm.json): a state added with the State tool and named in Properties,
// transitions drawn from a state's rim to another state and their conditions typed in place; states dragged (their
// transitions follow); a state renamed in place (F2), an output value set in Properties and a wrong one refused, a
// condition edited in Properties; a transition and a state deleted (Delete). After every step the diagram's Check (no
// error), the HDL it makes in VHDL and Verilog compiled and elaborated; Check's warnings exactly; Undo back to the start
// and Redo to the end: each drag, each field typed its own Undo step, however soon after the one before (#5167). In both
// interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { fsmActions } from './lib/fsm-actions.js';

const FILE = 'test/usability/fsm.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

const KIT = drawKit('fsm', fsmActions);

async function traffic(page, title) {
  const name = `UsabFsm${++n}`;
  await makeProject(env, { name, template: 'traffic' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, kit: KIT });
  await s.open('src/traffic.fsm.json');
  return s;
}
const state = (d, name) => d.states.find((x) => x.name === name);
const trans = (d, from, to) => d.transitions.filter((x) => state(d, from) && x.from === state(d, from).id && x.to === state(d, to)?.id);

uiTest('usability: FSM: a state added and named, transitions drawn to it and from it, their conditions typed; Undo, Redo', E, async (page) => {
  const s = await traffic(page, 'add a state');
  const { a } = s;
  // a state under NIGHT (80, 120), where none is
  await s.step('addState', { at: '(80, 360)' }, () => a.addState(80, 360), {
    expect: (d, b) => { assert.equal(d.states.length, b.states.length + 1); assert.deepEqual([d.states.at(-1).x, d.states.at(-1).y, d.states.at(-1).name], [80, 360, 'S0']); },
  });
  await s.step('renameState', { name: 'S0', to: 'SERVICE' }, () => a.renameState(s.doc.states.at(-1).id, 'SERVICE'), {
    expect: (d) => assert.ok(state(d, 'SERVICE')),
  });
  // (unreached, and with no exit, until it is linked)
  await s.warnings([
    'WARNING: State SERVICE cannot be reached from the initial state CARS',
    'WARNING: State SERVICE has no exit: once there, the machine stays in it until a reset',
  ]);
  const sv = state(s.doc, 'SERVICE').id;
  // NIGHT → SERVICE, drawn from NIGHT's rim; its condition typed in place
  await s.step('drawTransition', { from: 'NIGHT', to: 'SERVICE' }, () => a.drawTransition('s7', sv), {
    expect: (d) => assert.deepEqual(trans(d, 'NIGHT', 'SERVICE').map((x) => x.cond), ['']),
  });
  await s.step('typeInPlace', { cond: 'night && req' }, () => a.typeInPlace('night && req'), {
    expect: (d) => assert.deepEqual(trans(d, 'NIGHT', 'SERVICE').map((x) => x.cond), ['night && req']),
  });
  await s.step('drawTransition', { from: 'SERVICE', to: 'CARS' }, () => a.drawTransition(sv, 's1'));
  await s.step('typeInPlace', { cond: '!req' }, () => a.typeInPlace('!req'), {
    expect: (d) => assert.deepEqual(trans(d, 'SERVICE', 'CARS').map((x) => x.cond), ['!req']),
  });
  await s.warnings([]);
  await s.undoRedo();
});

/** The ends of each transition's arc on its states' circles, as drawn. */
const onCircles = async (a, d, ids) => {
  for (const id of ids) {
    const tr = d.transitions.find((x) => x.id === id);
    const [p, q] = await a.arcEnds(id);
    const [c, e] = [await a.circle(tr.from), await a.circle(tr.to)];
    for (const [pt, ci, w] of [[p, c, 'start'], [q, e, 'end']]) {
      const r = Math.hypot(pt.x - ci.x, pt.y - ci.y);
      assert.ok(Math.abs(r - ci.r) < 14, `${id}'s ${w} ${Math.round(r - ci.r)} px off its state's circle`);
    }
  }
};
/** WALK, CARS_YELLOW and NIGHT dragged, one soon after the other. */
async function threeMoves(s) {
  const { a } = s;
  await s.step('moveState', { state: 'WALK', dx: 60, dy: 40 }, () => a.moveState('s4', 60, 40), {
    expect: async (d) => { assert.deepEqual([state(d, 'WALK').x, state(d, 'WALK').y], [840, 400]); await onCircles(a, d, ['t4', 't5']); },
  });
  await s.step('moveState', { state: 'CARS_YELLOW', dy: -40 }, () => a.moveState('s2', 0, -40), {
    expect: async (d) => { assert.deepEqual([state(d, 'CARS_YELLOW').x, state(d, 'CARS_YELLOW').y], [540, 80]); await onCircles(a, d, ['t2', 't3']); },
  });
  await s.step('moveState', { state: 'NIGHT', dx: -40, dy: 120 }, () => a.moveState('s7', -40, 120), {
    expect: async (d) => { assert.deepEqual([state(d, 'NIGHT').x, state(d, 'NIGHT').y], [40, 240]); await onCircles(a, d, ['t1', 't8']); },
  });
}

// (each drag its own Undo step, however soon after the one before; two states renamed in Properties too, #5167)
uiTest('usability: FSM: states dragged one soon after the other, two renamed: their transitions follow; each its own Undo step', E, async (page) => {
  const s = await traffic(page, 'move states');
  const { a } = s;
  await threeMoves(s);
  await s.step('renameState', { state: 'CARS_YELLOW', to: 'AMBER' }, () => a.renameState('s2', 'AMBER'), { expect: (d) => assert.equal(state(d, 'AMBER')?.id, 's2') });
  await s.step('renameState', { state: 'NIGHT', to: 'DARK' }, () => a.renameState('s7', 'DARK'), { expect: (d) => assert.equal(state(d, 'DARK')?.id, 's7') });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: FSM: a state renamed in place, an output value set in Properties (a wrong one refused), a condition edited; Undo, Redo', E, async (page) => {
  const s = await traffic(page, 'edit states');
  const { a } = s;
  // ALL_RED_2's name typed in place (F2: its text selected, replaced)
  await s.step('editInPlace', { state: 'ALL_RED_2', to: 'CLEAR' }, async () => { await a.editInPlace('s6'); await a.typeInPlace('CLEAR'); }, {
    expect: (d) => assert.deepEqual([state(d, 'CLEAR')?.id, state(d, 'CLEAR')?.outputs], ['s6', { phase: '5' }]),
  });
  // WALK_END's phase: 7, then 9 (too wide for 3 bits: refused, the value as it was)
  await s.step('stateOutput', { state: 'WALK_END', phase: '7' }, () => a.stateOutput('s5', 'phase', '7'), {
    expect: (d) => assert.deepEqual(state(d, 'WALK_END').outputs, { phase: '7' }),
  });
  await s.step('stateOutput', { state: 'WALK_END', phase: '9' }, () => a.stateOutput('s5', 'phase', '9'), {
    changes: false,
    expect: async () => assert.equal(await page.eval((e) => document.querySelector(`${e} .fsm-outvals.souts input[data-key="souts:phase"]`).value, a.ed), '7'),
  });
  // CARS_YELLOW → ALL_RED's condition typed in Properties
  await s.step('condition', { trans: 't3', cond: 'done && !night' }, () => a.condition('t3', 'done && !night'), {
    expect: (d) => assert.equal(d.transitions.find((x) => x.id === 't3').cond, 'done && !night'),
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: FSM: a transition deleted, then a state with its transitions: Check says what is left; Undo, Redo', E, async (page) => {
  const s = await traffic(page, 'delete');
  const { a } = s;
  // NIGHT → CARS: NIGHT then has no exit
  await s.step('deleteTrans', { trans: 't8' }, () => a.deleteTrans('t8'), {
    expect: (d, b) => assert.deepEqual(b.transitions.filter((x) => !d.transitions.some((y) => y.id === x.id)).map((x) => x.id), ['t8']),
  });
  await s.warnings(['WARNING: State NIGHT has no exit: once there, the machine stays in it until a reset']);
  // WALK: its transitions in and out go with it; WALK_END and the states after it no longer reached
  await s.step('deleteState', { state: 'WALK' }, () => a.deleteState('s4'), {
    expect: (d) => { assert.equal(state(d, 'WALK'), undefined); assert.ok(!d.transitions.some((x) => x.from === 's4' || x.to === 's4')); },
  });
  await s.warnings([
    'WARNING: State WALK_END cannot be reached from the initial state CARS',
    'WARNING: State ALL_RED_2 cannot be reached from the initial state CARS',
    'WARNING: State ALL_RED has no exit: once there, the machine stays in it until a reset',
    'WARNING: State NIGHT has no exit: once there, the machine stays in it until a reset',
  ]);
  await s.undoRedo();
});

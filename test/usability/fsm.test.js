// Usability (#5148, part 4): the state diagram editor (web/js/fsm-*.js) as a person uses it, on the traffic example's
// controller (examples/traffic, src/traffic.fsm.json): a state added with the State tool and named in Properties,
// transitions drawn from a state's rim to another state and their conditions typed in place; states dragged (their
// transitions follow); a state renamed in place (F2), an output value set in Properties and a wrong one refused, a
// condition edited in Properties; a transition and a state deleted (Delete). After every step the diagram's Check (no
// error), the HDL it makes in VHDL and Verilog compiled and elaborated; Check's warnings exactly; Undo back to the start
// and Redo to the end. A bug found is a todo test: two drags soon after each other merged into one Undo step. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';

const FILE = 'test/usability/fsm.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The state diagram's own actions: points of the diagram (its coordinates) turned into the page's by the drawing's
 *  transform; a state or a transition found by its id. */
const fsmActions = (page, { ed, t }) => {
  /** A state's circle on the page: its centre and radius. */
  const circle = (id) => page.eval((e, s) => {
    const b = document.querySelector(`${e} [data-state="${s}"] .fsm-circle`)?.getBoundingClientRect();
    return b && { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  }, ed, id);
  /** A point of the diagram on the page. */
  const at = (x, y) => page.eval((e, px, py) => {
    const m = document.querySelector(`${e} .fsm-vp`).getScreenCTM();
    return { x: m.a * px + m.e, y: m.d * py + m.f };
  }, ed, x, y);
  const select = async (id) => {
    const c = await circle(id);
    await page.click(c);
    await page.waitFor((e, s) => document.querySelector(`${e} [data-state="${s}"].sel`) && document.querySelector(`${e} .fsm-sname`), [ed, id], { what: `${id} selected` });
  };
  const selectTrans = async (id) => {
    await page.click(`${ed} [data-trans="${id}"] .fsm-label`);
    await page.waitFor((e) => document.querySelector(`${e} .fsm-cond`), [ed], { what: `${id} selected` });
  };
  return {
    circle, at, select, selectTrans,
    /** The State tool, a click on the diagram at (x, y); the arrow again (Escape). */
    async addState(x, y) {
      await page.click(`${ed} .draw-tool`, { text: await t('State') });
      await page.click(await at(x, y));
      await page.key('Escape');
    },
    /** A transition drawn from the rim of `from` (on the side facing `to`) to `to`'s centre: its text in place open. */
    async drawTransition(from, to) {
      const a = await circle(from), b = await circle(to);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const k = await page.eval((e) => document.querySelectorAll(`${e} [data-trans]`).length, ed);
      await page.drag({ x: a.x + (b.x - a.x) / d * (a.r - 3), y: a.y + (b.y - a.y) / d * (a.r - 3) }, b, { steps: 12 });
      await page.waitFor((e, m) => document.querySelectorAll(`${e} [data-trans]`).length === m + 1 && document.querySelector(`${e} .fsm-inline`), [ed, k], { what: 'the new transition, its text in place' });
    },
    /** The text in place (open) typed, Enter. */
    async typeInPlace(text) {
      await page.type(text);
      await page.key('Enter');
      await page.waitFor((e) => !document.querySelector(`${e} .fsm-inline`), [ed], { what: 'the text in place closed' });
    },
    /** A state dragged by its middle by (dx, dy) of the diagram. */
    async moveState(id, dx, dy) {
      const c = await circle(id);
      const k = await page.eval((e) => document.querySelector(`${e} .fsm-vp`).getScreenCTM().a, ed);
      await page.drag(c, { x: c.x + dx * k, y: c.y + dy * k }, { steps: 10 });
    },
    /** A state selected, F2: its name and outputs in place. */
    async editInPlace(id) {
      await select(id);
      await page.key('F2');
      await page.waitFor((e) => document.activeElement?.matches(`${e} .fsm-inline`), [ed], { what: 'the text in place' });
    },
    /** A state's name typed in Properties. */
    async renameState(id, name) { await select(id); await page.fill(`${ed} .fsm-sname`, name); },
    /** A state's output value typed in Properties (its table's field). */
    async stateOutput(id, out, value) { await select(id); await page.fill(`${ed} .fsm-outvals.souts input[data-key="souts:${out}"]`, value); },
    /** A transition's condition typed in Properties. */
    async condition(id, cond) { await selectTrans(id); await page.fill(`${ed} .fsm-cond`, cond); },
    /** A state or a transition selected, Delete. */
    async deleteState(id) { await select(id); await page.key('Delete'); },
    async deleteTrans(id) { await selectTrans(id); await page.key('Delete'); },
    /** The ends of a transition's arc as drawn, on the page. */
    arcEnds: (id) => page.eval((e, tr) => {
      const p = document.querySelector(`${e} [data-trans="${tr}"] .fsm-edge-line`);
      const m = p.getScreenCTM(), L = p.getTotalLength();
      return [p.getPointAtLength(0), p.getPointAtLength(L)].map((q) => ({ x: m.a * q.x + m.e, y: m.d * q.y + m.f }));
    }, ed, id),
  };
};
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
/** WALK, CARS_YELLOW and NIGHT dragged, one after the other (`pause`: ms before each of the second and third). */
async function threeMoves(s, pause = 0) {
  const { a } = s;
  await s.step('moveState', { state: 'WALK', dx: 60, dy: 40 }, () => a.moveState('s4', 60, 40), {
    expect: async (d) => { assert.deepEqual([state(d, 'WALK').x, state(d, 'WALK').y], [840, 400]); await onCircles(a, d, ['t4', 't5']); },
  });
  await sleep(pause);
  await s.step('moveState', { state: 'CARS_YELLOW', dy: -40 }, () => a.moveState('s2', 0, -40), {
    expect: async (d) => { assert.deepEqual([state(d, 'CARS_YELLOW').x, state(d, 'CARS_YELLOW').y], [540, 80]); await onCircles(a, d, ['t2', 't3']); },
  });
  await sleep(pause);
  await s.step('moveState', { state: 'NIGHT', dx: -40, dy: 120 }, () => a.moveState('s7', -40, 120), {
    expect: async (d) => { assert.deepEqual([state(d, 'NIGHT').x, state(d, 'NIGHT').y], [40, 240]); await onCircles(a, d, ['t1', 't8']); },
  });
}

uiTest('usability: FSM: states dragged: their transitions follow them; Undo, Redo', E, async (page) => {
  const s = await traffic(page, 'move states');
  // (a pause between two drags: two drags within 1.5 s are one Undo step, the todo test below)
  await threeMoves(s, 1600);
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: FSM: states dragged one soon after the other: each drag its own Undo step', E, async (page, _env, t) => {
  t.todo('#5167: two drags of different states within 1.5 s are merged into one Undo step (commit(\'move\'), fsm-history.js)');
  const s = await traffic(page, 'quick moves');
  await threeMoves(s);
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

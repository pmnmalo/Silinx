// Usability tests (#5206, phase 3): the state diagram's vocabulary of random actions (lib/draw-random.js), on the
// traffic example's controller (examples/traffic, src/traffic.fsm.json): a state added with the State tool where nothing
// is, moved to where nothing is, renamed in Properties, its output's value set (and one too wide, refused); a transition
// drawn from a state's rim to another state, its condition typed in place, edited in Properties; a state (not the
// initial one) or a transition deleted; Undo, Redo. A condition tests only the inputs; a name is one no state has.
import { STATE_R } from '../../../core/fsm.js';
import { vocabulary, freshName, segDist } from './draw-random.js';

// the room the diagram may take (the example's states from (80, 120) to (780, 360)), on the grid's 20
const AREA = { x0: 60, y0: 60, x1: 900, y1: 460 };
const CONDS = ['req', '!req', 'done', '!done', 'night', '!night && done', 'req && done', 'done || night'];
const NAMES = ['IDLE', 'WAIT', 'GO', 'HOLD', 'BUSY', 'READY', 'FLASH', 'PAUSE'];

/** A diagram's model: its states (names, places, outputs), its transitions (ends, conditions), its initial state. */
export function fsmModel(d) {
  return {
    states: d.states.map((s) => ({ id: s.id, name: s.name, x: s.x, y: s.y, outputs: { ...s.outputs } })),
    transitions: d.transitions.map((t) => ({ id: t.id, from: t.from, to: t.to, cond: t.cond ?? '' })),
    initial: d.initial,
  };
}

const byId = (m, id) => m.states.find((s) => s.id === id);
/** Whether a state's circle at p would be clear of every state's (but `self`'s) and of every transition (but
 *  `self`'s, which follow it): what a person sees as free room. */
function free(m, p, self = null) {
  if (p.x < AREA.x0 || p.x > AREA.x1 || p.y < AREA.y0 || p.y > AREA.y1) return false;
  if (m.states.some((s) => s.id !== self && Math.hypot(s.x - p.x, s.y - p.y) < 2 * STATE_R + 50)) return false;
  return !m.transitions.some((t) => {
    if (t.from === self || t.to === self) return false;
    const a = byId(m, t.from), b = byId(m, t.to);
    return a && b && segDist(p, a, b) < STATE_R + 50;
  });
}
const grid = (rng, lo, hi) => rng.int(Math.ceil(lo / 20), Math.floor(hi / 20)) * 20;

const SPECS = [
  {
    name: 'addState', weight: 2,
    gen(m, rng) {
      if (m.states.length >= 10) return null;
      const p = { x: grid(rng, AREA.x0, AREA.x1), y: grid(rng, AREA.y0, AREA.y1) };
      return free(m, p) ? p : null;
    },
    // (a new state: named S0, S1… the first no state has, no outputs)
    apply: (m, { x, y }, c) => { m.states.push({ id: c.id('s'), name: freshName('s', m.states.map((s) => s.name)), x, y, outputs: {} }); return m; },
    act: (a, { x, y }) => a.addState(x, y),
  },
  {
    name: 'moveState', weight: 3,
    gen(m, rng) {
      const s = rng.pick(m.states);
      const dx = rng.int(-4, 4) * 20, dy = rng.int(-4, 4) * 20;
      return s && (dx || dy) && free(m, { x: s.x + dx, y: s.y + dy }, s.id) ? { id: s.id, dx, dy } : null;
    },
    apply: (m, { id, dx, dy }) => { const s = byId(m, id); s.x += dx; s.y += dy; return m; },
    act: (a, { id, dx, dy }) => a.moveState(id, dx, dy),
  },
  {
    // from a state's rim to another state with no transition from the first yet; its condition typed in place at once
    name: 'drawTransition', weight: 3, then: 'typeInPlace',
    gen(m, rng) {
      const pairs = m.states.flatMap((a) => m.states.filter((b) => b !== a && !m.transitions.some((t) => t.from === a.id && t.to === b.id)).map((b) => [a, b]));
      // (the arc's way clear: no other state's circle on the line between the two)
      const clear = pairs.filter(([a, b]) => !m.states.some((s) => s !== a && s !== b && segDist(s, a, b) < STATE_R + 30));
      const p = rng.pick(clear);
      return p ? { from: p[0].id, to: p[1].id, cond: rng.pick(CONDS) } : null;
    },
    apply: (m, { from, to }, c) => { m.transitions.push({ id: c.id('t'), from, to, cond: '' }); return m; },
    act: (a, { from, to }) => a.drawTransition(from, to),
  },
  {
    name: 'typeInPlace', weight: 0, gen: () => null,
    apply: (m, { cond }) => { m.transitions.at(-1).cond = cond; return m; },
    act: (a, { cond }) => a.typeInPlace(cond),
  },
  {
    name: 'renameState', weight: 2, key: ({ id }) => `sname:${id}`,
    gen(m, rng) {
      const s = rng.pick(m.states), name = rng.pick(NAMES);
      return s && !m.states.some((x) => x.name.toLowerCase() === name.toLowerCase()) ? { id: s.id, name } : null;
    },
    apply: (m, { id, name }) => { byId(m, id).name = name; return m; },
    act: (a, { id, name }) => a.renameState(id, name),
  },
  {
    // the output phase (3 bits): a value from 0 to 7, another than the state's
    name: 'stateOutput', weight: 2, key: ({ id }) => `souts:${id}`,
    gen(m, rng) {
      const s = rng.pick(m.states), value = String(rng.int(0, 7));
      return s && s.outputs.phase !== value ? { id: s.id, out: 'phase', value } : null;
    },
    apply: (m, { id, out, value }) => { byId(m, id).outputs[out] = value; return m; },
    act: (a, { id, out, value }) => a.stateOutput(id, out, value),
  },
  {
    // a value too wide for phase's 3 bits: refused, nothing changes
    name: 'wrongOutput', weight: 0.5, changes: false,
    gen(m, rng) { const s = rng.pick(m.states); return s ? { id: s.id, out: 'phase', value: rng.pick(['9', '12', '8']) } : null; },
    apply: (m) => m,
    act: (a, { id, out, value }) => a.stateOutput(id, out, value),
  },
  {
    name: 'condition', weight: 2, key: ({ id }) => `cond:${id}`,
    gen(m, rng) {
      const t = rng.pick(m.transitions), cond = rng.pick(CONDS);
      return t && t.cond !== cond ? { id: t.id, cond } : null;
    },
    apply: (m, { id, cond }) => { m.transitions.find((t) => t.id === id).cond = cond; return m; },
    act: (a, { id, cond }) => a.condition(id, cond),
  },
  {
    // a state but the initial one (its transitions in and out go with it)
    name: 'deleteState', weight: 1,
    gen(m, rng) { const s = rng.pick(m.states.filter((x) => x.id !== m.initial)); return s && m.states.length > 3 ? { id: s.id } : null; },
    apply: (m, { id }) => { m.states = m.states.filter((s) => s.id !== id); m.transitions = m.transitions.filter((t) => t.from !== id && t.to !== id); return m; },
    act: (a, { id }) => a.deleteState(id),
  },
  {
    name: 'deleteTrans', weight: 1,
    gen(m, rng) { const t = rng.pick(m.transitions); return t ? { id: t.id } : null; },
    apply: (m, { id }) => { m.transitions = m.transitions.filter((t) => t.id !== id); return m; },
    act: (a, { id }) => a.deleteTrans(id),
  },
];

export const FSM_VOCAB = vocabulary(fsmModel, SPECS);

/** The errors a random session may make, each a person's step: a transition drawn has no condition until it is typed
 *  (Undo of the typing leaves it so), and a second one drawn from that state then makes two "otherwise" transitions. */
export const fsmTolerate = (errs) => errs.every((e) => /^error: State \w+ has \d+ otherwise transitions/.test(e));

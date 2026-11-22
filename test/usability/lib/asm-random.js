// Usability tests (#5206, phase 3): the ASM chart's vocabulary of random actions (lib/draw-random.js), on the lock
// example's timer (examples/lock, src/timer.asm.json): a state box added where nothing is; a state, a decision or a
// conditional output added on a box's free exit (where the editor puts it nothing is); an exit dragged to a state box
// (one already drawn moved there); a box dragged or nudged with the arrow keys to where nothing is; a box's text typed in
// Properties (a state's name, its Moore outputs; a decision's condition; a conditional output's Mealy outputs); a box
// (not the initial state) or an arrow deleted; Undo, Redo. An exit goes to a state box only (one to a decision or an
// output box of another state's block may make a loop through them, a person's mistake the chart's Validate says): the
// errors a random session may make are an exit missing (asmTolerate).
import { vocabulary, freshName } from './draw-random.js';

const AREA = { x0: 80, y0: 60, x1: 900, y1: 1100 };
const CONDS = ['start', 'tick', '!start', 'cnt == secs - 1', 'cnt >= secs', 'tick && !start'];
const MOORE = [['left = secs - cnt'], ['done = 0'], ['left = 0'], ['left = secs - cnt', 'done = 0']];
const MEALY = [['done = 1'], ['cnt = cnt + 1'], ['cnt = 0'], ['cnt = cnt + 1', 'left = 0']];
const NAMES = ['WAIT', 'RUN', 'HOLD', 'PAUSE', 'READY', 'ARMED'];
// (a new box's defaults: a decision tests the first input, a conditional output sets the first output, the timer's)
const NEW = { State: 'state', Decision: 'decision', 'Cond. output': 'output' };

/** A chart's model: its boxes (kind, place, texts), its arrows (exits), its initial state. */
export function asmModel(d) {
  const node = (n) => ({
    id: n.id, type: n.type, x: n.x, y: n.y,
    ...(n.type === 'state' ? { name: n.name } : {}), ...(n.type === 'decision' ? { cond: n.cond } : {}),
    ...(n.type === 'state' || n.type === 'output' ? { actions: [...(n.actions || [])] } : {}),
  });
  return { nodes: d.nodes.map(node), edges: d.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, port: e.port })), initial: d.initial };
}

const nodeOf = (m, id) => m.nodes.find((n) => n.id === id);
const portsOf = (n) => (n.type === 'decision' ? ['true', 'false'] : ['next']);
const freePort = (m, n) => portsOf(n).find((p) => !m.edges.some((e) => e.from === n.id && e.port === p));
/** A box's size, about (the editor's measures its text: these are its bounds for the chart's short texts). */
function size(n) {
  if (n.type === 'decision') return { w: 200, h: 60 };
  const lines = n.type === 'state' ? 1 + (n.actions?.length || 0) : Math.max(1, n.actions?.length || 0);
  return { w: 200, h: n.type === 'state' ? Math.max(60, 20 * Math.ceil((lines * 17 + 26) / 20)) : Math.max(40, 20 * Math.ceil((lines * 17 + 16) / 20)) };
}
/** Whether a box `n` at (x, y) would be clear of every other box (40 between them). */
function free(m, n, x, y, self = null) {
  if (x < AREA.x0 || x > AREA.x1 || y < AREA.y0 || y > AREA.y1) return false;
  const a = size(n);
  return !m.nodes.some((o) => {
    if (o.id === self) return false;
    const b = size(o);
    return Math.abs(o.x - x) < (a.w + b.w) / 2 + 40 && Math.abs(o.y - y) < (a.h + b.h) / 2 + 40;
  });
}
const snap = (v) => Math.round(v / 20) * 20;
/** Where the editor puts a box added on `parent`'s exit `port` (its own rule, with the sizes about). */
function under(parent, port, n) {
  const pb = size(parent), s = size(n);
  if (port === 'false') return { x: snap(parent.x + pb.w / 2 + s.w / 2 + 60), y: snap(parent.y + pb.h / 2 + 40 + s.h / 2) };
  return { x: parent.x, y: snap(parent.y + pb.h / 2 + 50 + s.h / 2 + (n.type === 'state' ? 20 : 0)) };
}
const defaults = (type, m) => (type === 'state' ? { name: freshName('s', m.nodes.filter((n) => n.type === 'state').map((n) => n.name)), actions: [] }
  : type === 'decision' ? { cond: 'start' } : { actions: ['done = 1'] });

const SPECS = [
  {
    name: 'addState', weight: 1,
    gen(m, rng) {
      const x = rng.int(AREA.x0 / 20, AREA.x1 / 20) * 20, y = rng.int(AREA.y0 / 20, AREA.y1 / 20) * 20;
      return m.nodes.length < 16 && free(m, { type: 'state' }, x, y) ? { x, y } : null;
    },
    apply: (m, { x, y }, c) => { m.nodes.push({ id: c.id('s'), type: 'state', x, y, ...defaults('state', m) }); return m; },
    act: (a, { x, y }) => a.addAt('State', x, y),
  },
  {
    // a box added on a box's free exit: where the editor puts it (under the exit; a decision's 0 exit, to its right),
    // nothing is
    name: 'addOn', weight: 3,
    gen(m, rng) {
      const p = rng.pick(m.nodes.filter((n) => freePort(m, n)));
      const tool = rng.pick(Object.keys(NEW));
      if (!p || m.nodes.length >= 16) return null;
      const n = { type: NEW[tool], ...defaults(NEW[tool], m) }, at = under(p, freePort(m, p), n);
      // (more room about it: its size is the editor's)
      return free(m, { ...n, actions: [...(n.actions || []), '', ''] }, at.x, at.y) ? { tool, on: p.id } : null;
    },
    apply(m, { tool, on }, c) {
      const p = nodeOf(m, on), port = freePort(m, p), n = { type: NEW[tool], ...defaults(NEW[tool], m) }, at = under(p, port, n);
      const id = c.id({ state: 's', decision: 'd', output: 'o' }[n.type]);
      const x = c.any(at.x), y = c.any(at.y);
      m.nodes.push(Object.fromEntries(Object.entries({ id, type: n.type, x, y, name: n.name, cond: n.cond, actions: n.actions }).filter(([, v]) => v !== undefined)));
      m.edges.push({ id: c.id('e'), from: on, to: id, port });
      return m;
    },
    act: (a, { tool, on }) => a.addOn(tool, on),
  },
  {
    // an exit (free, or drawn: moved) dragged to a state box, another than the one it goes to
    name: 'connect', weight: 3,
    gen(m, rng) {
      const from = rng.pick(m.nodes);
      if (!from) return null;
      const port = rng.pick(portsOf(from));
      const cur = m.edges.find((e) => e.from === from.id && e.port === port);
      const to = rng.pick(m.nodes.filter((n) => n.type === 'state' && n.id !== from.id && n.id !== cur?.to));
      return to ? { from: from.id, port, to: to.id } : null;
    },
    apply(m, { from, port, to }, c) {
      m.edges = m.edges.filter((e) => !(e.from === from && e.port === port));
      m.edges.push({ id: c.id('e'), from, to, port });
      return m;
    },
    act: (a, { from, port, to }) => a.connect(from, port, to),
  },
  {
    name: 'moveBox', weight: 2,
    // (to a point of the grid, where it is dropped: a box off it, the timer's o3, moved by what takes it there)
    gen(m, rng) {
      const n = rng.pick(m.nodes);
      if (!n) return null;
      const dx = snap(n.x) + rng.int(-4, 4) * 20 - n.x, dy = snap(n.y) + rng.int(-4, 4) * 20 - n.y;
      return (dx || dy) && free(m, n, n.x + dx, n.y + dy, n.id) ? { id: n.id, dx, dy } : null;
    },
    apply: (m, { id, dx, dy }) => { const n = nodeOf(m, id); n.x += dx; n.y += dy; return m; },
    act: (a, { id, dx, dy }) => a.moveBox(id, dx, dy),
  },
  {
    // a grid step each press (the box where it was, on the grid or off it, moved by them)
    name: 'nudge', weight: 1, key: ({ id }) => `nudge:${id}`,
    gen(m, rng) {
      const n = rng.pick(m.nodes), key = rng.pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']), times = rng.int(1, 2);
      const [dx, dy] = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[key];
      return n && free(m, n, n.x + dx * times, n.y + dy * times, n.id) ? { id: n.id, key, times } : null;
    },
    apply(m, { id, key, times }) {
      const n = nodeOf(m, id), [dx, dy] = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[key];
      n.x += dx * times; n.y += dy * times;
      return m;
    },
    act: (a, { id, key, times }) => a.nudge(id, key, times),
  },
  {
    // a box's text in Properties: a state's name (one no state has) or Moore outputs, a decision's condition, a
    // conditional output's Mealy outputs
    name: 'setField', weight: 3, key: ({ id, field }) => `${field}:${id}`,
    gen(m, rng) {
      const n = rng.pick(m.nodes);
      if (!n) return null;
      if (n.type === 'decision') { const v = rng.pick(CONDS); return v !== n.cond ? { id: n.id, field: 'cond', value: v } : null; }
      if (n.type === 'output' || rng.next() < 0.5) {
        const v = rng.pick(n.type === 'state' ? MOORE : MEALY);
        return v.join('\n') !== n.actions.join('\n') ? { id: n.id, field: 'act', value: v.join('\n') } : null;
      }
      const v = rng.pick(NAMES);
      return m.nodes.some((x) => x.type === 'state' && x.name.toLowerCase() === v.toLowerCase()) ? null : { id: n.id, field: 'name', value: v };
    },
    apply(m, { id, field, value }) {
      const n = nodeOf(m, id);
      if (field === 'cond') n.cond = value; else if (field === 'name') n.name = value; else n.actions = value.split('\n');
      return m;
    },
    act(a, { id, field, value }, s) {
      const type = nodeOf(s.doc, id).type;
      const label = field === 'cond' ? 'Condition' : field === 'name' ? 'Name' : type === 'state' ? 'Moore outputs (one per line)' : 'Mealy outputs (one per line)';
      return a.setField(id, label, value);
    },
  },
  {
    // a box but the initial state: its arrows in and out go with it
    name: 'deleteBox', weight: 1,
    gen(m, rng) { const n = rng.pick(m.nodes.filter((x) => x.id !== m.initial)); return n && m.nodes.length > 4 ? { id: n.id } : null; },
    apply: (m, { id }) => { m.nodes = m.nodes.filter((n) => n.id !== id); m.edges = m.edges.filter((e) => e.from !== id && e.to !== id); return m; },
    act: (a, { id }) => a.deleteBox(id),
  },
  {
    name: 'deleteArrow', weight: 1,
    gen(m, rng) { const e = rng.pick(m.edges); return e ? { id: e.id } : null; },
    apply: (m, { id }) => { m.edges = m.edges.filter((e) => e.id !== id); return m; },
    act: (a, { id }) => a.deleteArrow(id),
  },
];

export const ASM_VOCAB = vocabulary(asmModel, SPECS);

/** The errors a random session may make, each a person's step (a box added, an exit or a box deleted): an exit not
 *  drawn yet. */
export const asmTolerate = (errs) => errs.every((e) => /^error: .+ has no (exit|exit \(next state path\)|exits \(needs a 1 and a 0 branch\)|1 \(true\) branch|0 \(false\) branch)$/.test(e));

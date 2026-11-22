// Usability tests (#5206, phase 3): what the random sequences of the drawings (a state diagram, an ASM chart, a Petri
// net, a truth table: lib/fsm-random.js, asm-random.js, pn-random.js, tt-random.js) share. Each action of a vocabulary
// is written as a spec: `gen(doc, rng)` its arguments on the drawing as it is (null when a person could not do it now),
// `apply(model, args)` what it does to the drawing's model (the parts of the document a person sees: names, places,
// links, texts; `ctx.id(prefix)` a new object's id, `ctx.any(estimate)` what the editor chooses for it, a box's place
// under its parent), `act(a, args)` the person's clicks and keys (the editor's actions, lib/*-actions.js). After the
// step the editor's document, as a model, must be the one `apply` made, those two a wildcard (ANY); on a model alone
// (the unit tests, modelRun) a fresh id and the estimate.
import assert from 'node:assert/strict';

/** What a model leaves to the editor: any value matches it. */
export const ANY = '✱any';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Whether `got` is `want`, ANY matching anything (objects by their keys, arrays in order): the first difference
 *  ('states[2].name: S1, expected S0'), or null. */
export function modelDiff(want, got, at = '') {
  if (want === ANY) return null;
  if (Array.isArray(want) || Array.isArray(got)) {
    if (!Array.isArray(want) || !Array.isArray(got)) return `${at || 'the model'}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
    if (want.length !== got.length) return `${at || 'the model'}: ${got.length} items, expected ${want.length} (${JSON.stringify(got.map((x) => x?.name ?? x?.id ?? x))})`;
    for (let i = 0; i < want.length; i++) { const d = modelDiff(want[i], got[i], `${at}[${i}]`); if (d) return d; }
    return null;
  }
  if (want && typeof want === 'object' && got && typeof got === 'object') {
    for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
      const d = modelDiff(want[k], got[k], at ? `${at}.${k}` : k);
      if (d) return d;
    }
    return null;
  }
  return want === got ? null : `${at || 'the model'}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
}

const WILD = { id: () => ANY, any: () => ANY };

/** A deep copy of a model. */
export const copy = (m) => JSON.parse(JSON.stringify(m));

/** The lowest `${prefix}${i}` (from `from`) no name of `names` is, letter case apart: the editors' new names. */
export function freshName(prefix, names, from = 0, upper = prefix.toUpperCase()) {
  const used = new Set(names.map((x) => String(x).toLowerCase()));
  let i = from;
  while (used.has(`${prefix.toLowerCase()}${i}`)) i++;
  return `${upper}${i}`;
}

/** A point's distance to the segment from `a` to `b`. */
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/**
 * A vocabulary for lib/random.js from specs ({ name, weight, gen, apply, act, changes, key, then }): each a step of the
 * session whose `expect` is its model's, `project(doc)` the model of a document. `key(args)`: the field it types in (two
 * edits of one field soon after each other are one Undo step, #5167: as a person, a moment between them); `then`: a step
 * done at once after it (a transition's condition typed in place when it is drawn), recorded as a step of its own that
 * a replay does not do again. Undo and Redo are added.
 */
export function vocabulary(project, specs) {
  const byName = Object.fromEntries(specs.map((x) => [x.name, x]));
  const one = async (s, spec, args) => {
    const k = spec.key?.(args) ?? null;
    if (k && s.lastKey?.key === k) await sleep(Math.max(0, 1600 - (Date.now() - s.lastKey.t)));
    // (and two clicks of a person's on one object, one step after the other, are two clicks: not a double click, the
    // editors' 500 ms, a step's own typing between them done in no time)
    const target = args.id ?? args.from ?? null;
    if (target != null && s.lastTarget?.id === target) await sleep(Math.max(0, 600 - (Date.now() - s.lastTarget.t)));
    await s.step(spec.name, args, () => spec.act(s.a, args, s), {
      changes: spec.changes ?? true,
      expect: (d, b) => { const diff = modelDiff(spec.apply(project(b), args, WILD), project(d)); assert.ok(!diff, `the model: ${diff}`); },
    });
    s.lastKey = k ? { key: k, t: Date.now() } : null;
    s.lastTarget = { id: target, t: Date.now() };
  };
  const list = specs.map((spec) => ({
    name: spec.name, weight: spec.weight ?? 1, gen: (d, rng) => spec.gen(project(d), rng), apply: spec.apply, then: spec.then,
    async run(s, args) {
      if (args?.follows) return;   // (done with the step before it)
      await one(s, spec, args);
      if (spec.then) { const t = byName[spec.then]; await one(s, t, { ...args, follows: true }); }
    },
  }));
  return [...list,
    { name: 'undo', weight: 2, gen: (d, rng) => (rng.next() < 0.9 ? {} : null), run: async (s) => { s.lastKey = null; await s.undo(); } },
    { name: 'redo', weight: 1, gen: () => ({}), run: async (s) => { s.lastKey = null; await s.redo(); } }];
}

/**
 * A vocabulary's sequence on a model alone, as lib/random.js draws it (no interface): `n` steps from `seed`, each
 * drawn on the model as it is and applied to it (and its follower, `then`); Undo and Redo on the models' history. The
 * models after each step, and the steps: what the unit tests check (each a person's step, the model's invariants).
 */
export function modelRun(vocab, doc, { seed, n, prng }) {
  const rng = prng(seed);
  let k = 0;
  const ctx = { id: (p) => `${p}new${++k}`, any: (v) => v };
  const past = [doc], future = [], steps = [];
  for (let i = 0; i < n; i++) {
    const cur = past.at(-1);
    const options = vocab.map((v) => ({ v, args: v.gen(cur, rng) })).filter((x) => x.args);
    if (!options.length) break;
    const { v, args } = rng.weighted(options.map((x) => ({ ...x, weight: x.v.weight })));
    steps.push({ name: v.name, args });
    if (v.name === 'undo') { if (past.length > 1) future.push(past.pop()); continue; }
    if (v.name === 'redo') { if (future.length) past.push(future.pop()); continue; }
    let next = v.apply(copy(cur), args, ctx);
    const then = v.then && vocab.find((x) => x.name === v.then);
    if (then) { past.push(next); next = then.apply(copy(next), { ...args, follows: true }, ctx); }
    if (JSON.stringify(next) !== JSON.stringify(cur)) { past.push(next); future.length = 0; }
  }
  return { steps, models: past };
}

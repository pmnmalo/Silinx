// Usability tests (#5148): random sequences of actions with a fixed seed. A sequence is drawn from an editor's
// vocabulary (each action: its weight, `gen(doc, rng)` its arguments from the document as it is, null when it cannot be
// done now; `run(session, args)` does it as a step); it is recorded as [{ name, args }], so it runs again as it ran
// (replay). A sequence that fails is shrunk: its steps dropped one at a time while it still fails, in a bounded time,
// and reported shrunk: the steps that reproduce it.

/** mulberry32: a small generator of numbers in [0, 1) from a 32-bit seed, the same on every machine. */
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted(items) {
      const total = items.reduce((s, x) => s + x.weight, 0);
      let r = next() * total;
      for (const x of items) { if ((r -= x.weight) < 0) return x; }
      return items.at(-1);
    },
  };
}

/** The seeds of a run: SILINX_USABILITY_SEED's, else the fixed ones (each seed that once failed is added to them)
 *  and the week's (from the date, so each week tries a new one; said in the test's name). */
export function seeds(fixed, now = Date.now()) {
  if (process.env.SILINX_USABILITY_SEED) return [+process.env.SILINX_USABILITY_SEED];
  return [...fixed, Math.floor(now / (7 * 864e5))];
}

/** The number of steps of a sequence: SILINX_USABILITY_STEPS, else `n`. */
export const stepsOf = (n) => +process.env.SILINX_USABILITY_STEPS || n;

/** A sequence of `n` actions drawn from `vocab` and done in `session` (its document read before each); the steps
 *  done, [{ name, args }]. */
export async function runRandom(session, vocab, { seed, n }) {
  const rng = prng(seed);
  const done = [];
  for (let i = 0; i < n; i++) {
    const options = vocab.map((v) => ({ v, args: v.gen(session.doc, rng) })).filter((x) => x.args);
    if (!options.length) break;
    const { v, args } = rng.weighted(options.map((x) => ({ ...x, weight: x.v.weight })));
    done.push({ name: v.name, args });
    await v.run(session, args);
  }
  return done;
}

/** The recorded steps done again in `session`. */
export async function replay(session, vocab, steps) {
  for (const st of steps) {
    const v = vocab.find((x) => x.name === st.name);
    if (!v) throw new Error(`no action ${st.name}`);
    await v.run(session, st.args);
  }
}

/**
 * The shortest list of `steps` that still fails, found in at most `ms`: `attempt(list)` runs a list in a fresh session
 * and resolves with true when it fails as a usability check (a step that cannot be done, e.g. on a symbol an earlier
 * step dropped made, is not a failure).
 */
export async function shrink(steps, attempt, { ms = 5 * 60e3 } = {}) {
  const t0 = Date.now();
  let cur = steps;
  for (let i = cur.length - 1; i >= 0 && Date.now() - t0 < ms; i--) {
    const without = [...cur.slice(0, i), ...cur.slice(i + 1)];
    if (without.length && await attempt(without)) cur = without;
  }
  return cur;
}

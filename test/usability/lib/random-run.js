// Usability tests (#5148): a test file's random sequences (lib/random.js), one UI test per seed: the sequence run in a
// session, then Undo back to the start and Redo to the end; a failure shrunk to the steps that reproduce it (each try in
// a fresh session), those run once more and reported (lib/session.js), the test failed with the first failure.
import { uiTest } from '../../ui/harness.js';
import { seeds, stepsOf, runRandom, replay, shrink } from './random.js';

/**
 * The UI tests of `name` (the title's start), one per seed of `fixed` and the week's: `session(page, title, seed,
 * quiet)` opens a fresh session on its drawing; `vocab` the actions; `n` the steps (SILINX_USABILITY_STEPS).
 */
export function randomTests(envRef, { name, fixed, vocab, session, n = 40 }) {
  for (const seed of seeds(fixed)) {
    uiTest(`usability: ${name}: a random sequence, seed ${seed}`, envRef, async (page) => {
      const title = `${name} random, seed ${seed}`;
      const s = await session(page, title, seed, true);
      let failure = null;
      try {
        const done = await runRandom(s, vocab, { seed, n: stepsOf(n) });
        const count = {};
        for (const st of done) count[st.name] = (count[st.name] || 0) + 1;
        console.log(`seed ${seed}: ${done.length} steps: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        await s.undoRedo();
      } catch (e) {
        if (!e.usability) throw e;
        failure = e;
      }
      if (!failure) return;
      // shrunk: the steps (undo and redo among them) dropped one at a time while the rest still fails the same way
      const attempt = async (steps) => {
        const t = await session(page, title, seed, true);
        try { await replay(t, vocab, steps); await t.undoRedo(); return false; } catch (e) { return e.signature === failure.signature; }
      };
      const steps = await shrink(s.steps, attempt);
      console.error(`USABILITY: seed ${seed}: ${s.steps.length} steps shrunk to ${steps.length}; first failure: ${failure.message}`);
      // the shrunk steps run once more, reported (seed, steps, what broke, screenshots)
      const r = await session(page, title, seed);
      await replay(r, vocab, steps);
      await r.undoRedo();
      throw failure;   // (it failed then, but not when the shrunk steps ran again: the first failure said)
    }, { timeout: 12 * 60e3 });
  }
}

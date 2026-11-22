// Usability (#5148): random sequences of a person's actions in the schematic editor, on the gates example (examples/
// gates), each from a fixed seed (lib/random.js; the vocabulary lib/sch-random.js): inverters moved, wires' segments
// dragged, inverters placed, wired, widened, deleted, Undo and Redo, in any order. After every step the drawing's
// invariants, the wires still attached, the nets, the HDL in VHDL and Verilog; at the end Undo back to the start and
// Redo to the end. A sequence that fails is shrunk to the steps that reproduce it, and reported with its seed.
// SILINX_USABILITY_SEED runs one seed, SILINX_USABILITY_STEPS sets the steps (40).
import { before, after } from 'node:test';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { SchSession } from './lib/session.js';
import { seeds, stepsOf, runRandom, replay, shrink } from './lib/random.js';
import { SCH_VOCAB } from './lib/sch-random.js';

const FILE = 'test/usability/schematic-random.test.js';
// (a seed that once failed is added here, its issue said)
const SEEDS = [1, 2, 3];
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

const widthOnly = (errs) => errs.every((m) => /width mismatch/.test(m));
async function session(page, title, seed, quiet = false) {
  const name = `UsabRand${++n}`;
  await makeProject(env, { name, template: 'gates' });
  await page.openProject(name);
  const s = new SchSession(page, env, { file: FILE, title, seed, quiet, tolerate: widthOnly });
  await s.open('src/gates.sch.json');
  return s;
}

for (const seed of seeds(SEEDS)) {
  uiTest(`usability: schematic: a random sequence, seed ${seed}`, E, async (page) => {
    const title = `schematic random, seed ${seed}`;
    const s = await session(page, title, seed, true);
    let failure = null;
    try {
      const done = await runRandom(s, SCH_VOCAB, { seed, n: stepsOf(40) });
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
      try { await replay(t, SCH_VOCAB, steps); await t.undoRedo(); return false; } catch (e) { return e.signature === failure.signature; }
    };
    const steps = await shrink(s.steps, attempt);
    console.error(`USABILITY: seed ${seed}: ${s.steps.length} steps shrunk to ${steps.length}; first failure: ${failure.message}`);
    // the shrunk steps run once more, reported (seed, steps, what broke, screenshots)
    const r = await session(page, title, seed);
    await replay(r, SCH_VOCAB, steps);
    await r.undoRedo();
    throw failure;   // (it failed then, but not when the shrunk steps ran again: the first failure said)
  }, { timeout: 12 * 60e3 });
}

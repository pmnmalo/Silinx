// Usability (#5206, phase 3): random sequences of a person's actions in the truth table editor, on the traffic
// example's lamps (examples/traffic, src/lamps.bool.json), each from a fixed seed (lib/random.js; the vocabulary
// lib/tt-random.js): inputs and outputs added, renamed and removed in their boxes, cells clicked in the table and on the
// Karnaugh map, columns typed as expressions, an output's NAND or NOR form ticked, Undo and Redo, in any order. After
// every step the HDL in VHDL and Verilog compiled and elaborated (the table has no Check of its own), the table's model
// (its columns computed apart from the editor's) the one the steps made; at the end Undo back to the start and Redo to
// the end; a failure shrunk and reported with its seed (lib/random-run.js). SILINX_USABILITY_SEED runs one seed,
// SILINX_USABILITY_STEPS sets the steps (16).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { ttActions } from './lib/tt-actions.js';
import { randomTests } from './lib/random-run.js';
import { TT_VOCAB, ttModel } from './lib/tt-random.js';
import { modelDiff } from './lib/draw-random.js';

const FILE = 'test/usability/truthtable-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
let n = 0;
const KIT = drawKit('tt', ttActions);

async function session(page, title, seed, quiet = false) {
  const name = `UsabTtRand${++n}`;
  await makeProject(env, { name, template: 'traffic' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, seed, quiet, kit: KIT });
  await s.open('src/lamps.bool.json');
  return s;
}

randomTests(() => env, { name: 'truth table', fixed: [1, 2, 3], vocab: TT_VOCAB, session, n: 16 });

/** A step of the vocabulary done by its own clicks (`run`), its model checked: the table the step makes. */
const modelStep = (s, name, args, run) => s.step(name, args, run, {
  expect: (d, b) => assert.equal(modelDiff(TT_VOCAB.find((v) => v.name === name).apply(ttModel(b), args), ttModel(d)), null),
});

// (#5268, seed 2's sequence, shrunk by hand to its three steps: the Outputs box not left before Edit ▸ Undo, which shows
// the table's outputs in it, so that leaving it applies nothing again)
uiTest('usability: truth table: an output removed in its box, Edit ▸ Undo, then an input removed: the output stays (#5268)', () => env, async (page) => {
  const s = await session(page, 'truth table: Undo with the Outputs box focused', 2);
  await modelStep(s, 'removeOutput', { name: 'walk_g' }, () => s.a.outputs('car_r, car_y, car_g, walk_r'));
  await s.undo();
  await modelStep(s, 'removeInput', { name: 'phase2' }, () => s.a.inputs('phase1, phase0, blink'));
  await s.undoRedo();
});

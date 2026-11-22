// Usability (#5148): random sequences of a person's actions in the schematic editor, on the gates example (examples/
// gates), each from a fixed seed (lib/random.js; the vocabulary lib/sch-random.js): inverters moved, wires' segments
// dragged, inverters placed, wired, widened, deleted, nets named, wires deleted, Undo and Redo, in any order. After every
// step the drawing's invariants, the wires still attached, the nets, the HDL in VHDL and Verilog; at the end Undo back
// to the start and Redo to the end. A sequence that fails is shrunk to the steps that reproduce it, and reported with its
// seed (lib/random-run.js). SILINX_USABILITY_SEED runs one seed, SILINX_USABILITY_STEPS sets the steps (40).
import { before, after } from 'node:test';
import { setupUi, makeProject } from '../ui/harness.js';
import { SchSession } from './lib/session.js';
import { randomTests } from './lib/random-run.js';
import { SCH_VOCAB } from './lib/sch-random.js';

const FILE = 'test/usability/schematic-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
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

// (a seed that once failed is added to the fixed ones, its issue said)
randomTests(() => env, { name: 'schematic', fixed: [1, 2, 3], vocab: SCH_VOCAB, session });

// Usability (#5206, phase 3): random sequences of a person's actions in the state diagram editor, on the traffic
// example's controller (examples/traffic, src/traffic.fsm.json), each from a fixed seed (lib/random.js; the vocabulary
// lib/fsm-random.js): states added where nothing is, moved, renamed, their output set (a value too wide refused),
// transitions drawn and their conditions typed in place or in Properties, a state or a transition deleted, Undo and
// Redo, in any order. After every step the diagram's Check (its errors but the ones a step may make, fsmTolerate), the
// HDL in VHDL and Verilog compiled and elaborated, the diagram's model the one the steps made; at the end Undo back to
// the start and Redo to the end; a failure shrunk and reported with its seed (lib/random-run.js).
// SILINX_USABILITY_SEED runs one seed, SILINX_USABILITY_STEPS sets the steps (16).
import { before, after } from 'node:test';
import { setupUi, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { fsmActions } from './lib/fsm-actions.js';
import { randomTests } from './lib/random-run.js';
import { FSM_VOCAB, fsmTolerate } from './lib/fsm-random.js';

const FILE = 'test/usability/fsm-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
let n = 0;
const KIT = drawKit('fsm', fsmActions);

async function session(page, title, seed, quiet = false) {
  const name = `UsabFsmRand${++n}`;
  await makeProject(env, { name, template: 'traffic' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, seed, quiet, tolerate: fsmTolerate, kit: KIT });
  await s.open('src/traffic.fsm.json');
  return s;
}

randomTests(() => env, { name: 'FSM', fixed: [1, 2, 3], vocab: FSM_VOCAB, session, n: 16 });

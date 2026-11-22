// Usability (#5206, phase 3): random sequences of a person's actions in the ASM chart editor, on the lock example's
// timer (examples/lock, src/timer.asm.json), each from a fixed seed (lib/random.js; the vocabulary lib/asm-random.js):
// state boxes added where nothing is, boxes added on free exits, exits dragged to state boxes, boxes dragged and nudged,
// their texts typed in Properties, boxes and arrows deleted, Undo and Redo, in any order. After every step the chart's
// Validate (its errors but an exit missing, asmTolerate), the HDL in VHDL and Verilog compiled and elaborated when it
// has none, the chart's model the one the steps made; at the end Undo back to the start and Redo to the end; a failure
// shrunk and reported with its seed (lib/random-run.js). SILINX_USABILITY_SEED runs one seed, SILINX_USABILITY_STEPS
// sets the steps (16).
import { before, after } from 'node:test';
import { setupUi, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { asmActions } from './lib/asm-actions.js';
import { randomTests } from './lib/random-run.js';
import { ASM_VOCAB, asmTolerate } from './lib/asm-random.js';

const FILE = 'test/usability/asm-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
let n = 0;
const KIT = drawKit('asm', asmActions);

async function session(page, title, seed, quiet = false) {
  const name = `UsabAsmRand${++n}`;
  await makeProject(env, { name, template: 'lock' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, seed, quiet, tolerate: asmTolerate, kit: KIT });
  await s.open('src/timer.asm.json');
  return s;
}

randomTests(() => env, { name: 'ASM', fixed: [1, 2, 3], vocab: ASM_VOCAB, session, n: 16 });

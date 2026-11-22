// Usability (#5148, part 3): random sequences of a person's actions on the breadboard, on the breadboard example
// (examples/breadboard), each from a fixed seed (lib/random.js; the vocabulary lib/circ-random.js): ICs placed in the
// free columns, powered, linked to the circuit's outputs, moved along the row, deleted, wires deleted, Undo and Redo, in
// any order. After every step the circuit's invariants (its check's errors but an IC not powered yet, the wires still
// attached, the new wires' loose ends), the HDL in VHDL and Verilog; at the end Undo back to the start and Redo to the
// end; a failure shrunk and reported with its seed (lib/random-run.js). SILINX_USABILITY_SEED runs one seed,
// SILINX_USABILITY_STEPS sets the steps (30).
import { before, after } from 'node:test';
import { setupUi, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { CIRC_KIT } from './lib/circ-actions.js';
import { randomTests } from './lib/random-run.js';
import { CIRC_VOCAB } from './lib/circ-random.js';

const FILE = 'test/usability/circuit-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
let n = 0;

const unpowered = (errs) => errs.every((m) => /is not powered/.test(m));
async function session(page, title, seed, quiet = false) {
  const name = `UsabCircRand${++n}`;
  await makeProject(env, { name, template: 'breadboard' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, seed, quiet, tolerate: unpowered, kit: CIRC_KIT });
  await s.open('src/breadboard.circ.json');
  return s;
}

randomTests(() => env, { name: 'circuit', fixed: [1, 2, 3], vocab: CIRC_VOCAB, session, n: 30 });

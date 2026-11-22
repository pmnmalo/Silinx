// Usability (#5206, phase 3): random sequences of a person's actions in the Petri net editor, on the lock example's net
// (examples/lock, src/alarm.pn.json), each from a fixed seed (lib/random.js; the vocabulary lib/pn-random.js): places
// and transitions added where nothing is, arcs drawn (inhibitor arcs too; one that cannot be, refused), nodes dragged,
// renamed, guards, tokens, capacities and weights set in Properties, nodes and arcs deleted, Undo and Redo, in any
// order. After every step the net's Check (no errors), the HDL in VHDL and Verilog compiled and elaborated, the net's
// model the one the steps made; at the end Undo back to the start and Redo to the end; a failure shrunk and reported
// with its seed (lib/random-run.js). SILINX_USABILITY_SEED runs one seed, SILINX_USABILITY_STEPS sets the steps (16).
import { before, after } from 'node:test';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { pnActions } from './lib/pn-actions.js';
import { randomTests } from './lib/random-run.js';
import { replay } from './lib/random.js';
import { PN_VOCAB } from './lib/pn-random.js';

const FILE = 'test/usability/petri-random.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
let n = 0;
const KIT = drawKit('pn', pnActions);

async function session(page, title, seed, quiet = false) {
  const name = `UsabPnRand${++n}`;
  await makeProject(env, { name, template: 'lock' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, seed, quiet, kit: KIT });
  await s.open('src/alarm.pn.json');
  return s;
}

randomTests(() => env, { name: 'Petri net', fixed: [1, 2, 3], vocab: PN_VOCAB, session, n: 16 });

// (#5266, found writing the vocabulary: an arc drawn back along another, then the first one's weight: the two are drawn
// apart, each selected by a click on it)
uiTest('usability: Petri net: an arc drawn back along another (fail1 to none): the first still selected, its weight set (#5266)', () => env, async (page) => {
  const s = await session(page, 'Petri net: an arc back along another', null);
  await replay(s, PN_VOCAB, [{ name: 'arc', args: { from: 't1', to: 'p1', inhibitor: false } }, { name: 'weight', args: { id: 'a1', weight: 2 } }]);
  await s.undoRedo();
});

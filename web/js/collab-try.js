// The Try it a shared project's owner has open, in the page (#4244; core/collab-try.js): the owner's page sends each
// open document's Try it, its editor's tryState() (a state diagram's, an ASM chart's, a Petri net's, a schematic's, a
// Boolean algebra's or a circuit's generated schematic's, a circuit's; null: closed), at its sharing's tick when it
// changed (a run's clock edges sent together); a follower's page, while it follows the owner, puts each one on its own
// document of it (opened by the owner's view: web/js/collab-activity.js) with its editor's setTryState(value, applied):
// its Try it opened or closed as the owner's, its state, its inputs and its steps the owner's (a schematic's and a
// circuit's replayed from where it was). A click, a key or an input of the follower's in a Try it is its own: browsing
// alone (collab-activity.js OWN).
import { S, app } from './app.js';
import { followedTry, tryActivity } from '/core/collab-try.js';

// (a schematic view's read-only editor too: an RTL schematic's, viewers.js)
const editorOf = d => d?.fsmEditor || d?.asmEditor || d?.petriEditor || d?.schEditor || d?.circuitEditor || d?.viewer || null;
const tryEditors = () => S.docs.map(d => [d, editorOf(d)]).filter(([, ed]) => ed?.tryState && ed.setTryState);

/** The owner's `try` value: its open documents' Try it. */
export const tryNow = () => tryActivity(tryEditors().map(([d, ed]) => [d.id, ed.tryState()]));

const told = new Set();
/** The owner's Try it put on a follower's page (`st`: collab-activity.js followState; `get`: the session's activity):
 *  what changed since the last time, per document. */
export async function followTry(st, get) {
  const raw = get('try');
  const t = followedTry(raw);
  if (!t) return;
  st.tries ||= new WeakMap();   // (by editor: a document opened again is a new one)
  for (const [d, ed] of tryEditors()) {
    const key = JSON.stringify(raw.docs?.[d.id] ?? null);
    const mine = st.tries.get(ed) || {};
    if (mine.key === key) continue;
    const o = t.docs[d.id] || null;
    if (!o && !mine.key) { mine.key = key; st.tries.set(ed, mine); continue; }   // (closed there, never opened here)
    try { mine.applied = (await ed.setTryState(o, o ? mine.applied ?? null : null)) ?? null; mine.key = key; }
    catch (e) {
      mine.key = key;
      const why = `${d.path || d.id}: ${e.message}`;
      if (!told.has(why)) { told.add(why); app.log(`WARNING: Follow a shared project: the owner's Try it of ${why}.`, 'warn'); }
    }
    st.tries.set(ed, mine);
  }
}

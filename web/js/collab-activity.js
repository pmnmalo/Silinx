// A shared project's owner's activity in the page (#4002, core/collab-activity.js): the owner's page sends where it is
// (`ui`: the open documents, the one in front, the split, the left pane's page, the Design view, the Tasks interface's
// task, as a design link's view, #2886) and its Design pane (`design`: the row selected, the rows expanded); a
// follower's page, while it follows the owner, puts them on the page: the owner's documents opened (a simulation run
// again, the page's own, from the same files), those the owner closes closed (of those it opened, not the follower's
// own), the same one in front, the same view, page and task, the same rows expanded and selected. What the follower
// does on its own there (a row selected or expanded, another page, view or task) is browsing alone (onOwn), as bringing
// another document to the front is (web/js/collab-follow.js). The processes the owner runs: collab-runs.js; its
// simulations: collab-sim.js (a click, a key or the wheel in the follower's SSim is its own too).
import { S, activateDoc, closeDoc, setView, showLeftPage } from './app.js';
import { renderHierarchy } from './design.js';
import { currentViewState, reopenDoc, viewKeyOf } from './view-state.js';
import { restoreSplit } from './split-view.js';
import { applyLayout, layoutNow } from './tasks.js';
import { encodeUi } from '/core/design-link.js';
import { designActivity, followedDesign, followedUi } from '/core/collab-channels.js';
import { followRuns, openReport, runsPublisher } from './collab-runs.js';
import { followSim, simNow } from './collab-sim.js';

/** The owner's page: its activity sent (each channel only when it changed: core/collab-client.js publish), by
 *  publish() in its sharing's tracking; stop() at its end. */
export function ownerActivity(session) {
  const runs = runsPublisher(session);
  return {
    publish() {
      if (!S.project) return;
      runs.publish();   // (its reports before its view: a report open there is known when the view comes)
      try {
        session.publish('ui', encodeUi(currentViewState(), layoutNow()));
        session.publish('design', designActivity(S.selKey, S.treeOpen));
        session.publish('sim', simNow());
      } catch { /* (too large: not sent, the followers keep the last one) */ }
    },
    stop: () => runs.stop(),
  };
}

/** A follower's state of the owner's activity: { applied: { ui, design } (what was last put on the page), opened (the
 *  documents it opened from the owner's) }; forget() makes the next follow put it all again. */
export function followState() {
  const st = { applied: {}, opened: new Set() };
  st.forget = () => { st.applied = {}; };
  return st;
}

/** The owner's activity put on the follower's page (`get`: the session's activity), what changed since the last time. */
export async function followActivity(st, get) {
  if (await followRuns(st, get)) st.applied.ui = null;   // (its reports changed: a report the owner has open may open now)
  const ui = get('ui'), uiKey = JSON.stringify(ui);
  if (ui !== null && st.applied.ui !== uiKey) {
    st.applied.ui = uiKey;
    const u = followedUi(ui);
    if (u) { await applyUi(st, u, get); st.applied.design = null; }   // (a view changed: its selection put again)
  }
  const design = get('design'), designKey = JSON.stringify(design);
  if (design !== null && st.applied.design !== designKey) {
    st.applied.design = designKey;
    const d = followedDesign(design);
    if (d) applyDesign(d);
  }
  await followSim(st, get);
}

async function applyUi(st, { view: v, layout }, get) {
  if (v.view && v.view !== S.view) setView(v.view);
  if (v.page && v.page !== S.leftPage) showLeftPage(v.page);
  const have = new Set(S.docs.map(viewKeyOf));
  for (const id of v.open) if (!have.has(id) && (await openReport(id, get) || await reopenDoc(id))) st.opened.add(id);
  for (const d of [...S.docs]) {
    const k = viewKeyOf(d);
    if (st.opened.has(k) && !v.open.includes(k)) { st.opened.delete(k); await closeDoc(d); }
  }
  const find = k => S.docs.find(d => viewKeyOf(d) === k);
  restoreSplit(v.split, find, v.open);
  const front = v.active && find(v.active);
  if (front && S.active !== front) activateDoc(front);
  if (layout) applyLayout(layout);
}

function applyDesign(d) {
  for (const [k, on] of d.open) S.treeOpen.set(k, on);
  if (!S.project) return;
  S.selKey = d.sel;
  renderHierarchy();
  const row = d.sel && document.querySelector(`#hier [data-key="${CSS.escape(d.sel)}"]`);
  if (row) row.dispatchEvent(new MouseEvent('click'));   // (its selection: its Processes; not the follower's own click)
}

// what a follower does there on its own: a click (a row, its twisty, a page, a view, a task) or the Design tree's keys
const OWN = '#hier .row, #left-tabs .tab, input[name=view], .task-btn, .isim';
const TREE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
/** Calls onOwn() at the follower's own action on what the owner's activity drives. */
export function watchOwnActions(onOwn) {
  document.addEventListener('click', e => { if (e.isTrusted && e.target.closest?.(OWN)) onOwn(); }, true);
  document.addEventListener('keydown', e => { if (e.isTrusted && ((TREE_KEYS.includes(e.key) && e.target.closest?.('#hier')) || e.target.closest?.('.isim'))) onOwn(); }, true);
  document.addEventListener('wheel', e => { if (e.isTrusted && e.target.closest?.('.isim')) onOwn(); }, { capture: true, passive: true });
}

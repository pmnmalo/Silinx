// The simulations a shared project's owner has open, in the page (#4002, part 3; core/collab-sim.js): the owner's page
// sends each SSim's time, drawn stimuli, forces and wave view; a follower's page, while it follows the owner, runs its
// own SSim of the same document (opened by the owner's view: web/js/collab-activity.js) to the same time, with the same
// forces (run again from 0 when they change, or when the owner's time went back: a restart), shows the same view, and
// runs the simulation again when the owner's drawn stimuli change.
import { S } from './app.js';
import { followedSim, simActivity, simDocActivity, stimKey } from '/core/collab-sim.js';

const ssims = () => S.docs.filter(d => /^isim:/.test(d.id) && d.view?.getState);

/** The owner's `sim` value: its open simulations. */
export const simNow = () => simActivity(ssims().map(d => [d.id, simDocActivity(d.view.getState(), d.view.now, stimKey(d.view.state?.stim?.m))]));

/** The owner's simulations put on a follower's page (`st`: collab-activity.js followState; `get`: the session's
 *  activity), at each tick: what its own simulations lack of the owner's (a run goes on: looked at again next time). */
export async function followSim(st, get) {
  const s = followedSim(get('sim'));
  if (!s) return;
  st.sims ||= new WeakMap();   // (by document: one run again is a new one)
  for (const d of ssims()) {
    const o = s.docs[d.id], api = d.view;
    if (!o || api.state?.running) continue;
    const mine = st.sims.get(d) || {};
    st.sims.set(d, mine);
    // (the owner's drawn stimuli changed: the simulation run again here, as the owner's own was)
    if (mine.stim !== undefined && mine.stim !== o.stim) { await rerun(d.id); continue; }
    mine.stim = o.stim;
    const forces = JSON.stringify(o.forces);
    if (forces !== mine.forces) {
      const first = mine.forces === undefined;
      mine.forces = forces;
      api.state.forces.length = 0;
      api.setState({ forces: o.forces });
      // (forces given at their start: the simulation run again from 0 with them)
      if (!first || o.forces.length) api.restart(true);
    }
    if (api.now > o.now) api.restart(true);   // (the owner restarted)
    // (its run moves its cursor to its end: the owner's view put once it has ended, the next time)
    if (api.now < o.now) { api.runFor(o.now - api.now); mine.view = null; continue; }
    const view = JSON.stringify(o.view);
    if (view !== mine.view) { mine.view = view; api.setState(o.view); }
  }
}

async function rerun(id) {
  const [, mod, model] = /^isim:([^@]+)(?:@(\w+))?$/.exec(id) || [];
  if (mod) await (await import('./viewers.js')).runSimulation(mod, model || undefined);
}

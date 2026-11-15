// A followed project once following ends (#4198, core/collab-keep.js): Stop Following, the owner's sharing stopped,
// the connection lost for good. The page leaves the project open, read only (collab-follow.js opens an editor's
// documents again, read only), and saved nowhere: the console's line offers Keep a Copy (its button; the presence's
// menu has it too), which saves it into this page's workspace (the backend api.js stood for before following,
// `real`) under a free name, as an import (untrusted, as any project from someone else), and opens it. A page that
// changed the project and kept no copy is warned before its tab closes (beforeunload) and asked before the project is
// closed (another project opened, Close Project: leaveFollowed, project.js), Keep a Copy or Close Without Keeping;
// either way the page then leaves the project followed: its own backend again, nothing shared.
import { api } from './api.js';
import { dialog, h } from './ui.js';
import { log } from './console.js';
import { app } from './app.js';
import { collab } from './collab-state.js';
import { renderPresence } from './collab-presence.js';
import { followedCopy, copyName, unsavedFollow } from '/core/collab-keep.js';
import { designZip } from '/core/design-link.js';

let st = null;   // { session, real (api's functions before following), edited, kept, left (the project closed) }

/** Following began (`real`: api as it was before it stood for the room): this page's changes of it watched, the tab's
 *  closing warned while they are saved nowhere. */
export function watchLeave(session, real) {
  st = { session, real, edited: false, kept: false, left: false };
  session.doc.on('update', (_u, origin) => { if (origin !== 'remote') st.edited = true; });
  addEventListener('beforeunload', e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } });
}

/** Whether this page holds changes of the project followed that reach nobody now and were not kept. */
export const unsaved = () => !!st && !st.left && unsavedFollow({ edited: st.edited, kept: st.kept, closed: st.session.closed(), connected: st.session.connected() });
/** Whether following ended with no copy kept (Keep a Copy offered). */
export const canKeep = () => !!st && !st.kept && !st.left && st.session.closed();

/** Following ended: the console's line offering Keep a Copy. */
export function followEnded() {
  if (!canKeep()) return;
  log(`${collab.owner}'s project "${collab.project}" is read only now and saved nowhere: Keep a Copy saves it as a project of yours (untrusted, as any project from someone else).`, 'info', { action: { label: 'Keep a Copy', run: () => keepCopy() } });
}

// the page's own backend again, nothing followed
function leave() {
  st.left = true;
  for (const k of Object.keys(api)) if (!(k in st.real)) delete api[k];
  Object.assign(api, st.real);
  Object.assign(collab, { role: null, session: null, editor: false });
  renderPresence();
}

/** Keep a Copy: the project as the room has it saved into this page's workspace under a free name, then opened (`open`
 *  false: not opened, its name returned). null: not kept (said in the console). */
export async function keepCopy({ open = true } = {}) {
  if (!canKeep()) return null;
  let copy;
  try { copy = followedCopy(st.session.doc); } catch (e) { log(`ERROR: Keep a Copy: ${e.message}.`, 'err'); return null; }
  try {
    const name = copyName(copy.name, (await st.real.projects()).map(p => p.name));
    await st.real.importZip(name, new Blob([await designZip(copy.entries)], { type: 'application/zip' }));
    st.kept = true;
    const owner = collab.owner;
    leave();
    log(`Kept a copy of ${owner}'s project "${copy.name}" as your project "${name}" (untrusted: Trust Project, when it opens, once you trust it).`, 'ok');
    if (open) await app.openProject(name);
    return name;
  } catch (e) { log(`ERROR: Keep a Copy: ${e.message}.`, 'err'); return null; }
}

/** Before the project followed is closed, once following ended: its changes kept or not, as the user says, then the
 *  page's own backend again. false: cancelled, the project stays open. */
export async function leaveFollowed() {
  if (!st || st.left || !st.session.closed()) return true;
  if (unsaved()) {
    const v = await dialog({
      title: 'Keep a Copy',
      body: h('p', {}, 'You changed this project, which is no longer shared, and it is saved nowhere. Keep a copy of it as a project of yours?'),
      buttons: [{ label: 'Keep a Copy', value: 'keep', primary: true }, { label: 'Close Without Keeping', value: 'close' }, { label: 'Cancel', value: null }],
    });
    if (!v) return false;
    if (v === 'keep') return !!(await keepCopy({ open: false }));
    log(`WARNING: ${collab.owner}'s project "${collab.project}" closed: your changes were not kept.`, 'warn');
  }
  leave();
  return true;
}

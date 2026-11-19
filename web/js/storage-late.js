// The browser edition's workspace folder whose permission the browser answered late (#4656): the start-up did not wait for
// it (web/js/api-local.js PERMISSION_WAIT), the app opened on the browser's storage meanwhile. Granted: the folder is the
// storage again, and the project that was open is reopened where it was (its documents, the task in front), unless the
// user opened one or changed the storage meanwhile. Not granted: as at a start-up without it (Start page ▸ Reopen <folder>).
// A start-up whose folder needs the browser's permission again (a click: Reopen <folder>, #4667) keeps this tab's project
// waiting too: the click that reopens the folder reopens it where it was (reopenWaiting).
import { api } from './api.js';
import { log } from './console.js';
import { S, showLeftPage } from './app.js';
import { openProject, updateStorageStatus } from './project.js';
import { restoreStartTask } from './tasks.js';

let waiting = null;   // (this tab's project, not reopened for want of the folder's permission, #4667)

/** Wait for the late answer, then act on it; last: the project to reopen (this tab's last). */
export async function reopenWhenGranted(last) {
  if (api.storage().needsPermission) waiting = last || null;
  const granted = await api.lateFolderPermission?.();
  if (granted === undefined) return;
  const st = api.storage();
  if (!granted) { log(`The workspace folder '${st.remembered}' needs the browser's permission again: Start page > Reopen ${st.remembered}.`, 'warn'); return; }
  if (S.project) { waiting = null; return; }   // (one opened meanwhile, from the browser's storage: kept; the folder stays a click away)
  const now = await api.useRememberedFolder();
  if (!now) return;
  log(`Projects are kept in the folder '${now.folder}' on the disk (the browser's permission came late).`, 'ok');
  updateStorageStatus();
  if (!await reopenWaiting()) showLeftPage('start');
}

/** The project the start-up left closed for want of the folder's permission, reopened where it was (its documents and
 *  tasks, #1191), once the folder is the storage (#4667: Reopen <folder>; #4656: granted late): false when there is none,
 *  another project is open, or the folder does not have it. */
export async function reopenWaiting() {
  const last = waiting;
  waiting = null;
  if (!last || S.project || api.storage().kind !== 'folder') return false;
  const projects = await api.projects().catch(() => []);
  if (S.project || !projects.some(p => p.name === last)) return false;
  try {
    await openProject(last, { startup: true });
    await new Promise(r => setTimeout(r, 0));
    restoreStartTask();
  } finally { delete document.documentElement.dataset.restoring; }
  return true;
}

/** Another project opened (from the browser's storage) before the folder was reopened: nothing waits any more. */
export const forgetWaiting = () => { waiting = null; };

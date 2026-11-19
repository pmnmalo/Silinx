// The browser edition's workspace folder whose permission the browser answered late (#4656): the start-up did not wait for
// it (web/js/api-local.js PERMISSION_WAIT), the app opened on the browser's storage meanwhile. Granted: the folder is the
// storage again, and the project that was open is reopened where it was (its documents, the task in front), unless the
// user opened one or changed the storage meanwhile. Not granted: as at a start-up without it (Start page ▸ Reopen <folder>).
import { api } from './api.js';
import { log } from './console.js';
import { S, showLeftPage } from './app.js';
import { openProject, updateStorageStatus } from './project.js';
import { restoreStartTask } from './tasks.js';

/** Wait for the late answer, then act on it; last: the project to reopen (this tab's last). */
export async function reopenWhenGranted(last) {
  const granted = await api.lateFolderPermission?.();
  if (granted === undefined) return;
  const st = api.storage();
  if (!granted) { log(`The workspace folder '${st.remembered}' needs the browser's permission again: Start page > Reopen ${st.remembered}.`, 'warn'); return; }
  if (S.project) return;   // (one opened meanwhile, from the browser's storage: kept; the folder stays a click away)
  const now = await api.useRememberedFolder();
  if (!now) return;
  log(`Projects are kept in the folder '${now.folder}' on the disk (the browser's permission came late).`, 'ok');
  updateStorageStatus();
  const projects = await api.projects().catch(() => []);
  if (!last || S.project || !projects.some(p => p.name === last)) { showLeftPage('start'); return; }
  try {
    await openProject(last, { startup: true });   // (where the user was: its documents and tasks, #1191)
    await new Promise(r => setTimeout(r, 0));
    restoreStartTask();
  } finally { delete document.documentElement.dataset.restoring; }
}

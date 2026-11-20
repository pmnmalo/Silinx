// The browser edition's first run offers a workspace folder on the disk (#4962), where the browser can give the page one
// (the File System Access API: Chrome, Edge): no folder set nor remembered, the offer not answered yet. One console line
// (not a dialog: the start-up goes on), its two buttons the answers: Choose a Workspace Folder… (File ▸ Open Workspace
// Folder…, web/js/project.js) or Keep in This Browser; the answer remembered (the picker cancelled is none: the line's
// buttons back, the offer again at the next start-up). A folder chosen with projects in the browser's storage: copy
// them into it (Copy Browser Projects to the Folder), or move them, the ones copied deleted from the browser's storage
// only once that is confirmed. Safari and Firefox (no such API) are offered nothing: the browser's storage, its notice in
// red (#4957), persistent (#4960).
import { api } from './api.js';
import { appLog as log } from './console.js';
import { prefKey } from './prefs.js';
import { dialog, confirmDlg, h } from './ui.js';
import { openWorkspaceFolder, copyBrowserProjects } from './project.js';

import { OFFER, KEPT, shouldOffer, copyQuestion, deleteQuestion, keptLine, deletedLine } from './storage-choice.js';

const KEY = prefKey('silinx.standalone.folderOffer');   // the answer: 'folder' | 'browser'

function answered(v) {
  try {
    if (v === undefined) return localStorage.getItem(KEY);
    localStorage.setItem(KEY, v);
  } catch { /* not remembered: offered again */ }
  return null;
}

/** At start-up (web/js/app.js): the offer's line, when it applies; true when said. */
export function offerFolder() {
  if (!shouldOffer(api.storage(), answered())) return false;
  log(OFFER, 'info', { action: [
    { label: 'Choose a Workspace Folder…', run: () => chooseFolder() },
    { label: 'Keep in This Browser', run: () => { answered('browser'); log(KEPT, 'info'); } },
  ] });
  return true;
}

// (nothing awaited before the picker: the click's activation)
async function chooseFolder() {
  if (!await openWorkspaceFolder()) return false;   // (cancelled, or refused and said: the line's buttons back)
  answered('folder');
  await offerBrowserProjects();
  return true;
}

/** The projects of the browser's storage, a folder now in use: copied into it, moved (deleted from the browser's storage
 *  once confirmed), or left. */
async function offerBrowserProjects() {
  const names = await api.browserProjects().catch(() => []);
  if (!names.length) return null;
  const folder = api.storage().folder;
  const choice = await dialog({
    title: 'Projects in This Browser', width: 480,
    body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'),
      h('div', { class: 'msg-text' }, copyQuestion(names, folder))),
    buttons: [{ label: 'Copy', value: 'copy', primary: true }, { label: 'Move…', value: 'move' }, { label: 'Not Now', value: null }],
  });
  if (!choice) return null;
  const r = await copyBrowserProjects();
  if (!r || choice !== 'move' || !r.copied.length) return choice;
  if (!await confirmDlg('Delete from This Browser', deleteQuestion(r.copied, folder), { yes: 'Delete from This Browser', no: 'Keep Them' })) {
    log(keptLine(r.copied), 'info');
    return 'copy';
  }
  try { await api.deleteBrowserProjects(r.copied); } catch (e) { log(`ERROR: Delete from This Browser: ${e.message}`, 'err'); return 'copy'; }
  log(deletedLine(r.copied, folder), 'ok');
  return 'move';
}

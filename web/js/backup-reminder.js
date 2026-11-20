// The browser edition's back-up reminder (#4971, core/backup.js): a project kept only in this browser's storage (not in
// a workspace folder on the disk) whose last back-up (an Export Project (.zip) as a Silinx project, a commit pushed to
// GitHub: web/js/api-local.js records them), or with none its first sight, is BACKUP_DAYS old or more is said in one
// console line when it opens, at most once in this page's session; the line's buttons back it up at once: Export Project
// (.zip) (the Silinx project, web/js/menus.js), and Store Project in a GitHub Repository… (Commit and Push… for a
// project already in one: web/js/git.js). Every project opened is "seen" (its first sight kept).
import { api } from './api.js';
import { S } from './app.js';
import { appLog as log } from './console.js';
import { backupDue, reminderLine } from '../../core/backup.js';

let reminded = false;   // (once in this page's session)

const githubAction = has => {
  const label = has ? 'Commit and Push…' : 'Store Project in a GitHub Repository…';
  return { label, run: () => import('./git.js').then(m => m.gitMenuItems().find(i => i?.label === label)?.action()) };
};

/** At a project's opening (web/js/project.js): its first sight kept; the reminder said when it is due. now: the tests'. */
export async function remindBackup(name, now = Date.now()) {
  if (!api.standalone || api.following || api.storage().kind === 'folder') return false;
  const r = api.sawProject(name);
  if (reminded || !backupDue(r, now)) return false;
  reminded = true;
  const has = !!await api.gitRemote(name).catch(() => null);
  const same = run => () => (S.project?.name === name ? run() : false);   // (another project opened meanwhile: not that one's)
  log(reminderLine(name, r, now), 'info', { action: [
    { label: 'Export Project (.zip)', run: same(() => import('./menus.js').then(m => m.exportProjectZip('silinx'))) },
    { ...githubAction(has), run: same(githubAction(has).run) },
  ] });
  return true;
}

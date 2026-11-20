// The projects' last back-ups (#4971, core/backup.js), recorded outside them: in the configuration folder
// (~/.silinx/backups.json, SILINX_CONFIG_DIR's), by the project's folder (where it really is, as the trust records:
// server/trust-store.js). A back-up is a Silinx export (Export Project (.zip) as a Silinx project, the MCP's
// export_project) or a push to GitHub (Push to GitHub, the MCP's git_push); project_info reports the last one. A project
// renamed takes its record along; one deleted loses it. A test run whose configuration folder is the user's own keeps its
// records in memory (server/toolchain.js refuseUserConfigInTests: it never reads nor writes it).
import fs from 'node:fs';
import path from 'node:path';
import { configDir, refuseUserConfigInTests } from './toolchain.js';
import { folderKey } from './trust-store.js';
import { backupOf, recordBackup, moveBackup, forgetBackup } from '../core/backup.js';

const BACKUP_FILE = 'backups.json';
let memory = null;   // (a test run's records, when the configuration folder is the user's own)

const fileOf = () => path.join(configDir(), BACKUP_FILE);
const inMemory = () => { try { refuseUserConfigInTests(); return false; } catch { return true; } };

// the records ({ version, projects: { ':<folder>': { since, last, how } } })
function read() {
  if (inMemory()) return memory ?? { version: 1, projects: {} };
  try {
    const j = JSON.parse(fs.readFileSync(fileOf(), 'utf8'));
    return { version: 1, projects: j?.projects && typeof j.projects === 'object' && !Array.isArray(j.projects) ? j.projects : {} };
  } catch { return { version: 1, projects: {} }; }   // (none yet, or one that cannot be read: no back-up known)
}
async function write(s) {
  if (inMemory()) { memory = s; return; }
  await fs.promises.mkdir(configDir(), { recursive: true, mode: 0o700 });
  // (atomically: a hidden file beside it, renamed over it)
  const tmp = path.join(configDir(), `.${BACKUP_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
    await fs.promises.rename(tmp, fileOf());
  } catch (e) { await fs.promises.rm(tmp, { force: true }).catch(() => {}); throw e; }
}
// (the store's changes one after another; written only when one changed it: a deletion of a project never backed up
// writes nothing)
let queue = Promise.resolve();
const change = fn => {
  const run = queue.then(async () => { const s = read(), before = JSON.stringify(s); fn(s.projects); if (JSON.stringify(s) !== before) await write(s); });
  queue = run.catch(() => {});
  return run;
};

/** A project's folder (absolute) backed up now: how, 'export' | 'github'. */
export const record = (dir, how, now = Date.now()) => change(p => { recordBackup(p, folderKey(dir), how, now); });
/** A project's record ({ since, last, how }) by its folder, or null. */
export const backupOfDir = dir => backupOf(read().projects, folderKey(dir));
/** A project's record moved with its folder (renamed): from its old folder's key to its new folder. */
export const move = (fromKey, toDir) => change(p => { moveBackup(p, fromKey, folderKey(toDir)); });
/** A project's record removed (deleted), by its folder's key (taken while the folder was there). */
export const forget = key => change(p => { forgetBackup(p, key); });

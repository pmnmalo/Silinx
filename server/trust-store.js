// The projects the user trusts (#4735, SEC-01 of the audit of 2026-11-20), recorded outside them: in the configuration
// folder (~/.silinx/trusted-projects.json, SILINX_CONFIG_DIR's), one record per project, its folder (where it really is)
// and its id (silinx.json's, #4205, when it has one). A project is trusted only with a record of its folder, and of its id
// when the record names one: a folder that reached the workspace other than through Silinx (unzipped by hand, cloned by
// command-line git, a synced folder, one restored from the workspace's .trash) has none, so it is untrusted until the
// user trusts it (Trust Project), whatever its silinx.json says. Silinx records the projects the user makes (New
// Project, an example) and the ones they trust; never the MCP server's, an import's or a clone's (core/trust.js). A
// project renamed takes its record along; one deleted loses it. The first time Silinx runs with this file missing, the
// projects already in the workspace that were trusted then (silinx.json and their repository's mark) are recorded once
// (the migration), so that an update untrusts none of the user's own. A test run whose configuration folder is the
// user's own keeps its records in memory (server/toolchain.js refuseUserConfigInTests: it never reads nor writes it).
import fs from 'node:fs';
import path from 'node:path';
import { configDir, refuseUserConfigInTests } from './toolchain.js';
import { nativeRealOf } from './paths.js';

export const TRUST_FILE = 'trusted-projects.json';
let memory = null;   // (a test run's records, when the configuration folder is the user's own)

const fileOf = () => path.join(configDir(), TRUST_FILE);
const inMemory = () => { try { refuseUserConfigInTests(); return false; } catch { return true; } };
/** A project folder's key: where it really is (its links followed, its case as the disk has it). */
export const folderKey = dir => nativeRealOf(path.resolve(dir));

// the records ({ version, projects: [{ dir, id }] }), or null when there are none yet (the migration's to make)
function read() {
  if (inMemory()) return memory;
  let text;
  try { text = fs.readFileSync(fileOf(), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try {
    const j = JSON.parse(text);
    return { version: 1, projects: (Array.isArray(j?.projects) ? j.projects : []).filter(r => r && typeof r.dir === 'string').map(r => ({ dir: r.dir, id: typeof r.id === 'string' ? r.id : null })) };
  } catch { return { version: 1, projects: [] }; }   // (a file that cannot be read: nothing trusted)
}
async function write(s) {
  if (inMemory()) { memory = s; return; }
  await fs.promises.mkdir(configDir(), { recursive: true, mode: 0o700 });
  // (atomically: a hidden file beside it, renamed over it)
  const tmp = path.join(configDir(), `.${TRUST_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
    await fs.promises.rename(tmp, fileOf());
  } catch (e) { await fs.promises.rm(tmp, { force: true }).catch(() => {}); throw e; }
}
// (the store's changes one after another)
let queue = Promise.resolve();
const change = fn => { const run = queue.then(async () => { const s = read() ?? { version: 1, projects: [] }; const next = await fn(s); await write(next ?? s); }); queue = run.catch(() => {}); return run; };

/** Whether the store has its records (false: the migration is still to make). */
export const hasRecords = () => read() !== null;

/** Whether a project's folder (absolute) and id are recorded as trusted. */
export function isRecorded(dir, id = null) {
  const s = read();
  if (!s) return false;
  const key = folderKey(dir);
  return s.projects.some(r => r.dir === key && (r.id === null || r.id === (id ?? null)));
}

/** A project trusted: its folder recorded with its id (any earlier record of the folder replaced). */
export const record = (dir, id = null) => change(s => { const key = folderKey(dir); s.projects = s.projects.filter(r => r.dir !== key); s.projects.push({ dir: key, id: id ?? null }); });

/** A project's record removed (deleted), by its folder's key (folderKey, taken while the folder was there). */
export const forget = key => (!hasRecords() ? Promise.resolve() : change(s => { s.projects = s.projects.filter(r => r.dir !== key); }));

/** A project's record moved with its folder (renamed): from its old folder's key to its new folder. */
export const move = (fromKey, toDir) => (!hasRecords() ? Promise.resolve() : change(s => { const r = s.projects.find(x => x.dir === fromKey); if (r) r.dir = folderKey(toDir); }));

/** The migration (once, when there are no records): the folders given (the workspace's projects trusted until now)
 *  recorded. -> how many. */
export const migrate = list => change(s => { if (read() !== null) return; for (const { dir, id } of list) s.projects.push({ dir: folderKey(dir), id: id ?? null }); }).then(() => list.length);

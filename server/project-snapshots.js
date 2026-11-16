// The snapshots a server's project keeps of the revisions it gave out as copies (#4205, core/project-rev.js): each one
// <project>/.silinx/snapshots/<rev>.json, a hidden folder that the file routes, the file tree, the export and the
// shares never see (#4182); the newest kept, SNAPSHOT_LIMITS at most. A snapshot read back is checked as one from
// outside (its revision computed again): the folder is the project's, and a project may come from anywhere.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isRev, keepSnapshots, parseSnapshot, snapshotText } from '../core/project-rev.js';

const dirOf = (P, name) => path.join(P.projectDir(name), '.silinx', 'snapshots');

/** The snapshots a project keeps: [{ rev, at, bytes }]. */
export async function listSnapshots(P, name) {
  const dir = dirOf(P, name);
  let names = [];
  try { names = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const f of names) {
    const rev = f.replace(/\.json$/, '');
    if (!isRev(rev) || `${rev}.json` !== f) continue;
    try { const st = await fsp.lstat(path.join(dir, f)); if (st.isFile()) out.push({ rev, at: st.mtime.toISOString(), bytes: st.size }); } catch { /* gone */ }
  }
  return out;
}

/** A snapshot kept (the older ones beyond the limits deleted): true when it was not kept already. */
export async function saveSnapshot(P, name, snapshot) {
  const dir = dirOf(P, name);
  const file = path.join(dir, `${snapshot.rev}.json`);
  const had = await listSnapshots(P, name);
  const { drop } = keepSnapshots(had, snapshot);
  await fsp.mkdir(dir, { recursive: true });
  const fresh = !had.some(x => x.rev === snapshot.rev);
  if (fresh) await fsp.writeFile(file, snapshotText(snapshot));
  else await fsp.utimes(file, new Date(), new Date());   // (given out again: the newest)
  for (const rev of drop) await fsp.rm(path.join(dir, `${rev}.json`), { force: true });
  return fresh;
}

/** The snapshot of a revision the project kept, checked; null: none (or one that is no valid snapshot). */
export async function readSnapshot(P, name, rev) {
  if (!isRev(rev)) return null;
  const file = path.join(dirOf(P, name), `${rev}.json`);
  try {
    const st = await fsp.lstat(file);
    if (!st.isFile()) return null;
    const s = await parseSnapshot(await fsp.readFile(file, 'utf8'));
    return s.rev === rev ? s : null;
  } catch { return null; }
}

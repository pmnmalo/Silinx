// A project's paths stay inside its folder, also once their symbolic links are followed (#1234): a folder put in
// the workspace by hand (a clone, a copy) may hold a link to a file of the user's (src/top.vhd -> ~/.ssh/id_rsa).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Where a path really is: its deepest part that exists, with its symbolic links resolved, then the rest. real: the
 *  resolver (fs.realpathSync's; nativeRealOf: the system's). */
export function realOf(p, real = q => fs.realpathSync(q)) {
  const rest = [];
  for (let q = p; ;) {
    try { return path.join(real(q), ...rest); } catch { /* not there (yet): its folder */ }
    const up = path.dirname(q);
    if (up === q) return p;
    rest.unshift(path.basename(q));
    q = up;
  }
}

/** Where a path really is as the system names it (realpath's native form: on Windows, a short name such as GIT~1
 *  expanded to the long one, .git). */
export const nativeRealOf = p => realOf(p, q => fs.realpathSync.native(q));

/** A hidden file's or folder's name (.git, .env), or what may be another name of one: a short (8.3) name, GIT~1 for
 *  .git on Windows, has a '~' and digits in its base name (core/import-gate.js refuses them too). */
export const hiddenName = s => (s.startsWith('.') && s !== '.' && s !== '..') || /^[^.]*~\d/.test(s);

/** The hidden file's or folder's name on the way from `dir` to `full` (absolute), by the names given and once the links
 *  of both are followed (the system's names too: GIT~1 is .git), or null: a path a project's silinx.json, an exercise or
 *  a .xise names that is no part of the project (#3036). */
export function hiddenIn(dir, full) {
  const parts = (a, b) => path.relative(a, b).split(path.sep);
  return [parts(dir, full), parts(realOf(dir), realOf(full)), parts(nativeRealOf(dir), nativeRealOf(full))].flat().find(s => s && hiddenName(s)) || null;
}

const isIn = (dir, full) => full === dir || full.startsWith(dir + path.sep);

/** Is `full` (absolute) the folder `dir` or inside it, by name and once the links of both are followed? */
export function within(dir, full) {
  return isIn(dir, full) && isIn(realOf(dir), realOf(full));
}

const refused = () => Object.assign(new Error('path escapes project'), { status: 400 });

/** Is the open file `fh` the file `full` names once its links are followed, inside the folder `dir`? A path checked
 *  then opened can be swapped in between (a link changed by another process, #4744): the file opened is checked too. */
async function opened(dir, full, fh) {
  const real = realOf(full), [st, at] = [await fh.stat({ bigint: true }), await fsp.stat(real, { bigint: true }).catch(() => null)];
  return !!at && at.dev === st.dev && at.ino === st.ino && isIn(realOf(dir), real);
}

/** A file of the folder `dir` (`full`: its absolute path, already checked by name) opened with `flags` (fs.open's),
 *  then checked (#4744): refused (400, 'path escapes project') when the file opened is not the one inside `dir`.
 *  A file replaced whole between the open and the check (another writer's temporary file renamed over it) is opened
 *  again, a few times: each file kept has passed the check. */
export async function openWithin(dir, full, flags = 'r', tries = 4) {
  for (let i = 1; ; i++) {
    const fh = await fsp.open(full, flags);
    let ok = false;
    try { ok = await opened(dir, full, fh); }
    catch (e) { await fh.close().catch(() => {}); throw e; }
    if (ok) return fh;
    await fh.close().catch(() => {});
    if (i >= tries) throw refused();
  }
}

/** The contents of a file of the folder `dir`, opened then checked (openWithin); encoding: readFile's. */
export async function readWithin(dir, full, encoding) {
  const fh = await openWithin(dir, full);
  try { return await fh.readFile(encoding); } finally { await fh.close(); }
}

/** A new file of the folder `dir` written whole at `full` (never an existing one, nor a link: 'wx'), checked once
 *  open (#4744: its folder swapped for a link out of `dir` since the path was checked), the file removed if not. */
export async function createWithin(dir, full, data) {
  const fh = await fsp.open(full, 'wx');
  let ok = false;
  try {
    if (!await opened(dir, full, fh)) throw refused();
    await fh.writeFile(data);
    await fh.sync();   // (on the disk before it is renamed in: a crash never leaves a truncated file, #4758)
    ok = true;
  } finally {
    await fh.close().catch(() => {});
    if (!ok) await fsp.rm(full, { force: true }).catch(() => {});
  }
}

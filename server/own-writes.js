// What this process wrote in the projects' folders itself (#4726), by path and by what it wrote (its hash): the
// watcher (server/project-watch.js) takes a change made while a page's request or a run holds the project for this
// server's own only when it is one of these, so that what another process (the MCP server, `silinx mcp`; an editor;
// git) wrote meanwhile is still told to the pages. A record is kept a few minutes (the watcher reads it within a look).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const KEEP = 5 * 60_000;
const written = new Map();   // key -> { hash, at }: a file written (its text's hash)
const removed = new Map();   // key -> at: a file or a folder (all below it) removed or moved away

const keyOf = full => { const k = path.resolve(full); return process.platform === 'linux' ? k : k.toLowerCase(); };
const hashOf = data => crypto.createHash('sha256').update(data).digest('hex');
function prune(now) {
  for (const [k, r] of written) if (now - r.at > KEEP) written.delete(k);
  for (const [k, at] of removed) if (now - at > KEEP) removed.delete(k);
}

/** A file this process writes (before it is renamed in: the watcher never sees it first). */
export function noteWritten(full, data) {
  const now = Date.now(), key = keyOf(full);
  prune(now);
  written.set(key, { hash: hashOf(data), at: now });
  removed.delete(key);
}

/** A file or a folder this process removes or moves away (everything below a folder). */
export function noteRemoved(full) {
  const now = Date.now(), key = keyOf(full);
  prune(now);
  removed.set(key, now);
  for (const k of [...written.keys()]) if (k === key || k.startsWith(key + path.sep)) written.delete(k);
}

/** A file or a folder this process is about to move from `src` to `dst` (a rename): what it holds, recorded as written
 *  at its new path (before it moves: the watcher never sees it first), its old path as removed. */
export async function noteMoving(src, dst) {
  const files = [];
  const read = async (from, to) => {
    const st = await fs.stat(from).catch(() => null);
    if (st?.isFile()) files.push([to, await fs.readFile(from)]);
    else if (st?.isDirectory()) for (const e of await fs.readdir(from)) await read(path.join(from, e), path.join(to, e));
  };
  await read(src, dst);
  noteRemoved(src);   // (first: a rename of its case only is one path on a case-insensitive file system)
  for (const [to, data] of files) noteWritten(to, data);
}

/** Whether the change `kind` ('created' | 'changed' | 'deleted') of the file `full` is this process's own: what it
 *  wrote there and what is there now the same, or a file it removed (or one in a folder it removed). */
export async function isOwnChange(full, kind) {
  const key = keyOf(full);
  if (kind === 'deleted') {
    if (written.has(key)) return false;
    for (let k = key; ; k = path.dirname(k)) { if (removed.has(k)) return true; if (path.dirname(k) === k) return false; }
  }
  const r = written.get(key);
  if (!r) return false;
  try { return hashOf(await fs.readFile(full)) === r.hash; } catch { return false; }
}

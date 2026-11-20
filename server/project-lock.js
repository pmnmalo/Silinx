// A project's lock across processes (#4726): the server (`silinx serve`), the MCP server (`silinx mcp`, another
// process) and the CLI each read silinx.json, change it and write it back; a lock of one process only let one's write
// drop another's change (a file the MCP registered, a top the page set). The lock is a file created exclusively
// ('wx'), in a folder of the system's temporary files (never the workspace's: it may be a repository, or a synced
// folder), one per workspace; its holder touches it while it holds it, so that a lock left by a process that died
// (no longer running on this machine, or not touched for `stale` ms) is taken over.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const LOCK_TIMING = { stale: 10_000, wait: 60_000 };

/** The folder of the locks of the workspace `ws` (the same for every process that has it, whatever its spelling). */
export function locksDir(ws) {
  let real = path.resolve(ws);
  try { real = fsSync.realpathSync.native(real); } catch { /* not there yet */ }
  const id = crypto.createHash('sha256').update(process.platform === 'linux' ? real : real.toLowerCase()).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'silinx-locks', id);
}

const lockFile = (ws, name) => path.join(locksDir(ws), `${crypto.createHash('sha256').update(String(name).toLowerCase()).digest('hex').slice(0, 24)}.lock`);

// a lock whose holder is gone: one of this machine's processes no longer running, or one not touched for `stale` ms
async function isStale(file, stale) {
  let st, owner;
  try { st = await fs.stat(file); owner = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return false;   // (released meanwhile: tried again)
    owner = null;   // (being written, or damaged: its age decides)
  }
  if (owner?.host === os.hostname() && Number.isInteger(owner.pid) && owner.pid !== process.pid) {
    try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') return true; }
  }
  return !!st && Date.now() - st.mtimeMs > stale;
}

/** Runs fn() holding the lock of the project `name` of the workspace `ws`, across processes. */
export async function withFileLock(ws, name, fn, { stale = LOCK_TIMING.stale, wait = LOCK_TIMING.wait } = {}) {
  const file = lockFile(ws, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const until = Date.now() + wait, token = crypto.randomBytes(8).toString('hex');
  for (let k = 0; ; k++) {
    try {
      await fs.writeFile(file, JSON.stringify({ pid: process.pid, host: os.hostname(), token }), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code === 'ENOENT') { await fs.mkdir(path.dirname(file), { recursive: true }); continue; }
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;   // (EPERM: Windows, a lock being removed)
    }
    if (await isStale(file, stale)) { await fs.rm(file, { force: true }).catch(() => {}); continue; }
    if (Date.now() > until) throw Object.assign(new Error(`the project '${name}' is busy (another Silinx process holds it): try again`), { status: 503 });
    await new Promise(r => setTimeout(r, Math.min(5 * (k + 1), 50)));
  }
  // (touched while held: a long change is not taken for a dead holder's)
  const beat = setInterval(() => { const t = new Date(); fs.utimes(file, t, t).catch(() => {}); }, Math.max(stale / 3, 10));
  beat.unref?.();
  try { return await fn(); } finally {
    clearInterval(beat);
    // (its own lock only: one taken over meanwhile, as a dead holder's, is the other process's now)
    const owner = await fs.readFile(file, 'utf8').then(JSON.parse, () => null);
    if (owner?.token === token) await fs.rm(file, { force: true }).catch(() => {});
  }
}

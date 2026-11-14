// The open projects watched (#2843): what another process changes in a project's folder (the MCP server,
// `silinx mcp`, an editor, git) is told to the pages that have it open (GET /api/projects/:p/events), so
// that they show it without opening the project again.
//
// A project is watched while a page listens to it: its files are looked at every `interval` ms (their size and
// time; a poll, the same on every system, where fs.watch is not), the build's outputs aside but its summary
// (build/reports.json) and the processes' marks (build/silinx-status.json). The changes this server makes itself
// (the page's own requests, its runs) are not told: while one of them runs the project is held, and once it ends
// what it changed is taken as known, silently. A request that names its page (X-Silinx-Client, #3972) is known to
// that page only: what it changed is told to the project's other pages (another tab on the same project).
import fs from 'node:fs/promises';
import path from 'node:path';

/** The build's files told: the Design Summary of the last run, the processes' marks the page saved. */
export const BUILD_WATCHED = ['build/reports.json', 'build/silinx-status.json'];

// the project's files as the Files page lists them (server/projects.js's walk, hidden files and build/ aside),
// with the build's files above: rel -> 'size:mtime'
async function scan(dir) {
  const out = new Map();
  const walk = async base => {
    let ents;
    try { ents = await fs.readdir(path.join(dir, base), { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (ent.name.startsWith('.') || (base === '' && ent.name === 'build')) continue;
      const rel = base ? `${base}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(rel);
      else if (ent.isFile()) await stamp(rel);
    }
  };
  const stamp = async rel => {
    const st = await fs.stat(path.join(dir, rel)).catch(() => null);
    if (st?.isFile()) out.set(rel, `${st.size}:${st.mtimeMs}`);
  };
  await walk('');
  for (const rel of BUILD_WATCHED) await stamp(rel);
  return out;
}

/** What changed between two scans: [{ path, kind: 'created' | 'changed' | 'deleted' }], by path. */
export function diffScans(before, after) {
  const out = [];
  for (const [rel, sig] of after) {
    if (!before.has(rel)) out.push({ path: rel, kind: 'created' });
    else if (before.get(rel) !== sig) out.push({ path: rel, kind: 'changed' });
  }
  for (const rel of before.keys()) if (!after.has(rel)) out.push({ path: rel, kind: 'deleted' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A watcher of the projects: dirOf(name) is a project's folder; busy(name), whether this server runs something
 * in it now (a run: its changes are its own).
 *   subscribe(name, onChange, { client }) -> unsubscribe; onChange({ project, changes, tab }) (tab: another page's)
 *   hold(name, client) -> release: the changes made until release() are this server's own: not told to the page
 *     `client` (the page that asked), told to the project's other pages that name theirs; a hold of no page's, to none
 *   acquire(name, client) -> Promise<release>: hold(), once the other pages' holds of the project ended and what they
 *     changed was read (two tabs' requests at once: each one's told to the other, #3972); after `wait` ms, held anyway
 */
export function createProjectWatcher({ dirOf, busy = () => false, interval = 500, scanDir = scan, wait = 2000 } = {}) {
  const watched = new Map();   // key -> { name, dir, listeners, snap, holds, writers, timer, inflight, next, wasBusy, resync, releases, ready }
  const NOBODY = Symbol('a hold of no page');
  const keyOf = name => String(name).toLowerCase();   // (case-insensitive file systems: one folder)

  // one look at a time; asked while one runs (a release, a check): another one after it (the timer's: skipped)
  function poll(w, { after = true } = {}) {
    if (w.inflight) return after ? (w.next ||= w.inflight.then(() => { w.next = null; return poll(w); })) : w.inflight;
    w.inflight = look(w).finally(() => { w.inflight = null; });
    return w.inflight;
  }
  async function look(w) {
    await w.ready;
    const ranBefore = busy(w.name), heldBefore = w.holds > 0 || ranBefore, releases = w.releases;
    const now = await scanDir(w.dir);
    const ran = ranBefore || busy(w.name), held = heldBefore || w.holds > 0 || ran;   // (held during the scan: its files may be our own)
    const changes = diffScans(w.snap, now);
    w.snap = now;
    // held, or just released by a run: what changed is known, not told; released during the scan, the scan may have
    // read the folder before the request's writes: the next look too (#2913). The requests' changes are told to the
    // pages that did not ask (#3972); a run's to none
    if (held || w.wasBusy || w.resync) {
      if (!ran && !w.wasBusy && !w.writers.has(NOBODY)) tell(w, changes, client => client != null && !w.writers.has(client), { tab: true });
      w.wasBusy = held && busy(w.name); w.resync = w.releases !== releases;
      if (!w.holds && !w.resync) { w.writers.clear(); wake(w); }   // (all they wrote read, and told unless a run's)
      return;
    }
    w.writers.clear();
    tell(w, changes, () => true);
  }
  function tell(w, changes, told, by = {}) {
    if (!changes.length) return;
    for (const [fn, client] of [...w.listeners]) if (told(client)) { try { fn({ project: w.name, changes, ...by }); } catch { /* a listener's own error */ } }
  }

  function subscribe(name, onChange, { client = null } = {}) {
    const key = keyOf(name);
    let w = watched.get(key);
    if (!w) {
      w = { name, dir: dirOf(name), listeners: new Map(), snap: new Map(), holds: 0, writers: new Set(), waiters: [], inflight: null, next: null, wasBusy: false, resync: false, releases: 0 };
      w.ready = scanDir(w.dir).then(s => { w.snap = s; });
      w.timer = setInterval(() => { poll(w, { after: false }).catch(() => {}); }, interval);
      w.timer.unref?.();
      watched.set(key, w);
    }
    w.listeners.set(onChange, client || null);
    return () => {
      w.listeners.delete(onChange);
      if (!w.listeners.size && watched.get(key) === w) { clearInterval(w.timer); watched.delete(key); wake(w); }
    };
  }

  const wake = w => { for (const r of w.waiters.splice(0)) r(); };
  async function acquire(name, client = null) {
    const key = keyOf(name), w = watched.get(key);
    const others = () => [...w.writers].some(c => c !== client);
    const until = Date.now() + wait;
    // (another page's request on the project: its end waited for, then its changes read and told, so each page's are
    // told apart; a request of no page waits for none, as before)
    while (w && client && others() && watched.get(key) === w && Date.now() < until) {
      if (w.holds) {
        let timer;
        await new Promise(r => { w.waiters.push(r); timer = setTimeout(r, until - Date.now()); });
        clearTimeout(timer);
      } else await poll(w).catch(() => {});
    }
    return hold(name, client);
  }

  function hold(name, client = null) {
    const w = watched.get(keyOf(name));
    if (!w) return () => {};
    w.holds++;
    w.writers.add(client || NOBODY);
    let done = false;
    return () => { if (done) return; done = true; w.holds--; w.resync = true; w.releases++; if (!w.holds) wake(w); poll(w).catch(() => {}); };
  }

  /** Looks at the project now (the tests; a page told sooner). */
  const check = name => { const w = watched.get(keyOf(name)); return w ? poll(w) : Promise.resolve(); };
  const close = () => { for (const w of watched.values()) clearInterval(w.timer); watched.clear(); };
  return { subscribe, hold, acquire, check, close, watching: name => watched.has(keyOf(name)) };
}

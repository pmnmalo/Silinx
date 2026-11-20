// The snapshots a browser edition's project keeps of the revisions it gave out as copies (#4205, core/project-rev.js;
// the server's: server/project-snapshots.js): in the browser's localStorage, one key per project of each storage (the
// browser's, a workspace folder's), the edition's own (the development site's: silinx.dev.), fewer than the server's
// (localStorage is small, and the browser's projects are in it too). A snapshot that does not fit is not kept: the
// copy carries its own anyway. Every project's snapshots together stay within a budget, counted as localStorage counts
// (UTF-16 units of the stored text), so that they never take the space of the projects (#4725); a project's move with
// it when it is renamed, and go when it is deleted. Read back, a snapshot is checked as one from outside. No browser
// global is touched at import time: storage() is the caller's.
import { keepSnapshots, parseSnapshot } from '../../core/project-rev.js';
import { storageKeys } from './project-store.js';
import { DEV_SITE } from './prefs.js';

/** What the browser keeps: a project's newest 5, 1 M units (2 MB) at most; every project's together, 1 M units. */
export const LOCAL_SNAPSHOT_LIMITS = Object.freeze({ max: 5, bytes: 1 << 20, total: 1 << 20 });
const PREFIX = DEV_SITE ? 'silinx.dev.snapshots:' : 'silinx.snapshots:';
// (a snapshot's size as stored: its JSON's UTF-16 units)
const units = s => JSON.stringify(s).length;

/** A project's snapshots in `storage` (a localStorage): { list(), save(snapshot), read(rev), forget() }; where: the
 *  storage's kind and label, name: the project's. */
export function localSnapshots(storage, where, name) {
  const key = `${PREFIX}${where}:${name}`;
  // the other projects' snapshots (every storage's), in units
  const others = () => { try { const st = storage(); return storageKeys(st).filter(k => k.startsWith(PREFIX) && k !== key).reduce((n, k) => n + (st.getItem(k)?.length || 0), 0); } catch { return 0; } };
  const all = () => { try { const v = JSON.parse(storage()?.getItem(key) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  const put = v => { try { if (Object.keys(v).length) storage()?.setItem(key, JSON.stringify(v)); else storage()?.removeItem(key); return true; } catch { return false; } };
  return {
    list: () => Object.entries(all()).map(([rev, s]) => ({ rev, at: s?.at || '', bytes: units(s) })),
    /** Kept (the older ones beyond the limits dropped); false: it did not fit (this project's room, or the budget's). */
    save(snapshot) {
      const cur = all();
      const room = Math.min(LOCAL_SNAPSHOT_LIMITS.bytes, LOCAL_SNAPSHOT_LIMITS.total - others());
      if (units(snapshot) > room) return false;
      const { keep } = keepSnapshots(Object.entries(cur).map(([rev, s]) => ({ rev, at: s?.at || '', bytes: units(s) })), snapshot, { max: LOCAL_SNAPSHOT_LIMITS.max, bytes: room });
      const next = Object.fromEntries(keep.map(rev => [rev, rev === snapshot.rev ? snapshot : cur[rev]]));
      return put(next);
    },
    async read(rev) { const s = all()[rev]; if (!s) return null; try { const p = await parseSnapshot(JSON.stringify(s)); return p.rev === rev ? p : null; } catch { return null; } },
    forget: () => put({}),
    /** Moved to the project's new name (Rename Project…); false: not moved (the old ones kept). */
    moveTo(to) {
      const cur = all();
      if (!Object.keys(cur).length) return true;
      try { storage()?.setItem(`${PREFIX}${where}:${to}`, JSON.stringify(cur)); } catch { return false; }
      return put({});
    },
  };
}

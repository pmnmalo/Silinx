// The snapshots a browser edition's project keeps of the revisions it gave out as copies (#4205, core/project-rev.js;
// the server's: server/project-snapshots.js): in the browser's localStorage, one key per project of each storage (the
// browser's, a workspace folder's), the edition's own (the development site's: silinx.dev.), fewer than the server's
// (localStorage is small, and the browser's projects are in it too). A snapshot that does not fit is not kept: the
// copy carries its own anyway. Read back, a snapshot is checked as one from outside. No browser global is touched at
// import time: storage() is the caller's.
import { keepSnapshots, parseSnapshot, snapshotBytes } from '../../core/project-rev.js';
import { DEV_SITE } from './prefs.js';

/** What the browser keeps: the newest 5, 2 MB at most. */
export const LOCAL_SNAPSHOT_LIMITS = Object.freeze({ max: 5, bytes: 2 << 20 });
const PREFIX = DEV_SITE ? 'silinx.dev.snapshots:' : 'silinx.snapshots:';

/** A project's snapshots in `storage` (a localStorage): { list(), save(snapshot), read(rev), forget() }; where: the
 *  storage's kind and label, name: the project's. */
export function localSnapshots(storage, where, name) {
  const key = `${PREFIX}${where}:${name}`;
  const all = () => { try { const v = JSON.parse(storage()?.getItem(key) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  const put = v => { try { if (Object.keys(v).length) storage()?.setItem(key, JSON.stringify(v)); else storage()?.removeItem(key); return true; } catch { return false; } };
  return {
    list: () => Object.entries(all()).map(([rev, s]) => ({ rev, at: s?.at || '', bytes: snapshotBytes(s) })),
    /** Kept (the older ones beyond the limits dropped); false: it did not fit. */
    save(snapshot) {
      const cur = all();
      const { keep } = keepSnapshots(Object.entries(cur).map(([rev, s]) => ({ rev, at: s?.at || '', bytes: snapshotBytes(s) })), snapshot, LOCAL_SNAPSHOT_LIMITS);
      const next = Object.fromEntries(keep.map(rev => [rev, rev === snapshot.rev ? snapshot : cur[rev]]));
      return put(next);
    },
    async read(rev) { const s = all()[rev]; if (!s) return null; try { const p = await parseSnapshot(JSON.stringify(s)); return p.rev === rev ? p : null; } catch { return null; } },
    forget: () => put({}),
  };
}

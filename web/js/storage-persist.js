// The browser edition's projects in the browser's storage made persistent (#4960): navigator.storage.persist(), so
// that the browser does not delete them when the disk runs short (a "best-effort" storage is evicted first). Asked at
// start-up when the projects are in the browser's storage (a workspace folder on the disk needs none), unless the
// storage is persistent already (persisted()); a browser without the API (StorageManager's persist) is asked nothing.
// Refused: said in the console, in one line. Not awaited by the start-up: Firefox asks the user, who may answer late.

/** The console's line when the browser refuses. */
export const REFUSED = 'The browser did not make its storage persistent: it may delete the projects kept in it when the disk runs short (File > Export Project (.zip)… keeps a copy).';

/** Ask the browser to keep its storage: 'unsupported' (no API), 'persisted' (already), 'granted', 'refused' (the
 *  browser said no, or failed). storage: navigator.storage (the tests' own). */
export async function persistStorage(storage = globalThis.navigator?.storage) {
  if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return await storage.persist() ? 'granted' : 'refused';
  } catch { return 'refused'; }
}

/** At start-up (web/js/app.js): asked when the projects are in the browser's storage (st: api.storage()); log(line,
 *  level) says a refusal. Its answer's promise (null: not asked), for the tests. */
export function persistBrowserStorage(st, log, storage) {
  if (!st || st.kind === 'folder') return Promise.resolve(null);
  return persistStorage(storage).then((r) => {
    if (r === 'refused') log(REFUSED, 'info');
    return r;
  });
}

// A project's versions in the browser edition (#5740, core/versions.js; the server's: server/versions.js): kept in the
// browser's IndexedDB (a database of their own, the development site's apart), by the store in use and the project
// (the browser's own storage, or a workspace folder: its label), its index and its texts each a record; renamed and
// forgotten with the project. Restored on the merge's storage (web/js/merge-local.js: the store's files, the drawings'
// HDL made again). The automatic versions: a save once the project is quiet (changed(name) after each write).
//   localVersions({ store, ops, snapshots }) -> { list, save, read, diff, restore, changed, rename, forget }
import { versionStore, restoreVersion, autoVersions, versionChanges } from '../../core/versions.js';
import { localMergeStorage } from './merge-local.js';
import { DEV_SITE } from './prefs.js';

const DB = DEV_SITE ? 'silinx-dev-versions' : 'silinx-versions', STORE = 'kv';

// one request on the records, in a transaction of its own
function kv(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { open.result.close(); resolve(r?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
      tx.onabort = () => { open.result.close(); reject(tx.error || new Error('the versions\' storage refused the change (full?)')); };
    };
  });
}

/** core/versions.js's backend in IndexedDB: the records of `prefix()` (the store in use) and a project. */
function idbBackend(prefix) {
  const key = (name, ...rest) => [prefix(), name, ...rest].join('\u0000');
  const range = name => IDBKeyRange.bound(key(name, ''), key(name, '\uffff'));
  return {
    readIndex: name => kv('readonly', s => s.get(key(name, 'index'))).then(v => v ?? null),
    writeIndex: (name, ix) => kv('readwrite', s => s.put(structuredClone(ix), key(name, 'index'))),
    getText: (name, h) => kv('readonly', s => s.get(key(name, 't', h))).then(v => v ?? null),
    putText: (name, h, t) => kv('readwrite', s => s.put(t, key(name, 't', h))),
    dropText: (name, h) => kv('readwrite', s => s.delete(key(name, 't', h))),
    forget: name => kv('readwrite', s => s.delete(range(name))),
    /** every record of a project moved to another name (Rename Project…) */
    async rename(from, to) {
      const all = await kv('readonly', s => s.getAll(range(from)));
      const keys = await kv('readonly', s => s.getAllKeys(range(from)));
      if (!keys?.length) return;
      await kv('readwrite', s => { keys.forEach((k, i) => s.put(all[i], key(to, ...k.split('\u0000').slice(2)))); return s.delete(range(from)); });
    },
  };
}

/** The versions of the browser edition's projects (store(): the store in use; ops, snapshots: as merge-local.js's). */
export function localVersions({ store, ops, snapshots }) {
  const backend = idbBackend(() => `${store().kind}:${store().label || ''}`);
  const versions = versionStore(backend);
  const storage = localMergeStorage({ store, ops, snapshots });
  const changed = autoVersions(async name => versions.save(name, await storage.read(name), { reason: 'save' }));
  return {
    list: name => versions.list(name),
    save: async (name, opts = {}) => versions.save(name, await storage.read(name), opts),
    read: (name, id) => versions.read(name, id),
    async diff(name, id) { const target = await versions.read(name, id); return { version: target.version, ...versionChanges(target, await storage.read(name)) }; },
    restore: (name, id, opts = {}) => restoreVersion(storage, versions, name, id, opts),
    changed,
    rename: (from, to) => backend.rename(from, to),
    forget: name => versions.forget(name),
  };
}

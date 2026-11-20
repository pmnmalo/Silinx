// An in-memory Storage (localStorage's interface: getItem, setItem, removeItem, key, length, clear) for the unit tests
// of the browser edition's storage (web/js/project-store.js browserStore, web/js/snapshots-local.js). fail(key, value):
// true makes that setItem throw a QuotaExceededError, as a full localStorage. m: the Map behind it.
export function memStorage(fail = () => false) {
  const m = new Map();
  return {
    m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (fail(k, v)) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); m.set(String(k), String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    clear: () => m.clear(),
  };
}

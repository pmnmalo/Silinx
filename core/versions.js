// A project's versions (#5740, phase 2 of #5743): snapshots of the whole project (its text files and its silinx.json),
// to go back to when something went wrong. Each one: its number, time, author, name (a version saved by hand: Save
// Version…), what made it (REASONS: a save, before a risky command, a restore) and its files, content-addressed: a
// text is kept once, by its SHA-256, however many versions hold it. Kept by a backend, the server's (a hidden folder of
// the project: server/versions.js) or the browser's (IndexedDB: web/js/versions-local.js):
//   backend: { readIndex(name) -> index | null (none) | anything else (damaged: its text when it is no JSON),
//              writeIndex(name, index), getText(name, hash) -> text | null, putText(name, hash, text),
//              dropText(name, hash), forget(name),
//              and, to rebuild a damaged index (#5908): listEntries(name) -> [entry] (each version's own object, written
//              before the index), putEntry(name, entry), dropEntry(name, id), setAside(name) -> where the damaged index
//              was put; optionally commit(name, { texts, entries, index, dropTexts, dropEntries }) (one transaction) }
//   index:   { version: 1, next (the next version's number), versions: [entry] (oldest first), sizes: { hash: bytes } }
//   entry:   { id, at (ISO), reason, label, author, of (a restore's version), json (silinx.json's hash), files ({ path:
//              hash }), changed: { added, changed, removed } (paths, against the version before) }
// Bounded (VERSION_LIMITS): the named versions kept; the others all for an hour, then one an hour for a day, one a day
// for a month, none older; at most `max` versions and `bytes` of texts, the oldest unnamed ones dropped first; the latest
// always kept. A save (`reason` save) is made at most once every `saveGap`, and none when nothing changed. Versions are
// not commits: local, automatic and cheap (a git commit is a deliberate one, pushed). The index is checked when read
// (#5908): an entry that cannot be read is left out, the others kept; a damaged index (not JSON, not an index) is set
// aside, never overwritten, and rebuilt from the versions' own objects and the entries that survive, said (`warning`);
// a version's number is never given again. Its changes are one at a time across processes too (`lock`: the local
// server's project lock, the browser's Web Locks). Isomorphic.
//   versionStore(backend) -> { save, list, read, forget }
//   restorePlan(target, now, { path }) -> { write, remove, json }     what a restore writes (the project's own id, name,
//                                                                     origin and trust kept)
//   await restoreVersion(storage, versions, name, id, { path, author }) -> { written, removed, json, version, before }
//   autoVersions(save, { quiet }) -> changed(name)                    a save once the project is quiet
//   versionChanges(target, now) -> { files: [{ path, state }], json }    what differs between a version and now (#5741)

export const VERSION_LIMITS = Object.freeze({ max: 200, bytes: 64 << 20, all: 3600e3, hourly: 86400e3, daily: 30 * 86400e3, saveGap: 10 * 60e3 });
/** What made a version, as the History says it. */
export const REASONS = Object.freeze({
  save: 'saved on its own', manual: 'saved by hand', 'before-merge': 'before Merge Contribution', 'before-remove': 'before Remove from Project',
  'before-delete': 'before Delete', 'before-convert': 'before a conversion', 'before-import': 'before an import',
  'before-git': 'before a git pull or merge', 'before-mode': 'before Change Mode', 'before-migrate': 'before a document\'s new format', 'before-restore': 'before a restore', restore: 'restored',
  'before-regenerate': 'before an HDL file changed outside Silinx was made again from its drawing',
});
const LABEL_MAX = 80, AUTHOR_MAX = 40;
// (silinx.json's fields that are the project's own: never taken from a version, #5740)
const OWN = ['id', 'origin', 'trusted', 'madeBy', 'name'];

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const bytesOf = text => new TextEncoder().encode(text).length;
export const isHash = h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);
const jsonText = json => { const { fileTree, ...pj } = json || {}; return `${JSON.stringify(pj, null, 2)}\n`; };   // eslint-disable-line no-unused-vars
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// a version's entry as read back (from a folder anyone may have changed): its shape checked
const plainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const entryOk = v => plainObj(v) && typeof v.id === 'string' && /^[1-9]\d{0,8}$/.test(v.id) && isHash(v.json) && plainObj(v.files)
  && Object.values(v.files).every(isHash) && !Number.isNaN(Date.parse(v.at)) && Object.hasOwn(REASONS, v.reason);
const byId = (a, b) => +a.id - +b.id;

/** An index as read back (`raw`: the backend's, null when there is none) with the versions' own objects (`objects`),
 *  checked (#5908): { index, damaged (why the index as a whole could not be read: set it aside), dropped (the ids of
 *  the entries left out), rebuilt (the versions taken from their objects), unrecorded (the versions with no object of
 *  their own yet: an index of before #5908's, written on its next change) }. Never loses a version that one of them
 *  holds whole; the next number is past every one seen (the damaged text's too), never given again. */
export function checkIndex(raw, objects = []) {
  const shape = plainObj(raw) && raw.version === 1 && Array.isArray(raw.versions);
  const damaged = raw == null ? null : !plainObj(raw) ? 'not JSON' : !shape ? 'not a versions\' index' : null;
  const listed = shape ? raw.versions : plainObj(raw) && Array.isArray(raw.versions) ? raw.versions : [];
  const good = new Map(), dropped = [];
  for (const v of listed) if (entryOk(v) && !good.has(v.id)) good.set(v.id, v); else dropped.push(plainObj(v) && typeof v.id === 'string' ? v.id.slice(0, 12) : '?');
  const rebuilt = [];
  for (const v of objects) if (entryOk(v) && !good.has(v.id)) { good.set(v.id, v); rebuilt.push(v.id); }
  // (the numbers seen: the entries', the objects', the damaged text's ids, its next)
  const seen = [...good.keys()].map(Number);
  if (typeof raw === 'string') for (const m of raw.matchAll(/"id"\s*:\s*"(\d{1,9})"/g)) seen.push(+m[1]);
  if (plainObj(raw) && Number.isInteger(raw.next)) seen.push(raw.next - 1);
  const versions = [...good.values()].sort(byId);
  const sizes = {};
  if (plainObj(raw?.sizes)) for (const [h, n] of Object.entries(raw.sizes)) if (isHash(h) && Number.isFinite(n) && n >= 0) sizes[h] = n;
  const recorded = new Set(objects.filter(entryOk).map(v => v.id));
  return { index: { version: 1, next: Math.max(0, ...seen) + 1, versions, sizes }, damaged, dropped: dropped.filter(id => !rebuilt.includes(id)), rebuilt,
    unrecorded: versions.filter(v => !recorded.has(v.id)) };
}

/** What a checked index's repairs say (#5908: the History's console, the MCP's version tools), or null. */
export function indexWarning(name, { damaged, dropped, rebuilt }, aside = null) {
  if (!damaged && !dropped.length && !rebuilt.length) return null;
  const kept = `${rebuilt.length} version(s) taken from their own records`;
  if (damaged) return `the versions' index of '${name}' was damaged (${damaged}): ${aside ? `set aside as ${aside} and ` : ''}rebuilt, ${kept}; no version that could be read is lost`;
  const parts = [];
  if (dropped.length) parts.push(`${dropped.length} entry(ies) that could not be read left out (${dropped.join(', ')})`);
  if (rebuilt.length) parts.push(`${kept}`);
  return `the versions' index of '${name}' was repaired: ${parts.join('; ')}; the others kept`;
}

// the paths a version changed against the one before
function changesOf(prev, files) {
  const was = prev?.files || {};
  return {
    added: Object.keys(files).filter(p => !Object.hasOwn(was, p)).sort(),
    changed: Object.keys(files).filter(p => Object.hasOwn(was, p) && was[p] !== files[p]).sort(),
    removed: Object.keys(was).filter(p => !Object.hasOwn(files, p)).sort(),
  };
}

/** The versions kept (oldest first) by the limits at `now`: { keep, drop } (entries). */
export function pruneVersions(versions, limits = VERSION_LIMITS, now = Date.now(), sizes = {}) {
  const latest = versions.at(-1);
  const keep = new Set();
  const seen = new Set();
  for (const v of [...versions].reverse()) {
    const age = now - Date.parse(v.at);
    if (v === latest || v.label || age < limits.all) { keep.add(v); continue; }
    const bucket = age < limits.hourly ? `h${Math.floor(Date.parse(v.at) / 3600e3)}` : age < limits.daily ? `d${Math.floor(Date.parse(v.at) / 86400e3)}` : null;
    if (bucket && !seen.has(bucket)) { seen.add(bucket); keep.add(v); }
  }
  let kept = versions.filter(v => keep.has(v));
  const bytes = list => { const hs = new Set(list.flatMap(v => [v.json, ...Object.values(v.files)])); let n = 0; for (const h of hs) n += sizes[h] || 0; return n; };
  // (over the count or the bytes: the oldest unnamed ones dropped first, never the latest)
  while (kept.length > limits.max || bytes(kept) > limits.bytes) {
    const i = kept.findIndex(v => !v.label && v !== latest);
    if (i < 0) break;
    kept.splice(i, 1);
  }
  return { keep: kept, drop: versions.filter(v => !kept.includes(v)) };
}

/** A project's versions on a backend. */
export function versionStore(backend, { limits = VERSION_LIMITS, lock = null } = {}) {
  const chains = new Map();   // (one change of a project's versions at a time: this process's, or every process's by `lock`)
  const serial = lock || ((name, fn) => { const r = (chains.get(name) || Promise.resolve()).then(fn, fn); chains.set(name, r.catch(() => {})); return r; });
  const check = async name => checkIndex(await backend.readIndex(name), backend.listEntries ? await backend.listEntries(name) : []);
  const index = async name => (await check(name)).index;
  // (to change it: a damaged index set aside first, never written over; what was repaired said once, by the change)
  const indexForWrite = async name => {
    const c = await check(name);
    const aside = (c.damaged || c.dropped.length) && backend.setAside ? await backend.setAside(name) : null;
    return { ix: c.index, warning: indexWarning(name, c, aside), unrecorded: backend.putEntry ? c.unrecorded : [] };
  };
  // (the texts, the version's own object, then the index, then what was dropped: one transaction where the backend has it)
  const commit = async (name, ops) => {
    if (backend.commit) return backend.commit(name, ops);
    for (const [h, t] of ops.texts) await backend.putText(name, h, t);
    for (const e of ops.entries) await backend.putEntry?.(name, e);
    await backend.writeIndex(name, ops.index);
    for (const id of ops.dropEntries) await backend.dropEntry?.(name, id);
    for (const h of ops.dropTexts) await backend.dropText(name, h);
  };
  const row = v => ({ id: v.id, at: v.at, reason: v.reason, label: v.label || '', author: v.author || '', ...(v.of ? { of: v.of } : {}), files: Object.keys(v.files).length, changed: v.changed });

  /** A version of `project` ({ json, files: { path: text } }): { version (its row), saved } (saved false: the latest one
   *  holds it already, or a save made too soon after the last version). */
  function save(name, project, { reason = 'manual', label = '', author = '', of = null, at = Date.now() } = {}) {
    if (!Object.hasOwn(REASONS, reason)) throw fail(`reason: one of ${Object.keys(REASONS).join(', ')}`);
    return serial(name, async () => {
      const { ix, warning, unrecorded } = await indexForWrite(name);
      // (no version saved: a repaired index, the versions' objects not written yet, written all the same)
      const said = async r => {
        if (!r.saved && (warning || unrecorded.length)) await commit(name, { texts: [], entries: unrecorded, index: ix, dropEntries: [], dropTexts: [] });
        return warning ? { ...r, warning } : r;
      };
      const latest = ix.versions.at(-1);
      const name1 = clean(label, LABEL_MAX);
      if (reason === 'save' && latest && at - Date.parse(latest.at) < limits.saveGap) return said({ version: row(latest), saved: false });
      const texts = new Map([[await sha256(jsonText(project.json)), jsonText(project.json)]]);
      const json = [...texts.keys()][0];
      const files = {};
      for (const p of Object.keys(project.files).sort()) { const t = String(project.files[p]); const h = await sha256(t); files[p] = h; texts.set(h, t); }
      const same = latest && latest.json === json && JSON.stringify(latest.files) === JSON.stringify(files);
      if (same && !name1 && reason !== 'restore') return said({ version: row(latest), saved: false });
      const known = new Set(ix.versions.flatMap(v => [v.json, ...Object.values(v.files)]));
      const put = [];
      for (const [h, t] of texts) if (!known.has(h)) { put.push([h, t]); ix.sizes[h] = bytesOf(t); }
      const entry = { id: String(ix.next++), at: new Date(at).toISOString(), reason, label: name1, author: clean(author, AUTHOR_MAX), ...(of ? { of: String(of) } : {}), json, files, changed: changesOf(latest, files) };
      ix.versions.push(entry);
      const { keep, drop } = pruneVersions(ix.versions, limits, at, ix.sizes);
      const used = new Set(keep.flatMap(v => [v.json, ...Object.values(v.files)]));
      // (only the texts the index knew the size of: those a damaged index's versions held are kept, never swept)
      const gone = Object.keys(ix.sizes).filter(h => !used.has(h));
      ix.versions = keep;
      for (const h of gone) delete ix.sizes[h];
      const kept = new Set(keep.map(v => v.id));
      await commit(name, { texts: put, entries: [...unrecorded.filter(v => kept.has(v.id)), entry], index: ix, dropEntries: drop.map(v => v.id), dropTexts: gone });
      return said({ version: row(entry), saved: true });
    });
  }
  return {
    save,
    /** The versions, newest first (their rows: no texts). */
    list: async name => (await index(name)).versions.map(row).reverse(),
    /** What a repair of the index would say (#5908: the History and list_versions say it), or null: read only. */
    warning: async name => indexWarning(name, await check(name)),
    /** A version's project: { version (its row), json, files }; an Error (404) for one not kept. */
    async read(name, id) {
      const v = (await index(name)).versions.find(x => x.id === String(id));
      if (!v) throw fail(`no version ${id} of '${name}' (list_versions: the versions kept)`, 404);
      const text = async h => { const t = await backend.getText(name, h); if (typeof t !== 'string') throw fail(`version ${id} of '${name}': its texts are missing`, 500); return t; };
      const files = {};
      for (const [p, h] of Object.entries(v.files)) files[p] = await text(h);
      return { version: row(v), json: JSON.parse(await text(v.json)), files };
    },
    forget: name => serial(name, () => backend.forget(name)),
  };
}

/** What restoring `target` ({ json, files }) writes into the project `now` ({ json, files }: its text files): { write
 *  ({ path: text }), remove ([path]: the project's text files the version has not), json (silinx.json, null: as it is)
 *  }; with `path`, that file only (and its entry in silinx.json's files). silinx.json's own fields (OWN) are the
 *  project's, never the version's (a restore never trusts a project again). */
export function restorePlan(target, now, { path = null } = {}) {
  const write = {}, remove = [];
  const { fileTree, ...base } = now.json;   // eslint-disable-line no-unused-vars
  const own = json => { const out = { ...json }; for (const k of OWN) { if (now.json[k] !== undefined) out[k] = now.json[k]; else delete out[k]; } return out; };
  let json;
  if (path === null) {
    for (const [p, t] of Object.entries(target.files)) if (now.files[p] !== t) write[p] = t;
    for (const p of Object.keys(now.files)) if (!Object.hasOwn(target.files, p)) remove.push(p);
    json = own(target.json);
  } else {
    const had = Object.hasOwn(target.files, path), has = Object.hasOwn(now.files, path);
    if (!had && !has) throw fail(`'${path}' is in neither the version nor the project`, 404);
    if (had && now.files[path] !== target.files[path]) write[path] = target.files[path];
    if (!had) remove.push(path);
    // (its entry in silinx.json's files: the version's, in its place, added, or taken out)
    const cur = base.files || [], entry = (target.json.files || []).find(f => f?.path === path);
    const files = !entry ? cur.filter(f => f?.path !== path) : cur.some(f => f?.path === path) ? cur.map(f => (f?.path === path ? entry : f)) : [...cur, entry];
    json = { ...base, files };
  }
  return { write, remove: remove.sort(), json: JSON.stringify(json) === JSON.stringify(base) ? null : json };
}

/** A version restored (the whole project, or one file: `path`) on a storage (core/merge-apply.js's: read, write, remove,
 *  saveJson, regenerate, locked?): the project as it was kept first (a version 'before-restore', so that a restore can
 *  be undone), then written, the drawings' HDL made again, and kept as a version of its own ('restore', `of` the
 *  version). { written, removed, json (silinx.json written), version (the new one's row), before (the one before's row)
 *  }; nothing written when the project is the version already. */
export async function restoreVersion(storage, versions, name, id, { path = null, author = '' } = {}) {
  const target = await versions.read(name, id);
  const run = fn => (storage.locked ? storage.locked(name, fn) : fn());
  const now = await storage.read(name);
  const plan = restorePlan(target, now, { path });
  if (!Object.keys(plan.write).length && !plan.remove.length && !plan.json) return { written: [], removed: [], json: false, version: null, before: null };
  const before = (await versions.save(name, now, { reason: 'before-restore', author })).version;
  await run(async () => {
    for (const p of plan.remove) await storage.remove(name, p);
    for (const [p, t] of Object.entries(plan.write)) await storage.write(name, p, t);
    if (plan.json) await storage.saveJson(name, plan.json);
  });
  const { DRAWING_RE } = await import('./drawing-merge.js');
  for (const p of Object.keys(plan.write)) if (DRAWING_RE.test(p)) await storage.regenerate?.(name, p);
  const after = (await versions.save(name, await storage.read(name), { reason: 'restore', author, of: id })).version;
  return { written: Object.keys(plan.write).sort(), removed: plan.remove, json: !!plan.json, version: after, before };
}

/** A version saved once a project is quiet (`quiet` ms with no change; save(name) makes it, its `saveGap` the most
 *  often): changed(name) after each change. */
export function autoVersions(save, { quiet = 20e3 } = {}) {
  const timers = new Map();
  const changed = name => {
    clearTimeout(timers.get(name));
    const t = setTimeout(() => { timers.delete(name); Promise.resolve().then(() => save(name)).catch(() => {}); }, quiet);
    t.unref?.();
    timers.set(name, t);
  };
  changed.cancel = () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); };
  return changed;
}

/** What differs between a version (`target`: { json, files }) and the project now (`now`): { files: [{ path, state }]
 *  (by path: 'changed', 'removed' since the version, 'added' since), json (silinx.json differs, its own fields aside) }. */
export function versionChanges(target, now) {
  const files = [];
  for (const p of new Set([...Object.keys(target.files), ...Object.keys(now.files)])) {
    const was = Object.hasOwn(target.files, p), is = Object.hasOwn(now.files, p);
    if (was && is && target.files[p] !== now.files[p]) files.push({ path: p, state: 'changed' });
    else if (was && !is) files.push({ path: p, state: 'removed' });
    else if (!was && is) files.push({ path: p, state: 'added' });
  }
  return { files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), json: !!restorePlan(target, now).json };
}

/** A version's line, as the History and the MCP say it: "12  2026-11-26 17:40  Ana  saved by hand: before the lab". */
export function versionLine(v) {
  const what = v.reason === 'restore' ? `restored version ${v.of}` : REASONS[v.reason];
  const c = v.changed ? [['+', v.changed.added], ['~', v.changed.changed], ['-', v.changed.removed]].filter(([, l]) => l?.length).map(([s, l]) => `${s}${l.length}`).join(' ') : '';
  return `${v.id}  ${v.at.slice(0, 16).replace('T', ' ')}${v.author ? `  ${v.author}` : ''}  ${what}${v.label ? `: ${v.label}` : ''}${c ? `  (${c})` : ''}`;
}

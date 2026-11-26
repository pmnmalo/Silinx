// A shared project's versions (#5742, phase 4 of #5743; core/versions.js): kept by its owner, the one store, and shared
// through the project's document, a root of its own (`versions`, core/collab-doc.js DOC_ROOTS):
//   list     the owner's: its versions' rows, newest first (LIST_MAX at most), as JSON: every participant's Versions…
//   done     the owner's: what the last request made, as JSON ({ nonce, kind, by, ok, line, result }), and its line for
//            everyone's console
//   request  an editor's: Save Version… or a restore it asks for ({ nonce, kind: 'save' | 'restore', by, label?, id?,
//            path? }), as JSON. An editor's edit, signed (core/collab-room.js): a viewer cannot make one, whatever its
//            awareness says of its role. The owner does it (its versions, its project: the restore's writes reach
//            everyone as its own), records the editor's name as the version's author, then clears it.
// What a follower reads is checked first (untrusted: the owner's page or another editor may have written anything), and
// the owner's parts are taken only when the owner wrote them (`owner`: its client, the room's: an editor could write
// a forged list or answer, which the owner then writes again).
// Isomorphic.
//   publishVersions(doc, rows)   docVersions(doc) -> rows   putRequest(doc, req)   watchRequests(doc, fn) -> off()
//   handleRequest(req, { save, restore }) -> done   putDone(doc, done)   doneOf(doc)   watchDone(doc, fn) -> off()
import { REASONS } from './versions.js';
import { sharedPath } from './collab-doc.js';

const VERSIONS_ROOT = 'versions';
const LIST_MAX = 50, NAME_MAX = 40, LABEL_MAX = 80, LINE_MAX = 2000, PATHS_MAX = 200;
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const parse = t => { try { return typeof t === 'string' ? JSON.parse(t) : null; } catch { return null; } };
const paths = l => (Array.isArray(l) ? l.slice(0, PATHS_MAX).filter(p => sharedPath(p)) : []);
// the client that wrote a key's value (Yjs keeps it with the value's item); `owner` undefined: anyone's
const byOwner = (doc, key, owner) => owner === undefined || doc.getMap(VERSIONS_ROOT)._map.get(key)?.id.client === owner;

// a version's row as a follower takes it (null: not one)
function rowOf(v) {
  if (!v || typeof v !== 'object' || !str(v.id, 20) || !/^\d+$/.test(v.id) || Number.isNaN(Date.parse(v.at)) || !Object.hasOwn(REASONS, v.reason)) return null;
  const c = v.changed && typeof v.changed === 'object' ? v.changed : {};
  return { id: v.id, at: new Date(Date.parse(v.at)).toISOString(), reason: v.reason, label: clean(v.label, LABEL_MAX), author: clean(v.author, NAME_MAX),
    ...(str(v.of, 20) && /^\d+$/.test(v.of) ? { of: v.of } : {}), files: Number.isInteger(v.files) && v.files >= 0 ? v.files : 0,
    changed: { added: paths(c.added), changed: paths(c.changed), removed: paths(c.removed) } };
}

/** The owner's versions (rows, newest first) into the document, when they changed. */
export function publishVersions(doc, rows) {
  const t = JSON.stringify(rows.slice(0, LIST_MAX).map(rowOf).filter(Boolean));
  const m = doc.getMap(VERSIONS_ROOT);
  if (m.get('list') !== t) m.set('list', t);
}
/** The owner's versions as the document has them (rows, newest first; [] when none, not readable, or not the owner's). */
export function docVersions(doc, { owner } = {}) {
  if (!byOwner(doc, 'list', owner)) return [];
  const l = parse(doc.getMap(VERSIONS_ROOT).get('list'));
  return Array.isArray(l) ? l.slice(0, LIST_MAX).map(rowOf).filter(Boolean) : [];
}

/** A request as the owner takes it (null: not one): a save (a name) or a restore (a version, a file or none). */
export function requestOf(v) {
  if (!v || typeof v !== 'object' || !str(v.nonce, 64) || !/^[\w-]+$/.test(v.nonce)) return null;
  const by = clean(v.by, NAME_MAX) || '?';
  if (v.kind === 'save') return { nonce: v.nonce, kind: 'save', by, label: clean(v.label, LABEL_MAX) };
  if (v.kind !== 'restore' || !str(v.id, 20) || !/^\d+$/.test(v.id)) return null;
  if (v.path != null && !sharedPath(v.path)) return null;
  return { nonce: v.nonce, kind: 'restore', by, id: v.id, path: v.path ?? null };
}
/** An editor's request into the document (its nonce: what the owner's answer names). */
export function putRequest(doc, req) {
  const r = requestOf(req);
  if (!r) throw new Error('not a request of the versions');
  doc.getMap(VERSIONS_ROOT).set('request', JSON.stringify(r));
  return r;
}
/** The editors' requests, at the owner's (fn(request), once each; one that is no request ignored): off(). Whatever else
 *  another participant changed of the versions is the owner's again (fix()). */
export function watchRequests(doc, fn, { fix = () => {} } = {}) {
  const m = doc.getMap(VERSIONS_ROOT);
  const seen = new Set();
  const on = (ev, tr) => {
    if (tr.local) return;
    const keys = [...ev.keysChanged];
    if (keys.some(k => k !== 'request')) fix();
    if (!keys.includes('request')) return;
    const r = requestOf(parse(m.get('request')));
    if (r && !seen.has(r.nonce)) { seen.add(r.nonce); fn(r); }
  };
  m.observe(on);
  return () => m.unobserve(on);
}

/** What a request makes, done by the owner (save(label, author) -> core/versions.js save's { version, saved };
 *  restore(id, path, author) -> restoreVersion's result): its answer, { nonce, kind, by, ok, line, result }. */
export async function handleRequest(r, { save, restore }) {
  const base = { nonce: r.nonce, kind: r.kind, by: r.by };
  try {
    if (r.kind === 'save') {
      const s = await save(r.label, r.by);
      return { ...base, ok: true, result: s, line: s.saved ? `${r.by} saved version ${s.version.id}${s.version.label ? `: ${s.version.label}` : ''}.` : `${r.by}: version ${s.version.id} has it already: no version saved.` };
    }
    const x = await restore(r.id, r.path, r.by);
    const what = r.path || 'the project';
    return { ...base, ok: true, result: x, line: x.version
      ? `${r.by} restored ${what} as version ${r.id} had it: ${x.written.length} file(s) written, ${x.removed.length} removed; the project before it kept as version ${x.before.id}.`
      : `${r.by}: ${what} is as version ${r.id} has it already: nothing restored.` };
  } catch (e) {
    return { ...base, ok: false, result: null, line: `${r.by}: ${r.kind === 'save' ? 'Save Version' : 'Restore Version'}: ${clean(e.message, 500)}` };
  }
}

/** The owner's answer into the document, the request cleared. */
export function putDone(doc, done) {
  const m = doc.getMap(VERSIONS_ROOT);
  doc.transact(() => { m.set('done', JSON.stringify(done)); if (m.has('request')) m.delete('request'); });
}
/** The last answer as the document has it (null: none, not one, or not the owner's). */
export function doneOf(doc, { owner } = {}) {
  if (!byOwner(doc, 'done', owner)) return null;
  const d = parse(doc.getMap(VERSIONS_ROOT).get('done'));
  if (!d || typeof d !== 'object' || !str(d.nonce, 64) || !['save', 'restore'].includes(d.kind)) return null;
  return { nonce: d.nonce, kind: d.kind, by: clean(d.by, NAME_MAX), ok: d.ok === true, line: clean(d.line, LINE_MAX), result: d.result && typeof d.result === 'object' ? d.result : null };
}
/** Each new answer of the owner's (fn(done)), at every participant's (owner(): its client, null: not known yet): off(). */
export function watchDone(doc, fn, { owner = () => undefined } = {}) {
  const m = doc.getMap(VERSIONS_ROOT);
  const on = ev => { if (!ev.keysChanged.has('done')) return; const o = owner(); if (o === null) return; const d = doneOf(doc, { owner: o }); if (d) fn(d); };
  m.observe(on);
  return () => m.unobserve(on);
}

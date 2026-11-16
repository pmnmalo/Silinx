// A project's ancestor, recorded when a copy of it is given out (#4205, phase 1 of #4204): so that the copy, changed by
// someone else, merges back into the project three-way (Merge Contribution…), what both sides changed since told from
// what one side did. A project has an id (made once, the first time a copy of it is given); a copy's silinx.json names
// where it came from, `origin: { id, rev, at }`: the project's id, its revision (a hash of its files when the copy was
// made) and the date. The project keeps a snapshot of each revision it gave out (its files then: a hidden folder of the
// server's project, the browser's storage), and the copy carries it too (ANCESTOR_FILE, in its zip), so that either side
// finds the ancestor. A copy of a copy keeps its origin: its contribution merges into the first project. Isomorphic.
//   await projectRev(json, files) -> rev                      the revision of a project's files ({ path: text })
//   await giveCopy(json, files, { at, kept }) -> { base, copy, snapshot, keep }   what a copy given out carries
//   await receivedCopy(json, ancestorText) -> { json, snapshot, warnings }        a copy taken in (an import)
//   await parseSnapshot(text) -> snapshot | throws             a snapshot from outside, checked
//   keepSnapshots(list, snapshot) -> { keep, drop }            the snapshots a project keeps (the newest, capped)
import { normalizePath } from './import-gate.js';

/** The ancestor a copy carries, at its zip's root (not a project file: an import takes it out). */
export const ANCESTOR_FILE = 'silinx.base.json';
const SNAPSHOT_FORMAT = 'silinx-base';
/** What a project keeps of the revisions it gave out: the newest `max`, `bytes` at most in all. */
export const SNAPSHOT_LIMITS = Object.freeze({ max: 20, bytes: 20 << 20 });
/** A snapshot from outside: its files' count and size (the import gate's, about). */
const OUTSIDE_LIMITS = Object.freeze({ files: 2000, bytes: 64 << 20 });
const REV_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A new project's id (random). */
const newProjectId = () => globalThis.crypto.randomUUID();
export const isProjectId = v => typeof v === 'string' && ID_RE.test(v);
export const isRev = v => typeof v === 'string' && REV_RE.test(v);
/** A project's origin when it is a valid one: { id, rev, at }, or null. */
export function originOf(json) {
  const o = json?.origin;
  return o && typeof o === 'object' && isProjectId(o.id) && isRev(o.rev) ? { id: o.id, rev: o.rev, at: typeof o.at === 'string' ? o.at : null } : null;
}

// silinx.json without what is not the design (its id, its origin, its trust), its keys sorted: the same project, the
// same text, wherever it was written
const VOLATILE = new Set(['id', 'origin', 'trusted', 'madeBy']);
const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
export const designOf = json => sortKeys(Object.fromEntries(Object.entries(json || {}).filter(([k]) => !VOLATILE.has(k))));

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** The revision of a project: a SHA-256 of its description (designOf) and of each of its files (path and text, in the
 *  paths' order); silinx.json among `files` is not one of them. */
export async function projectRev(json, files) {
  const paths = Object.keys(files).filter(p => p !== 'silinx.json').sort();
  const parts = [JSON.stringify(designOf(json))];
  for (const p of paths) parts.push(`${JSON.stringify(p)} ${await sha256(String(files[p]))}`);
  return sha256(parts.join('\n'));
}

const only = (files) => Object.fromEntries(Object.entries(files).filter(([p]) => p !== 'silinx.json' && p !== ANCESTOR_FILE));

/** What a copy given out of a project (its silinx.json `json`, its files { path: text }) carries:
 *  - a project that is no copy (no origin): base (its silinx.json, its id made when it had none: the caller writes it
 *    when it changed, `changed`), copy (the copy's silinx.json: its origin this project's revision), snapshot (the
 *    project's files now: the copy carries it, the project keeps it, keep: true);
 *  - a copy (it has an origin): its origin kept (a contribution goes back to the first project), the snapshot it kept
 *    of that origin (`kept`: the caller's, null when it has none) carried as it is, nothing kept anew. */
export async function giveCopy(json, files, { at = new Date().toISOString(), kept = null } = {}) {
  const origin = originOf(json);
  if (origin) return { base: json, changed: false, copy: json, snapshot: kept && kept.rev === origin.rev ? kept : null, keep: false };
  const changed = !isProjectId(json.id);
  const base = changed ? { ...json, id: newProjectId() } : json;
  const own = only(files);
  const rev = await projectRev(base, own);
  const snapshot = { format: SNAPSHOT_FORMAT, version: 1, id: base.id, rev, at, json: designOf(base), files: own };
  return { base, changed, copy: { ...base, origin: { id: base.id, rev, at } }, snapshot, keep: true };
}

/** A snapshot's text (the file a copy carries, the one a project keeps). */
export const snapshotText = s => `${JSON.stringify(s)}\n`;
/** A snapshot's size in bytes (its text's). */
export const snapshotBytes = s => new TextEncoder().encode(snapshotText(s)).length;

const bad = reason => Object.assign(new Error(`${ANCESTOR_FILE}: ${reason}`), { reason });
/** A snapshot from outside (a copy's ANCESTOR_FILE, or one read back from storage), checked: its format, its paths (the
 *  import gate's rules), its sizes, and its revision computed again from its files (one that does not match is no
 *  ancestor: refused). */
export async function parseSnapshot(text) {
  if (typeof text !== 'string' || text.length > OUTSIDE_LIMITS.bytes) throw bad('too large');
  let s;
  try { s = JSON.parse(text); } catch { throw bad('not JSON'); }
  if (!s || typeof s !== 'object' || s.format !== SNAPSHOT_FORMAT || s.version !== 1) throw bad('not a Silinx ancestor');
  if (!isProjectId(s.id) || !isRev(s.rev)) throw bad('no project id or revision');
  if (!s.json || typeof s.json !== 'object' || Array.isArray(s.json) || !s.files || typeof s.files !== 'object' || Array.isArray(s.files)) throw bad('no description or files');
  const files = {};
  const entries = Object.entries(s.files);
  if (entries.length > OUTSIDE_LIMITS.files) throw bad('too many files');
  for (const [p, t] of entries) {
    const n = normalizePath(p);
    if (n.reason || n.path !== p || p === 'silinx.json' || p === ANCESTOR_FILE) throw bad(`a file's path: ${p}`);
    if (typeof t !== 'string') throw bad(`a file that is no text: ${p}`);
    files[p] = t;
  }
  const json = designOf(s.json);
  if (await projectRev(json, files) !== s.rev) throw bad('its files are not its revision\'s');
  return { format: SNAPSHOT_FORMAT, version: 1, id: s.id, rev: s.rev, at: typeof s.at === 'string' ? s.at : null, json, files };
}

/** A copy taken in (an import of a zip, a folder, a link: its silinx.json `json`, already gated, and the ancestor it
 *  carries, its text or null): { json (a new project's: an id of its own, its origin kept when valid), snapshot (its
 *  ancestor, checked, to keep: null), warnings }. */
export async function receivedCopy(json, ancestorText = null) {
  const { id, origin, ...rest } = json || {};   // eslint-disable-line no-unused-vars
  const o = originOf(json);
  const out = { ...rest, id: newProjectId(), ...(o ? { origin: o } : {}) };
  const warnings = [];
  let snapshot = null;
  if (ancestorText != null) {
    try { snapshot = await parseSnapshot(ancestorText); } catch (e) { warnings.push(`${e.message}: not kept (a merge of this project back is two-way)`); }
    if (snapshot && (!o || snapshot.rev !== o.rev || snapshot.id !== o.id)) { warnings.push(`${ANCESTOR_FILE}: not the project's origin: not kept`); snapshot = null; }
  }
  return { json: out, snapshot, warnings };
}

/** The snapshots a project keeps once `snapshot` is added to `list` ([{ rev, at, bytes }]): { keep, drop } (revs), the
 *  newest first, SNAPSHOT_LIMITS' count and size at most (the one added always kept). */
export function keepSnapshots(list, snapshot, limits = SNAPSHOT_LIMITS) {
  const added = { rev: snapshot.rev, at: snapshot.at || '', bytes: snapshotBytes(snapshot) };
  const all = [added, ...list.filter(x => x.rev !== added.rev).sort((a, b) => String(b.at).localeCompare(String(a.at)))];
  const keep = [], drop = [];
  let bytes = 0;
  for (const x of all) {
    if (x === added || (keep.length < limits.max && bytes + x.bytes <= limits.bytes)) { keep.push(x.rev); bytes += x.bytes; } else drop.push(x.rev);
  }
  return { keep, drop };
}

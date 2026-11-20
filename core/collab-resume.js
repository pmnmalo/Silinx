// A live share or follow that survives its page loaded again (#4850): what the page keeps, in its tab's
// sessionStorage only, at its `pagehide`, and takes back once loaded again by a reload (never another page's, never
// after the tab was closed: the browser's own scope for sessionStorage). The owner's record: its project, its name, the
// way it shares (the relay's address and key, or the hosted room's meeting key), its session's snapshot
// (core/collab-client.js shareRoom's: the document's state and client id, the links' keys, the room and the relay's
// secret that resumes it, its awareness's clock), the drawings' bases, the followers it has said, the links it showed.
// A follower's: the link it follows (the fragment it was opened at), its name, its session's snapshot (followRoom's:
// the document's state and client id, an editor's own changes, the editors' key it signs with now). What the link
// already carries is all a follower keeps; the owner's resume secret and meeting key stay in its own tab.
//   ownerRecord(fields) / followerRecord(fields) -> the record, as JSON text (null: too large to keep)
//   readRecord(text, now) -> the record checked (null: none, broken, too old, or of another version)
//   restoredDoc(snapshot) -> the Y.Doc as it was, its client id the same
import * as Y from 'yjs';
import { KEY_RE } from './collab-crypto.js';
import { SIGN_RE, PUB_RE } from './collab-sign.js';
import { ROOM_RE } from './collab-wire.js';

export const RECORD_VERSION = 1;
/** A record kept longer than this is not resumed (the relay keeps a room 2 minutes for its owner). */
export const RECORD_MAX_AGE = 10 * 60_000;
/** The largest record kept (a tab's sessionStorage holds about 5 MB of text, in UTF-16). */
const RECORD_MAX = 2_000_000;

// (bytes as base64, by chunks: a document's state is too large for one String.fromCharCode call)
export const toB64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

const str = (v, max = 200) => typeof v === 'string' && v.length <= max;
const client = v => Number.isSafeInteger(v) && v >= 0 && v <= 0xFFFFFFFF;
const b64 = (v, nullable = false) => (nullable && v === null) || (typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v));
const clock = v => Number.isSafeInteger(v) && v >= 0;
const text = rec => { const t = JSON.stringify(rec); return t.length <= RECORD_MAX ? t : null; };

/** The owner's record: { project, name, via, relay ({ address, key } | null), host ({ key (the meeting key's text),
 *  pub } | null), session (shareRoom's snapshot()), bases (Map), known ([[client, name]]), made ({ view, edit }) }. */
export function ownerRecord({ project, name, via, relay = null, host = null, session, bases = new Map(), known = [], made = {}, at = Date.now() }) {
  return text({
    v: RECORD_VERSION, role: 'owner', at, project, name, via, relay, host,
    session: { ...session, doc: toB64(session.doc) },
    bases: [...bases], known: [...known], made: { view: !!made.view, edit: !!made.edit },
  });
}

/** A follower's record: { hash (the link's fragment), name, session (followRoom's snapshot()), following (its owner
 *  followed, not browsing alone) }. */
export function followerRecord({ hash, name, session, following = true, at = Date.now() }) {
  return text({
    v: RECORD_VERSION, role: 'follower', at, hash, name, following: !!following,
    session: { ...session, doc: toB64(session.doc), mine: session.mine ? toB64(session.mine) : null },
  });
}

/** A record read back, checked (null: none, not one, of another version, or older than RECORD_MAX_AGE); its
 *  session's bytes decoded. */
export function readRecord(raw, now = Date.now()) {
  let r;
  try { r = JSON.parse(raw); } catch { return null; }
  if (!r || typeof r !== 'object' || r.v !== RECORD_VERSION || !Number.isFinite(r.at) || now - r.at > RECORD_MAX_AGE || now < r.at - 60_000) return null;
  const s = r.session;
  if (!s || !client(s.client) || !b64(s.doc) || !clock(s.clock) || !str(r.name, 40)) return null;
  if (s.sign !== null && !SIGN_RE.test(String(s.sign))) return null;
  try {
    if (r.role === 'owner') {
      if (!str(r.project) || !['relay', 'host'].includes(r.via) || !KEY_RE.test(String(s.key)) || !ROOM_RE.test(String(s.room))) return null;
      if (s.resume !== null && !str(s.resume, 64)) return null;
      if (r.relay !== null && !(r.relay && str(r.relay.address, 2000) && str(r.relay.key ?? '', 2000))) return null;
      if (r.host !== null && !(r.host && SIGN_RE.test(String(r.host.key)) && PUB_RE.test(String(r.host.pub)))) return null;
      if (!Array.isArray(r.bases) || !r.bases.every(([p, t]) => str(p, 1000) && typeof t === 'string')) return null;
      if (!Array.isArray(r.known) || !r.known.every(([c, n]) => client(c) && str(n, 64))) return null;
      return { ...r, session: { ...s, doc: fromB64(s.doc) }, bases: new Map(r.bases), known: new Map(r.known), made: { view: !!r.made?.view, edit: !!r.made?.edit } };
    }
    if (r.role === 'follower') {
      if (!str(r.hash, 4000) || !b64(s.mine, true)) return null;
      return { ...r, following: r.following !== false, session: { ...s, doc: fromB64(s.doc), mine: s.mine ? fromB64(s.mine) : null } };
    }
  } catch { return null; }
  return null;
}

/** A session's document as it was (#4850): its state applied, then its client id the same (applied first under another
 *  one: Yjs takes an update of its own client id from outside as another page's, and changes its own). */
export function restoredDoc({ client: id, doc: state }) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  doc.clientID = id;
  return doc;
}

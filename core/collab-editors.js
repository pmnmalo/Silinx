// The editors of a room, as its owner lists them (#4745): the owner's page makes a key of its own (ECDSA P-256, as an
// editor's: core/collab-sign.js) when it shares a project with editors, and signs with it the list of the editors' public
// keys, numbered (`n`: a later list replaces an earlier one, never the reverse). The relay or host that runs the room
// takes the owner's public key at the open and every list it is given after (core/collab-room.js); the participants
// take the owner's public key from the link (core/collab-link.js) and the list from the project's document. An editor's
// change names the key it is signed with, by its id (8 bytes of its public key's SHA-256), and is taken only when that
// key is one of the list's.
//   list         = { n, editors: [public key, …], sig } (sig: the owner's, over the room, n and the keys)
//   signed edit  = [kind][iv][ciphertext][key id (8 bytes)][signature (64 bytes)]   (the signature over all before it)
// Each editor has a key of its own (#4745, second part), made by its page, its private half never leaving it: a follower
// whose link is an editor's (the room's invitation key: core/collab-link.js) asks the owner to list its public key, the
// request signed with the invitation key (an enrol frame, sealed, which the room gives to the owner only); the owner
// lists it at once. A viewer promoted is listed by the public key its awareness gives.
import { b64url } from './collab-crypto.js';
import { PUB_RE, SIG, signFrame, verifyFrame, verifierOf } from './collab-sign.js';

const subtle = () => globalThis.crypto.subtle;
const HASH = { name: 'ECDSA', hash: 'SHA-256' };
export const KEY_ID = 8;
/** The editors a list names at most (#4745). */
export const MAX_EDITORS = 32;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const listText = (room, n, editors) => new TextEncoder().encode(`silinx-collab:editors:${room}:${n}:${editors.join('.')}`);
const fromB64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0));

const enrolText = (room, pub) => new TextEncoder().encode(`silinx-collab:enrol:${room}:${pub}`);

/** An editor's request to be listed: its public key, signed with the invitation key its link carries. */
export async function signEnrol(inviteKey, room, pub) {
  return { pub, sig: b64url(new Uint8Array(await subtle().sign(HASH, inviteKey, enrolText(room, pub)))) };
}

/** Whether a request to be listed is signed with the invitation key (its verifying key). */
export async function checkEnrol(inviteVerifier, room, req) {
  if (!req || !PUB_RE.test(String(req.pub)) || !SIG_RE.test(String(req.sig)) || !inviteVerifier) return false;
  try { return await subtle().verify(HASH, inviteVerifier, fromB64url(req.sig), enrolText(room, req.pub)); } catch { return false; }
}

/** An editor's key's id: its bytes and its text ({ bytes, text }). */
export async function keyId(pub) {
  const bytes = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(String(pub)))).slice(0, KEY_ID);
  return { bytes, text: b64url(bytes) };
}

/** Whether `list` has a list's shape (its signature not checked). */
export const isList = list => !!list && typeof list === 'object' && Number.isSafeInteger(list.n) && list.n > 0
  && Array.isArray(list.editors) && list.editors.length <= MAX_EDITORS && list.editors.every(p => PUB_RE.test(String(p)))
  && new Set(list.editors).size === list.editors.length && SIG_RE.test(String(list.sig));

/** The owner's list of a room's editors, signed with its key (core/collab-sign.js newSigner's). */
export async function signList(ownerKey, room, n, editors) {
  const sig = new Uint8Array(await subtle().sign(HASH, ownerKey, listText(room, n, editors)));
  return { n, editors: [...editors], sig: b64url(sig) };
}

/** Whether a list is the room's owner's (its signature, with the owner's verifying key). */
export async function checkList(ownerVerifier, room, list) {
  if (!isList(list) || !ownerVerifier) return false;
  try { return await subtle().verify(HASH, ownerVerifier, fromB64url(list.sig), listText(room, list.n, list.editors)); } catch { return false; }
}

// (each key imported once: a list renewed at each editor listed takes its keys again, 32 at most; the last few hundred
// kept)
const known = new Map();
const keyOf = pub => {
  let k = known.get(pub);
  if (!k) {
    const v = verifierOf(pub);
    v.catch(() => {});
    k = keyId(pub).then(id => [id.text, v]);
    known.set(pub, k);
    if (known.size > 512) known.delete(known.keys().next().value);
  }
  return k;
};

/** A list's keys, by their ids' text: Map<id, a promise of the verifying key>. */
export async function editorKeys(list) {
  return new Map(await Promise.all((list?.editors ?? []).map(keyOf)));
}

/** An editor's sealed frame signed with its key (`signer`: { key, id (keyId's) }): the frame, its key's id, the signature. */
export async function signEdit(signer, room, frame) {
  const named = new Uint8Array(frame.length + KEY_ID);
  named.set(frame);
  named.set(signer.id.bytes, frame.length);
  return signFrame(signer.key, room, named);
}

/** A signed edit checked against a list's keys (editorKeys'): { frame (without its key id), id (its text) }, or null when
 *  its key is not the list's or its signature is not that key's. */
export async function verifyEdit(keys, room, signed) {
  const s = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
  if (s.length <= SIG + KEY_ID + 1) return null;
  const id = b64url(s.subarray(s.length - SIG - KEY_ID, s.length - SIG));
  const v = keys?.get(id);
  if (!v) return null;
  const named = await verifyFrame(await v.catch(() => null), room, s).catch(() => null);
  return named ? { frame: named.subarray(0, named.length - KEY_ID), id } : null;
}

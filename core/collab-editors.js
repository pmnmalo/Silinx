// The editors of a room, as its owner lists them (#4745): the owner's page makes a key of its own (ECDSA P-256, as an
// editor's: core/collab-sign.js) when it shares a project with editors, and signs with it the list of the editors' public
// keys, numbered (`n`: a later list replaces an earlier one, never the reverse). The relay or host that runs the room
// takes the owner's public key at the open and every list it is given after (core/collab-room.js); the participants
// take the owner's public key from the link (core/collab-link.js) and the list from the project's document. An editor's
// change names the key it is signed with, by its id (8 bytes of its public key's SHA-256), and is taken only when that
// key is one of the list's.
//   list         = { n, editors: [public key, …], sig } (sig: the owner's, over the room, n and the keys)
//   signed edit  = [kind][iv][ciphertext][key id (8 bytes)][signature (64 bytes)]   (the signature over all before it)
import { b64url } from './collab-crypto.js';
import { PUB_RE, SIG, signFrame, verifyFrame, verifierOf } from './collab-sign.js';

const subtle = () => globalThis.crypto.subtle;
const HASH = { name: 'ECDSA', hash: 'SHA-256' };
export const KEY_ID = 8;
/** The editors a list names at most. */
export const MAX_EDITORS = 32;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const listText = (room, n, editors) => new TextEncoder().encode(`silinx-collab:editors:${room}:${n}:${editors.join('.')}`);
const fromB64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0));

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

/** A list's keys, by their ids' text: Map<id, a promise of the verifying key>. */
export async function editorKeys(list) {
  const keys = new Map();
  for (const pub of list?.editors ?? []) {
    const v = verifierOf(pub);
    v.catch(() => {});
    keys.set((await keyId(pub)).text, v);
  }
  return keys;
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

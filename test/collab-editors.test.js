// The editors of a room, as its owner lists them (#4745, core/collab-editors.js, core/collab-room.js): the owner's list of
// the editors' public keys, signed with its own key and numbered; an editor's edit naming its key. The list's signature
// over the room, its number and its keys (another room's, a key added, another number, another owner's: refused); the
// edits checked against the list's keys. The room (on sockets of the test's own): an owner's open with its key takes the
// lists it signs, each past the last (an earlier number, another key's signature: ignored); an edit is forwarded when
// its key is the last list's (a key never listed, or listed no longer: refused, said); a follower of the version before
// is refused at its join, said; a room of an older owner's page (one key for every editor, `editors`) is taken as
// before, its followers of either version; an owner's open giving both keys refused. Asleep (a platform's rooms made again
// from their sockets), the list kept. A key per editor (#4745, second part): an editor link's page asks to be listed
// with a key of its own, the request signed with the link's key, which the room gives to the owner only; listed, never
// with the link's key; past MAX_EDITORS (32), told it follows read only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyId, isList, signList, checkList, editorKeys, signEdit, verifyEdit, MAX_EDITORS, KEY_ID } from '../core/collab-editors.js';
import { collabRooms, ROOM_LIMITS, NEWER_NEEDED } from '../core/collab-room.js';
import { KIND, PROTOCOL } from '../core/collab-client.js';
import { OLDER_PROTOCOL } from '../core/collab-wire.js';
import { newKey, seal } from '../core/collab-crypto.js';
import { newSigner, verifierOf, signFrame, editIvs } from '../core/collab-sign.js';

const settle = () => new Promise(r => setTimeout(r, 30));
const ROOM = 'R'.repeat(22);
const editor = async () => { const s = await newSigner(); return { ...s, id: await keyId(s.pub) }; };

test('#4745 a list: signed by the owner over the room, its number and its keys; anything else refused', async () => {
  const owner = await newSigner(), other = await newSigner(), a = await editor(), b = await editor();
  const v = await verifierOf(owner.pub);
  const list = await signList(owner.key, ROOM, 1, [a.pub]);
  assert.equal(isList(list), true);
  assert.equal(await checkList(v, ROOM, list), true);
  assert.equal(await checkList(v, 'S'.repeat(22), list), false, 'another room');
  assert.equal(await checkList(v, ROOM, { ...list, editors: [a.pub, b.pub] }), false, 'a key added');
  assert.equal(await checkList(v, ROOM, { ...list, n: 2 }), false, 'another number');
  assert.equal(await checkList(await verifierOf(other.pub), ROOM, list), false, 'another owner\'s key');
  assert.equal(await checkList(null, ROOM, list), false);
  // its shape: a number from 1, distinct public keys (MAX_EDITORS at most), a signature
  for (const bad of [null, {}, { ...list, n: 0 }, { ...list, n: 1.5 }, { ...list, editors: [a.pub, a.pub] }, { ...list, editors: ['x'] }, { ...list, sig: 'x' }, { ...list, editors: Array(MAX_EDITORS + 1).fill(0).map((_, i) => a.pub.slice(0, 80) + String(i).padStart(6, '0')) }]) assert.equal(isList(bad), false, JSON.stringify(bad)?.slice(0, 60));
  assert.equal(isList(await signList(owner.key, ROOM, 2, [])), true, 'no editors: a list too');
  // a key's id: 8 bytes of its SHA-256, the same for the same key
  assert.equal((await keyId(a.pub)).bytes.length, KEY_ID);
  assert.equal((await keyId(a.pub)).text, a.id.text);
  assert.notEqual((await keyId(b.pub)).text, a.id.text);
});

test('#4745 an edit names its key: taken when the key is the list\'s, refused when not or when its id is another\'s', async () => {
  const owner = await newSigner(), a = await editor(), b = await editor();
  const keys = await editorKeys(await signList(owner.key, ROOM, 1, [a.pub]));
  const frame = Uint8Array.from([KIND.edit, ...Array(12).fill(1), 9, 9, 9]);
  const signed = await signEdit(a, ROOM, frame);
  assert.equal(signed.length, frame.length + KEY_ID + 64);
  assert.deepEqual(await verifyEdit(keys, ROOM, signed), { frame, id: a.id.text });
  assert.equal(await verifyEdit(keys, ROOM, await signEdit(b, ROOM, frame)), null, 'a key not listed');
  assert.equal(await verifyEdit(keys, 'S'.repeat(22), signed), null, 'another room');
  // b's signature naming a's id: refused
  assert.equal(await verifyEdit(keys, ROOM, await signEdit({ key: b.key, id: a.id }, ROOM, frame)), null);
  // the edit of the version before (no key id): refused
  assert.equal(await verifyEdit(keys, ROOM, await signFrame(a.key, ROOM, frame)), null);
  assert.equal(await verifyEdit(keys, ROOM, Uint8Array.from([3, 1])), null);
});

function socket() {
  const s = { readyState: 1, got: [], closed: null };
  s.send = (data, { binary } = {}) => s.got.push(binary ? [...data] : JSON.parse(data));
  s.close = (code, reason) => { s.readyState = 3; s.closed = [code, reason]; };
  return s;
}
const binaries = s => s.got.filter(m => Array.isArray(m));
const errors = s => s.got.filter(m => m.type === 'error').map(m => m.message);
const NOT_EDITOR = 'read only: this link cannot change the shared project (not an editor\'s)';

async function listedRoom() {
  const owner = await newSigner(), key = (await newKey()).key, states = new Map();
  const host = collabRooms({ limits: ROOM_LIMITS, keep: (ws, st) => states.set(ws, st) });
  const os = socket(), o = host.welcome(os, 'owner');
  o.message(JSON.stringify({ v: PROTOCOL, type: 'open', client: 1, owner: owner.pub }), false);
  const id = os.got[0].room;
  const list = async (n, pubs, by = owner) => o.message(JSON.stringify({ type: 'editors', list: await signList(by.key, id, n, pubs) }), false);
  const join = (client, v = PROTOCOL) => { const s = socket(), p = host.welcome(s, 'follower'); p.message(JSON.stringify({ v, type: 'join', room: id, client }), false); return [s, p]; };
  const ivs = editIvs();
  const edit = async (who, bytes = [1, 2, 3]) => signEdit(who, id, await seal(key, id, KIND.edit, Uint8Array.from(bytes), ivs()));
  return { host, os, o, id, list, join, edit, states };
}

test('#4745 the room: the owner\'s lists, each past the last; an edit forwarded when its key is the last list\'s', async () => {
  const { os, list, join, edit, host, id } = await listedRoom();
  const a = await editor(), b = await editor(), other = await newSigner();
  await list(1, [a.pub]);
  const [ws] = join(7), [, pa] = join(8), [bs, pb] = join(9);
  for (const s of [ws, bs]) s.got.length = 0;
  os.got.length = 0;
  pa.message(await edit(a), true);
  await settle();
  assert.equal(binaries(ws).length, 1, 'a\'s edit at a follower');
  assert.equal(binaries(os).length, 1, 'and at the owner');
  pb.message(await edit(b), true);
  await settle();
  assert.deepEqual([binaries(ws).length, errors(bs)], [1, [NOT_EDITOR]], 'b, not listed: refused, said');
  // a list signed by another key, or of a number not past the last: ignored
  await list(2, [b.pub], other);
  await list(1, [b.pub]);
  await settle();
  assert.deepEqual(host.rooms.get(id).list.editors, [a.pub]);
  // the next list: b in, a out
  await list(2, [b.pub]);
  await settle();
  pb.message(await edit(b), true);
  pa.message(await edit(a), true);
  await settle();
  assert.equal(binaries(ws).length, 2, 'b\'s edit through, a\'s refused');
  assert.equal(host.rooms.get(id).list.n, 2);
});

test('#4745 the version before: its followers refused at a listed room\'s join, said; its owner\'s room taken as before; both keys refused', async () => {
  const { join } = await listedRoom();
  const [old] = join(7, OLDER_PROTOCOL);
  assert.deepEqual([errors(old), old.closed], [[NEWER_NEEDED], [1008, 'refused']]);
  // an older owner's page: one key for every editor, its followers of either version
  const signer = await newSigner(), key = (await newKey()).key;
  const host = collabRooms({ limits: ROOM_LIMITS });
  const os = socket(), o = host.welcome(os, 'owner');
  o.message(JSON.stringify({ v: OLDER_PROTOCOL, type: 'open', client: 1, editors: signer.pub }), false);
  const id = os.got[0].room;
  const f = socket(), e = socket(), pe = host.welcome(e, 'follower');
  host.welcome(f, 'follower').message(JSON.stringify({ v: OLDER_PROTOCOL, type: 'join', room: id, client: 7 }), false);
  pe.message(JSON.stringify({ v: PROTOCOL, type: 'join', room: id, client: 8 }), false);
  assert.deepEqual([f.got[0].type, e.got[0].type], ['joined', 'joined']);
  pe.message(await signFrame(signer.key, id, await seal(key, id, KIND.edit, Uint8Array.from([1]), editIvs()())), true);
  await settle();
  assert.equal(binaries(f).length, 1, 'the one key\'s edit through');
  // an open with the owner's key and the editors' one key, or the owner's key in the version before: refused
  for (const msg of [{ v: PROTOCOL, owner: signer.pub, editors: signer.pub }, { v: OLDER_PROTOCOL, owner: signer.pub }]) {
    const s = socket();
    host.welcome(s, 'owner').message(JSON.stringify({ ...msg, type: 'open', client: 2 }), false);
    assert.deepEqual([errors(s), s.closed?.[0]], [['not a Silinx participant of this version'], 1008]);
  }
});

test('#4745 asleep: the room made again from its sockets keeps the owner\'s key and its last list', async () => {
  const { os, list, join, edit, states, id } = await listedRoom();
  const a = await editor(), b = await editor();
  await list(3, [a.pub]);
  const [ws] = join(7), [as] = join(8);
  await settle();
  assert.equal(states.get(os).list.n, 3);
  const host = collabRooms({ limits: ROOM_LIMITS });
  const out = host.restore([...states]);
  ws.got.length = 0;
  out.get(as).message(await edit(a), true);
  out.get(as).message(await edit(b), true);
  await settle();
  assert.equal(binaries(ws).length, 1, 'a\'s edit through, b\'s refused');
  assert.equal(host.rooms.get(id).list.n, 3);
});

test('#4745 the links carry the owner\'s key: a viewer\'s and an editor\'s, before the relay and the module; a broken one refused', async () => {
  const { followLink, parseFollowLink, withTop } = await import('../core/collab-link.js');
  const owner = await newSigner(), ed = await newSigner(), key = (await newKey()).text;
  const view = followLink('https://silinx.example.org/', ROOM, key, 'relay', null, 'https://relay.example.org', null, owner.pub);
  assert.equal(view, `https://silinx.example.org/#view=${ROOM}.${key}&owner=${owner.pub}&relay=${encodeURIComponent('https://relay.example.org')}`);
  assert.deepEqual(parseFollowLink(withTop(view, 'top')), { base: 'https://silinx.example.org/', room: ROOM, key, via: 'relay', sign: null, relay: 'https://relay.example.org', owner: owner.pub, top: 'top' });
  const edit = followLink('https://silinx.example.org/', ROOM, key, 'relay', ed.text, null, null, owner.pub);
  assert.deepEqual(parseFollowLink(edit), { base: 'https://silinx.example.org/', room: ROOM, key, via: 'relay', sign: ed.text, owner: owner.pub });
  // a link of before: no owner's key
  assert.equal(parseFollowLink(followLink('https://silinx.example.org/', ROOM, key)).owner, undefined);
  assert.throws(() => parseFollowLink(`https://silinx.example.org/#view=${ROOM}.${key}&owner=short`), /the link to follow is broken/);
  assert.throws(() => followLink('https://silinx.example.org/', ROOM, key, 'relay', null, null, null, 'short'), /not an owner's key/);
});

test('#4745 a request to be listed: signed with the editor link\'s key over the room and the public key; anything else refused', async () => {
  const { signEnrol, checkEnrol } = await import('../core/collab-editors.js');
  const invite = await newSigner(), other = await newSigner(), a = await newSigner();
  const v = await verifierOf(invite.pub);
  const req = await signEnrol(invite.key, ROOM, a.pub);
  assert.deepEqual(Object.keys(req), ['pub', 'sig'], 'its public key only, never its private half');
  assert.equal(await checkEnrol(v, ROOM, req), true);
  assert.equal(await checkEnrol(v, 'S'.repeat(22), req), false, 'another room');
  assert.equal(await checkEnrol(v, ROOM, { ...req, pub: other.pub }), false, 'another key');
  assert.equal(await checkEnrol(await verifierOf(other.pub), ROOM, req), false, 'another link\'s key');
  for (const bad of [null, {}, { pub: 'x', sig: req.sig }, { pub: a.pub, sig: 'x' }]) assert.equal(await checkEnrol(v, ROOM, bad), false);
});

test('#4745 the room: a follower\'s request to be listed to the owner only, marked as its; one too large, closed', async () => {
  const { os, join } = await listedRoom();
  const [ws] = join(7), [es, pe] = join(8);
  for (const s of [os, ws]) s.got.length = 0;
  pe.message(Uint8Array.from([KIND.enrol, 1, 2, 3]), true);
  await settle();
  assert.deepEqual(binaries(os), [[KIND.from, 0, 0, 0, 8, KIND.enrol, 1, 2, 3]], 'at the owner\'s, from 8');
  assert.deepEqual(binaries(ws), [], 'at no other follower\'s');
  pe.message(new Uint8Array(1025).fill(KIND.enrol), true);
  assert.equal(es.closed?.[0], 1008);
});

test('#4745 a key per editor: each editor link\'s page listed with a key of its own, never the link\'s; the 33rd told it follows read only', async () => {
  const { hostedRooms, socketPair } = await import('../core/collab-loop.js');
  const { shareRoom, followRoom } = await import('../core/collab-client.js');
  const { projectDoc, publishProject } = await import('../core/collab-doc.js');
  const until = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 5)); } };
  const h = hostedRooms();
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', files: [], fileTree: [] }, files: {}, owner: 'Ana' });
  const ownerErrors = [];
  const owner = await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors: true, WebSocket: h.owner, reconnect: false, onEvent: e => { if (e.type === 'error') ownerErrors.push(e.message); } });
  const S = function S() { const { client, room } = socketPair(); h.follower(room); return client; };
  const eds = [];
  try {
    for (let i = 0; i < MAX_EDITORS; i++) eds.push(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: owner.editKey, user: { name: `E${i}` }, WebSocket: S, reconnect: false }));
    await until(() => eds.every(e => e.listed), 'every editor listed');
    const list = doc.getMap('meta').get('editorsList');
    assert.equal(list.editors.length, MAX_EDITORS);
    assert.equal(new Set(list.editors).size, MAX_EDITORS, 'a key each');
    const invitePub = owner.editKey.slice(43);
    assert.ok(!list.editors.includes(invitePub), 'never the link\'s key');
    assert.deepEqual(eds.map(e => e.snapshot().own.slice(43)).sort(), [...list.editors].sort(), 'each its own, kept for its reload');
    const errs = [];
    const late = await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, owner: owner.ownerKey, sign: owner.editKey, user: { name: 'Late' }, WebSocket: S, reconnect: false, onEvent: e => { if (e.type === 'error') errs.push(e.message); } });
    eds.push(late);
    await until(() => errs.length, 'the 33rd told');
    assert.deepEqual(errs, [`this shared project has ${MAX_EDITORS} editors already: you follow it read only`]);
    assert.deepEqual(ownerErrors, [`an editor could not join: this shared project has ${MAX_EDITORS} editors already`]);
    assert.equal(late.editor, false);
  } finally {
    for (const e of eds) await e.close().catch(() => {});
    await owner.close();
  }
});

// A shared project's participants (#3180, #3181), in the page and in the MCP server alike: the owner, who shares a
// project's Yjs document (core/collab-doc.js), and a follower, who receives it read only. Both talk to a relay
// (server/collab-relay.js) over a WebSocket:
// at its share endpoint (the owner: the server's token in the subprotocols, `silinx-collab`, `token.<token>`) or its
// follow endpoint (a follower: `silinx-collab`):
//   text frames, JSON, the control:  { type: 'open', client }        -> { type: 'opened', room, resume }   (the owner;
//                                    resume: the secret of its room's { type: 'resume', room, resume, client } -> the
//                                    same, its connection lost, #3835)
//                                    { type: 'join', room, client }  -> { type: 'joined', owner }  (a follower; the
//                                                                       owner's client id)
//                                    the relay's { type: 'join' | 'leave', client }, { type: 'closed', reason },
//                                    { type: 'error', message }; the owner's { type: 'close' }
//   binary frames, sealed (core/collab-crypto.js): KIND.update (a Yjs update: the owner's only, the relay drops a
//                                    follower's), KIND.awareness (y-protocols' awareness: who is in, their view),
//                                    KIND.edit (an editor's Yjs update, signed with the editor link's key:
//                                    core/collab-sign.js; forwarded and applied only when its signature is the room's,
//                                    #3182; the room's public key in the owner's open, and in the document's meta),
//                                    KIND.from (#3360: a follower's awareness as the room forwards it, [KIND.from][its
//                                    client id, 4 bytes][the sealed frame]: the room's word for who sent it, so that a
//                                    follower's awareness speaks for that follower only), KIND.to (#3529: the owner's
//                                    frame for one follower, [KIND.to][its client id, 4 bytes][the sealed frame]: the
//                                    room gives the sealed frame to that follower only; the whole document a join asks
//                                    for, which the others have already), KIND.role (#3997: the owner's word to one
//                                    participant, in a KIND.to frame, of its role: { role: 'editor', sign } (the
//                                    editors' signing key: a viewer promoted, or an editor given the key renewed) or
//                                    { role: 'viewer' } (an editor demoted); the owner's { type: 'rekey', editors }
//                                    tells the room the editors' new public key, the old one's edits refused from then;
//                                    #4745: the owner's open gives its own key instead, `owner`, and its signed lists
//                                    of the editors' keys follow, { type: 'editors', list } (core/collab-editors.js),
//                                    in the document's meta too, `editorsList`: an edit names its key, which must be
//                                    the last list's; a demotion is a list without the old key),
//                                    KIND.activity (#4002: the owner's activity, { ch, v }: what it does by channel,
//                                    core/collab-activity.js; each channel's latest value sent again, for it only, to
//                                    a follower that joins; the room forwards none of a follower's, as any frame of
//                                    theirs but their awareness and an editor's signed edit)
// The relay never reads them: a hosted one, for the browser edition, can be the same.
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { newKey, keyOf, seal, unseal } from './collab-crypto.js';
import { newSigner, signerOf, verifierOf, signFrame, verifyFrame, SIGN_RE, editIvs, pubOf } from './collab-sign.js';
import { keyId, signList, checkList, editorKeys, signEdit, verifyEdit } from './collab-editors.js';
import { docTooLarge, docMeter, editOutside, updateOutside, FOLLOW_LIMITS } from './collab-doc.js';
import { activityBytes, activityOf, activityStore } from './collab-activity.js';
import { selectionValue, selectionPacer } from './collab-select.js';
import { PROTOCOL, SUBPROTOCOL, KIND, NOT_SHARED, fromFrame, toFrame, senderOf, roomUrl } from './collab-wire.js';
import { VIEW_MS, OWNER_VIEW_MS } from './collab-pace.js';

// (the wire's constants and its marked frames, in a module of their own that imports nothing: the Cloudflare relay's
// copy of the room's logic, #4541)
export { PROTOCOL, SUBPROTOCOL, KIND, NOT_SHARED, fromFrame, toFrame, senderOf };


/** An awareness update applied with only the states its sender may speak for (#3360): a follower's own (`only`, the
 *  client id the room says sent it), or any but this participant's own (the owner's, the room's authority: who is in
 *  for a newcomer); never this participant's own state. Returns the client ids applied. */
function applyAwarenessFrom(awareness, update, only = null) {
  const d = decoding.createDecoder(update);
  const e = encoding.createEncoder();
  const kept = [];
  const entries = [];
  for (let n = decoding.readVarUint(d); n > 0; n--) {
    const client = decoding.readVarUint(d), clock = decoding.readVarUint(d), state = decoding.readVarString(d);
    if (client === awareness.clientID || (only !== null && client !== only)) continue;
    entries.push([client, clock, state]);
    kept.push(client);
  }
  if (!entries.length) return kept;
  encoding.writeVarUint(e, entries.length);
  for (const [client, clock, state] of entries) { encoding.writeVarUint(e, client); encoding.writeVarUint(e, clock); encoding.writeVarString(e, state); }
  applyAwarenessUpdate(awareness, encoding.toUint8Array(e), 'remote');
  return kept;
}
/** The colours of the participants, by their client id. */
export const COLORS = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e8590c', '#0c8599', '#c2255c', '#5c940d'];
export const colorOf = client => COLORS[Math.abs(Number(client) || 0) % COLORS.length];
const OPEN_WAIT = 10_000;
// (#4850: a participant's page loaded again, its awareness's clock taken past the one the others knew of it, which they
// would otherwise keep, ignoring its state until its clock passed it)
const pastClock = (awareness, clock) => { if (Number.isSafeInteger(clock) && clock > 0) awareness.meta.set(awareness.clientID, { clock, lastUpdated: Date.now() }); };
const clockOf = awareness => awareness.meta.get(awareness.clientID)?.clock ?? 0;

// (#4759: a message, a frame or a send that fails said once per kind and connection, through `onFailure`, the next ones
// still handled: a failure never stops the chain)
function connection(url, WS, protocols, onControl, onFrame, onFailure = () => {}) {
  const ws = new WS(url, protocols);
  ws.binaryType = 'arraybuffer';
  const at = String(url).split('?')[0];   // (the relay's address, said without the room, #4541)
  let chain = Promise.resolve();   // (frames opened in their order: unsealing is asynchronous)
  const said = new Set();
  const failed = what => e => { if (said.has(what)) return; said.add(what); try { onFailure(`${what}: ${e?.message || e}`); } catch { /* the caller's */ } };
  const onMsg = failed('a message of the relay could not be handled'), onIn = failed('a change received could not be read');
  const onOut = failed('a change could not be sent');
  ws.addEventListener('message', ev => {
    if (typeof ev.data === 'string') {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch { /* not ours */ }
      if (msg && typeof msg.type === 'string') chain = chain.then(() => onControl(msg)).catch(onMsg);
    } else chain = chain.then(() => onFrame(new Uint8Array(ev.data))).catch(onIn);
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`cannot reach the relay at ${at}`)), { once: true });
    // (closed before it opened, or not opened in time: #3835, a rejoin waits for neither)
    ws.addEventListener('close', () => reject(new Error(`cannot reach the relay at ${at}`)), { once: true });
    setTimeout(() => reject(new Error(`cannot reach the relay at ${at}`)), OPEN_WAIT).unref?.();
  });
  let out = Promise.resolve();   // (sent in their order too)
  return {
    ws, opened,
    control: msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    frame: make => { out = out.then(make).then(f => { if (f && ws.readyState === 1) ws.send(f); }).catch(onOut); return out; },
  };
}

// the first answer of the relay to an open or a join (its error: thrown)
function firstAnswer(c, want) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('the relay does not answer')), OPEN_WAIT);
    c.first = msg => {
      if (msg.type === want) { clearTimeout(t); resolve(msg); return true; }
      if (msg.type === 'error' || msg.type === 'closed') { clearTimeout(t); reject(new Error(msg.message || msg.reason || 'refused by the relay')); return true; }
      return false;
    };
    c.ws.addEventListener('close', () => { clearTimeout(t); reject(new Error('the relay closed the connection')); }, { once: true });
  });
}

// the participants an awareness knows but `self`: [{ client, name, color, role, view }]; the owner is the client the
// relay says (a follower's own state could claim the role)
function peersOf(awareness, owner) {
  const out = [];
  for (const [client, st] of awareness.getStates()) {
    if (client === awareness.clientID || !st?.user) continue;
    // (an editor as it says: the room checks its edits, not its name)
    out.push({ client, name: String(st.user.name || '').slice(0, 64) || '?', color: colorOf(client), role: client === owner ? 'owner' : st.role === 'editor' ? 'editor' : 'viewer', view: viewOf(st.view) });
  }
  return out.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));
}
// (a view: the document, its cursor and its selection, #4192: core/collab-select.js; a view with no selection has none)
const viewOf = v => {
  if (!v || typeof v.path !== 'string') return null;
  const sel = selectionValue(v.sel);
  return { path: v.path, line: Number.isInteger(v.line) ? v.line : null, ch: Number.isInteger(v.ch) ? v.ch : null, ...(sel ? { sel } : {}) };
};

function participant({ conn, room, key, doc, awareness, owner, onEvent, viewMs = VIEW_MS }) {
  const send = (kind, bytes) => conn().frame(() => seal(key, room, kind, bytes));
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === 'local') send(KIND.awareness, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
  });
  awareness.on('change', () => onEvent({ type: 'peers' }));
  const pacer = selectionPacer({ ms: viewMs });   // (#4192: a selection dragged or typed, its views coalesced under the relay's rate, #4173; #4647: VIEW_MS)
  let wanted = JSON.stringify(awareness.getLocalState()?.view ?? null);
  return {
    room, doc, awareness,
    send,
    /** A frame for one follower only (#3529: the room gives it to that client). */
    sendTo: (client, kind, bytes) => conn().frame(async () => toFrame(client, await seal(key, room, kind, bytes))),
    /** The participants but this one: [{ client, name, color, role, view: { path, line, ch, sel? } | null }]. */
    peers: () => peersOf(awareness, owner()),
    /** What this participant looks at (null: nothing open): { path, line, ch, sel } (sel: its selection, #4192), sent
     *  when it changed, at most every `viewMs` (VIEW_MS, #4647; the last one always). */
    setView: view => {
      const v = viewOf(view), k = JSON.stringify(v);
      if (k === wanted) return;
      wanted = k;
      pacer.push(v, x => { if (JSON.stringify(awareness.getLocalState()?.view ?? null) !== JSON.stringify(x)) awareness.setLocalStateField('view', x); });
    },
    closed: () => conn().ws.readyState >= 2,
    /** Once what this participant sent before is on its way. */
    flush: () => conn().frame(() => null),
  };
}

// an editor's edit, at its arrival: applied when `checked(frame)` gives it back (its signature the room's; null: not)
// and `admit(bytes)` (#3527: what it changes, its size)
async function applyEdit(doc, key, room, checked, frame, admit = () => true) {
  const f = await checked(frame);
  if (!f) return false;
  const { bytes } = await unseal(key, room, f);
  if (!admit(bytes)) return false;
  Y.applyUpdate(doc, bytes, 'remote');
  return true;
}

// (#4745: an edit checked against the editors' one key, a room of an older owner's page's; or against the keys of the
// owner's list of them)
const byKey = (room, verifier) => async frame => { const v = await verifier(); return v ? verifyFrame(v, room, frame) : null; };
const byList = (room, keys) => async frame => (await verifyEdit(await keys(), room, frame))?.frame ?? null;

/** The owner shares `doc`: the room opened on the relay at `url` (its share endpoint, with the server's token).
 *  Returns { room, key (the link's), editKey (an editor link's, with `editors`), peers(), setView(), connected(),
 *  close(), ... }. onEvent({ type: 'peers' | 'closed' | 'error' | 'offline' | 'online', ... }). editors: editors may
 *  change it (their link signs, #3182); an editor's change refused (an error event) past `limits.total` or outside the
 *  files and the drawings (#3527).
 *  Its connection lost (#3835), not ended (`close()` not called, the room did not refuse it: REFUSED), the room is
 *  resumed (`reconnect`: RECONNECT; false: never) with the secret its open was answered with, through a new
 *  connection: an event { type: 'offline' } at its loss, { type: 'online' } once resumed; each follower then a join
 *  again (the whole document sent to it: what changed meanwhile). A room the relay no longer keeps (its grace past,
 *  the relay restarted): the session ends. viewMs: its view sent at most that often (core/collab-pace.js, #4647).
 *  resumed (#4850: its page loaded again, `doc` its document as it was, its client id the same): { key, sign (the
 *  editors' key), room, resume (the relay's secret: the room resumed, its links the same; null: a room the page hosts,
 *  opened again, the host naming it), clock (its awareness's) }, as snapshot() gave them; a room the relay no longer
 *  keeps: NOT_SHARED thrown. */
export async function shareRoom({ url, token = null, doc, user, editors = false, WebSocket: WS = globalThis.WebSocket, onEvent = () => {}, limits = FOLLOW_LIMITS, reconnect = RECONNECT, viewMs = OWNER_VIEW_MS, resumed = null }) {
  const { key, text } = resumed ? { key: await keyOf(resumed.key), text: resumed.key } : await newKey();
  let signer = !editors ? null : resumed?.sign ? { key: await signerOf(resumed.sign), text: resumed.sign, pub: pubOf(resumed.sign) } : await newSigner();
  // (#4745: the owner's own key, which signs its lists of the editors' keys; a page resumed from a record of before,
  // none: the room's one key, as before)
  const ownerKey = !signer ? null : resumed?.owner ? { key: await signerOf(resumed.owner), text: resumed.owner, pub: pubOf(resumed.owner) } : resumed?.sign ? null : await newSigner();
  let listN = Number.isSafeInteger(resumed?.n) ? resumed.n : 0, keys = new Map();
  // (the room's public key, for every participant: in the document; #4745: the owner's list instead)
  if (signer && !ownerKey) doc.getMap('meta').set('editors', signer.pub); else doc.getMap('meta').delete('editors');
  if (!ownerKey) doc.getMap('meta').delete('editorsList');
  let verifier = signer ? await verifierOf(signer.pub) : null;
  // (#4745: the editors' keys listed, signed, given to the room and to every participant)
  const publishList = async () => {
    const list = await signList(ownerKey.key, room, ++listN, [signer.pub]);
    keys = await editorKeys(list);
    doc.getMap('meta').set('editorsList', list);
    cur.control({ type: 'editors', list });
  };
  // (#3527: an editor's edit refused, said, when it changes another part than the files and the drawings, or would take
  // the document past what a follower takes)
  const meter = docMeter(doc);
  const admit = bytes => {
    const why = editOutside(doc, bytes) || meter.over(limits.total, bytes.length);
    if (why) { onEvent({ type: 'error', message: `an editor's change was refused: ${why}` }); return false; }
    meter.add(bytes.length);
    return true;
  };
  const awareness = new Awareness(doc);
  pastClock(awareness, resumed?.clock);
  awareness.setLocalState({ user, role: 'owner', view: null });
  const activity = activityStore();   // (#4002: the owner's activity, each channel's latest value)
  let p = null, room = null, resume = null, cur = null, resumes = resumed ? 1 : 0;   // (#4850: its room resumed, times)
  let ended = null, stopped = false, lostAt = null, timer = null;   // (why it ended; close() called; since when lost)
  // a frame for one follower, on the connection `c` (a join's answer: on the connection it came on)
  const sendTo = (c, client, kind, bytes) => c.frame(async () => toFrame(client, await seal(key, room, kind, bytes)));
  const control = async (c, msg) => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'join') {   // (someone joined: the whole document and who is in, for them only, #3529)
      const client = Number(msg.client);
      if (!Number.isSafeInteger(client) || client < 0 || client > 0xFFFFFFFF) return;
      await sendTo(c, client, KIND.update, Y.encodeStateAsUpdate(doc));
      await sendTo(c, client, KIND.awareness, encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]));
      for (const [ch, v] of activity.all()) await sendTo(c, client, KIND.activity, activityBytes(ch, v));
    } else if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
  };
  const frameIn = async frame => {
    if (frame[0] === KIND.edit) { await applyEdit(doc, key, room, ownerKey ? byList(room, () => keys) : byKey(room, () => verifier), frame, admit).catch(() => false); return; }
    // (a follower's awareness, marked by the room with who sent it: that follower's own state only, #3360; a follower's
    // update: never applied)
    const from = senderOf(frame);
    if (!from) return;
    const { kind, bytes } = await unseal(key, room, from.frame);
    if (kind === KIND.awareness) applyAwarenessFrom(awareness, bytes, from.client);
  };
  // a connection, opened and answered (`hello`: the open, or the resume): { c, answer }; its failure thrown
  const connect = async hello => {
    const c = connection(hello.type === 'resume' ? roomUrl(url, room) : url, WS, [SUBPROTOCOL, ...(token ? [`token.${token}`] : [])], msg => control(c, msg), frameIn, message => onEvent({ type: 'error', message }));
    try { await c.opened; } catch (e) { c.ws.close?.(); throw e; }
    const answer = firstAnswer(c, 'opened');
    c.control({ v: PROTOCOL, client: doc.clientID, ...hello });
    try { return { c, answer: await answer }; } catch (e) { c.ws.close(); throw e; }
  };
  const onUpdate = (u, origin) => { if (origin !== 'remote') p.send(KIND.update, u); };
  const end = reason => {
    if (ended) return;
    ended = reason;
    clearTimeout(timer);
    globalThis.removeEventListener?.('online', now);
    doc.off('update', onUpdate);
    meter.stop();
    awareness.destroy();
    onEvent({ type: 'closed', reason });
  };
  const use = c => {
    cur = c;
    c.ws.addEventListener('close', e => {
      if (c !== cur || ended) return;
      const why = c.closedReason || 'the connection to the relay ended';
      if (stopped || c.closedReason || REFUSED.includes(e?.code) || !reconnect || !resume) { end(why); return; }
      lostAt = Date.now();
      onEvent({ type: 'offline', reason: 'the connection to the relay was lost' });
      later(0);
    }, { once: true });
  };
  const later = n => {
    const ms = reconnect.delays[Math.min(n, reconnect.delays.length - 1)];
    if (Date.now() + ms - lostAt > reconnect.for) { end(`the connection to the relay was lost and could not be made again in ${Math.round(reconnect.for / 60_000)} minutes`); return; }
    timer = setTimeout(() => { timer = null; attempt(n); }, ms);
  };
  async function attempt(n) {
    let j;
    try { j = await connect({ type: 'resume', room, resume }); } catch (e) {
      if (ended) return;
      if (e.message === NOT_SHARED) end('the connection to the relay was lost and the relay no longer kept the room'); else later(n + 1);
      return;
    }
    if (ended) { j.c.ws.close(); return; }
    lostAt = null;
    resumes++;
    use(j.c);
    // (this participant's state, its clock past the one the followers knew: taken again where it timed out)
    awareness.setLocalState({ ...awareness.getLocalState() });
    onEvent({ type: 'online' });
  }
  // (the browser back online: the next try at once)
  function now() { if (timer !== null) { clearTimeout(timer); timer = null; attempt(0); } }
  let first;
  if (resumed?.resume) room = resumed.room;
  try { first = await connect(resumed?.resume ? { type: 'resume', room, resume: resumed.resume } : { type: 'open', ...(ownerKey ? { owner: ownerKey.pub } : signer ? { editors: signer.pub } : {}) }); } catch (e) { awareness.destroy(); meter.stop(); throw e; }
  ({ room } = first.answer);
  resume = typeof first.answer.resume === 'string' ? first.answer.resume : null;
  p = participant({ conn: () => cur, room, key, doc, awareness, owner: () => doc.clientID, onEvent, viewMs });
  use(first.c);
  // (#4745: a room opened, its first list; resumed, the relay has the last one, the document too)
  if (ownerKey && !resumed?.resume) await publishList();
  else if (ownerKey) keys = await editorKeys(doc.getMap('meta').get('editorsList'));
  if (reconnect) globalThis.addEventListener?.('online', now);
  doc.on('update', onUpdate);
  // a participant's role changed (#3997): the editors' key given to one viewer (promote); or the room's signing key
  // renewed (demote): the document's and the room's public key the new one, every other editor given it, the one
  // demoted told it is a viewer (its key, the old one, no longer the room's: the old editors' link then only views)
  const sendRole = (client, msg) => sendTo(cur, client, KIND.role, new TextEncoder().encode(JSON.stringify(msg)));
  const known = client => p.peers().find(x => x.client === client && x.role !== 'owner');
  const roles = {
    promote: async client => {
      if (!signer) throw new Error('this project is shared with no editors');
      if (!known(client)) throw new Error('no such participant');
      await sendRole(client, { role: 'editor', sign: signer.text });
    },
    demote: async client => {
      if (!signer) throw new Error('this project is shared with no editors');
      if (!known(client)) throw new Error('no such participant');
      const others = p.peers().filter(x => x.role === 'editor' && x.client !== client).map(x => x.client);
      signer = await newSigner();
      verifier = await verifierOf(signer.pub);
      if (ownerKey) await publishList();   // (#4745: a list without the old key)
      else { doc.getMap('meta').set('editors', signer.pub); cur.control({ type: 'rekey', editors: signer.pub }); }
      await sendRole(client, { role: 'viewer' });
      for (const c of others) await sendRole(c, { role: 'editor', sign: signer.text });
      return signer.text;
    },
  };
  return {
    ...p, key: text, ...roles,
    /** The owner's activity on a channel (#4002): sent to every follower when it changed, kept for those who join.
     *  Throws when the channel's name or the value's size is not one; false: unchanged (or past the channels' number). */
    publish: (ch, value) => {
      const bytes = activityBytes(ch, value);
      if (ended || !activity.set(ch, value)) return false;
      p.send(KIND.activity, bytes);
      return true;
    },
    /** An editor link's key (with `editors`; renewed by a demotion, #3997). */
    get editKey() { return signer?.text || null; },
    /** The owner's public key, which the links carry (#4745; null: a room with no editors, or one of before). */
    get ownerKey() { return ownerKey?.pub || null; },
    /** What resumes it once its page is loaded again (#4850: shareRoom's `resumed`, its document's state and client id
     *  too): { client, doc, key, sign, owner (#4745: the owner's key), n (its last list's number), room, resume, clock }. */
    snapshot: () => ({ client: doc.clientID, doc: Y.encodeStateAsUpdate(doc), key: text, sign: signer?.text || null, owner: ownerKey?.text || null, n: listN, room, resume, clock: clockOf(awareness) }),
    /** How many times its room was resumed (#4850: its connection lost, or its page reloaded: `resumed`). */
    resumes: () => resumes,
    closed: () => ended !== null,
    /** Connected now (false: its connection lost, the room being resumed, or the session ended). */
    connected: () => !ended && lostAt === null,
    /** Stops sharing: the room closed for everyone. */
    close: async () => {
      stopped = true;
      if (lostAt !== null) { end('sharing stopped'); return; }
      cur.closedReason = 'sharing stopped'; cur.control({ type: 'close' }); await cur.frame(() => null); cur.ws.close();
    },
  };
}


/** Why a follower's session ended when it left on its own (close(), #4201). */
export const LEFT = 'you stopped following';
/** A follower's connection lost (#3835, phase 4 of #3180), not ended, made again: after these delays (the last one
 *  repeated), for `for` ms at most since it was lost. */
export const RECONNECT = Object.freeze({ delays: [1000, 2000, 4000, 8000, 15_000], for: 5 * 60_000 });
// (the close codes of a connection the room ended itself: a refusal, a frame too large; never made again)
const REFUSED = [1003, 1008, 1009];

/** A follower joins a room with its link's key: { doc (the project, as it arrives), ready (resolves once it has
 *  arrived), peers(), owner(), setView(), activity(ch) (the owner's, #4002: an event { type: 'activity', ch } when a
 *  channel's value changed), connected(), close() }. Read only: nothing it does reaches the owner but its
 *  view. With `sign` (an editor link's key, #3182), an editor: what changes in its document (core/collab-doc.js
 *  editFile) is sent, signed, to everyone. A room whose document passes `limits` (its files, their total size:
 *  core/collab-doc.js FOLLOW_LIMITS, #3361; its bytes, a root of no shared project's, #3527) is left at once: an error
 *  event ({ fatal: true }), `ready` rejected, nothing more applied.
 *  Its connection lost once the project has arrived (#3835), not ended (the owner did not stop sharing, `close()` was
 *  not called, no limit was passed, the room did not refuse it: REFUSED), it is made again (`reconnect`: RECONNECT; false: never), with the same document
 *  and client id, through a new socket of `transport()` (a WebSocket class; null: none, the session ends; an error: tried
 *  again later; default: `WebSocket` again): an event { type: 'offline', reason } at its loss, { type: 'online' } once joined again. The owner
 *  sends the whole document again, as at any join; an editor then sends, signed, what of its own changes the owner's
 *  document lacks (its own updates past the owner's clock of it): nothing it changed meanwhile is lost. */
export async function followRoom({ url, room, key: keyText, sign = null, owner: ownerPub = null, user, WebSocket: WS = globalThis.WebSocket, onEvent = () => {}, limits = FOLLOW_LIMITS, reconnect = RECONNECT, transport = null, viewMs = VIEW_MS, resumed = null }) {
  const key = await keyOf(keyText);
  let signer = sign ? await signerOf(sign) : null, signText = signer ? sign : null;
  // (#4850: its page loaded again: its document as it was, its client id the same, its own changes kept)
  const doc = resumed?.doc || new Y.Doc();
  const awareness = new Awareness(doc);
  pastClock(awareness, resumed?.clock);
  awareness.setLocalState({ user, role: signer ? 'editor' : 'follower', view: null });
  const activity = activityStore();   // (#4002: the owner's activity as it arrives)
  // (the room's public key, from the owner's document: an editor's edit checked with it; #4745: the owner's list of the
  // editors' keys, from the document, taken when its signature is the key's the link gives)
  let verifier = null, verifierPub = null;
  const verifierOfDoc = async () => {
    const pub = doc.getMap('meta').get('editors');
    if (pub !== verifierPub) { verifierPub = pub; verifier = typeof pub === 'string' ? await verifierOf(pub).catch(() => null) : null; }
    return verifier;
  };
  const ownerVerifier = ownerPub ? verifierOf(ownerPub) : null;
  ownerVerifier?.catch(() => {});
  let listed = null, listedKeys = new Map();
  const keysOfDoc = async () => {
    const list = doc.getMap('meta').get('editorsList');
    if (list?.sig !== listed?.sig && (list?.n ?? 0) > (listed?.n ?? 0) && await checkList(await ownerVerifier.catch(() => null), room, list)) { listed = list; listedKeys = await editorKeys(list); }
    return listedKeys;
  };
  const checked = ownerPub ? byList(room, keysOfDoc) : byKey(room, verifierOfDoc);
  // (#4745: the key this editor signs with, by its id)
  let signerId = signer && ownerPub ? await keyId(pubOf(sign)) : null;
  let synced, failed = null, arrived = false;
  const ready = new Promise((resolve, reject) => { synced = () => { arrived = true; resolve(); }; failed = reject; });
  ready.catch(() => {});
  let warned = false, left = false;
  let cur = null, owner = null, away = false, backs = 0;   // (the connection now; the owner's client id; the owner away, back how often, #4850)
  let ended = null, stopped = false, lostAt = null, timer = null;   // (why it ended; close() called; since when lost)
  // (the document past what a follower takes: left, said once; #3527: its bytes, whatever they hold, the updates and
  // the edits received counted; an editor's edit the owner refuses, refused here too, not applied)
  const meter = docMeter(doc);
  const capped = (c, n = 0, why = null) => {
    meter.add(n);
    why ||= docTooLarge(doc, limits) || meter.over(limits.total);
    if (!why) return false;
    left = true;
    onEvent({ type: 'error', message: why, fatal: true });
    failed(new Error(why));
    c.closedReason = why;
    c.ws.close();
    return true;
  };
  // an editor's own changes, signed (what arrives is 'remote': never sent again), and kept (#3835: what of them the
  // owner lacks sent again at a rejoin, those sent into a connection that was already lost included)
  const mine = resumed?.mine ? [resumed.mine] : [];
  // (#4736: sealed with this session's IVs, a counter in each, in the order they are sent)
  const nextIv = editIvs();
  const sendEdit = u => cur.frame(async () => { const f = await seal(key, room, KIND.edit, u, nextIv()); return ownerPub ? signEdit({ key: signer, id: signerId }, room, f) : signFrame(signer, room, f); });
  let listening = false;
  const listen = on => { if (on && !listening) doc.on('update', onUpdate); else if (!on && listening) doc.off('update', onUpdate); listening = on; };
  const onUpdate = (u, origin) => {
    if (origin === 'remote') return;
    mine.push(u);
    if (mine.length > 32) mine.splice(0, mine.length, Y.mergeUpdates(mine));
    sendEdit(u);
  };
  // (the whole document, as the owner sends it at a join: every client's from its start, the owner's first; again
  // once it has arrived, the owner's room resumed (#3835): this participant's state sent again, its clock past the one
  // the owner knew, which may have timed out meanwhile)
  const catchUp = (bytes, again) => {
    const { from, to } = Y.parseUpdateMeta(bytes);
    if (from.get(owner) !== 0) return;
    if (again && lostAt === null) awareness.setLocalState({ ...awareness.getLocalState() });
    if (!signer || !mine.length) return;
    const theirs = Y.encodeStateVector(new Map([[doc.clientID, to.get(doc.clientID) ?? 0]]));
    sendEdit(Y.diffUpdate(Y.mergeUpdates(mine), theirs));
  };
  const control = (c, msg) => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
    // (#4850: the owner's connection lost, its room kept for its resume (its page loaded again): its state forgotten,
    // its clock too (taken again as it comes back); back, the whole document comes again)
    else if (msg.type === 'away' && !away) {
      away = true;
      if (owner !== null) { removeAwarenessStates(awareness, [owner], 'relay'); awareness.meta.delete(owner); }
      onEvent({ type: 'away', grace: Number.isSafeInteger(msg.grace) && msg.grace > 0 ? msg.grace : null });
    } else if (msg.type === 'back' && away) { away = false; backs++; onEvent({ type: 'back' }); }
  };
  const frameIn = async (c, frame) => {
    if (left || ended) return;
    if (frame[0] === KIND.edit) { let n = 0; if (await applyEdit(doc, key, room, checked, frame, b => { n = b.length; return !editOutside(doc, b) && !meter.over(limits.total, n); }).catch(() => false)) capped(c, n); return; }
    // (another follower's awareness, marked by the room with who sent it, #3360; anything else is the owner's)
    const from = senderOf(frame);
    let m;
    try { m = await unseal(key, room, from ? from.frame : frame); } catch (e) {
      if (!warned) { warned = true; onEvent({ type: 'error', message: e.message }); failed(e); }
      return;
    }
    if (from) { if (m.kind === KIND.awareness) applyAwarenessFrom(awareness, m.bytes, from.client); return; }
    if (m.kind === KIND.update) {
      // (#3527: an update that changes a root of no shared project's: left, not applied)
      const outside = updateOutside(doc, m.bytes);
      if (!outside) Y.applyUpdate(doc, m.bytes, 'remote');
      const again = arrived;
      if (!capped(c, m.bytes.length, outside)) { synced(); if (!outside) catchUp(m.bytes, again); }
    }
    else if (m.kind === KIND.awareness) applyAwarenessFrom(awareness, m.bytes);   // (the owner's: who is in)
    else if (m.kind === KIND.role) await roleIn(m.bytes);
    else if (m.kind === KIND.activity) { const a = activityOf(m.bytes); if (a && activity.set(a.ch, a.v)) onEvent({ type: 'activity', ch: a.ch }); }
  };
  // (#3997: the owner's word of this participant's role: an editor, with the editors' key (a viewer promoted, or the key
  // renewed: what of its own changes the owner may lack sent again, signed with the new one), or a viewer again)
  const roleIn = async bytes => {
    let msg = null;
    try { msg = JSON.parse(new TextDecoder().decode(bytes)); } catch { return; }
    if (msg?.role === 'editor' && SIGN_RE.test(String(msg.sign))) {
      // (the key, its text and its id taken at once, the role said with them: an edit sent in between named the old
      // key's id with the new key, and a page saw the new key before its role, #5011)
      const next = await signerOf(msg.sign), id = ownerPub ? await keyId(pubOf(msg.sign)) : signerId;
      const was = !!signer;
      signer = next;
      signText = msg.sign;
      signerId = id;
      listen(true);
      awareness.setLocalStateField('role', 'editor');
      if (mine.length) sendEdit(Y.mergeUpdates(mine));
      onEvent({ type: 'role', role: 'editor', sign: msg.sign, renewed: was });
    } else if (msg?.role === 'viewer' && signer) {
      signer = null;
      signText = null;
      listen(false);
      mine.length = 0;
      awareness.setLocalStateField('role', 'follower');
      onEvent({ type: 'role', role: 'viewer' });
    }
  };
  // a connection, joined: { c, owner }; its failure thrown (the relay's answer: its message)
  const join = async S => {
    const c = connection(roomUrl(url, room), S, [SUBPROTOCOL], msg => control(c, msg), f => frameIn(c, f), message => onEvent({ type: 'error', message }));
    try { await c.opened; } catch (e) { c.ws.close?.(); throw e; }
    const answer = firstAnswer(c, 'joined');
    c.control({ type: 'join', v: PROTOCOL, room, client: doc.clientID });
    try { return { c, owner: Number((await answer).owner) }; } catch (e) { c.ws.close(); throw e; }
  };
  const end = reason => {
    if (ended) return;
    ended = reason;
    clearTimeout(timer);
    globalThis.removeEventListener?.('online', now);
    doc.off('update', onUpdate);
    awareness.destroy();
    failed(new Error(reason));
    onEvent({ type: 'closed', reason, ...(stopped ? { stopped: true } : {}) });   // (stopped: by this participant, #4201)
  };
  // the connection now: its end, an end of the session or a loss
  const use = c => {
    cur = c;
    c.ws.addEventListener('close', e => {
      if (c !== cur || ended) return;
      const why = c.closedReason || 'the connection to the relay ended';
      // (the room's own end of it, a refusal or a frame too large: never made again)
      if (stopped || left || c.closedReason || REFUSED.includes(e?.code) || !reconnect || !arrived) { end(why); return; }
      lostAt = Date.now();
      away = false;   // (#4850: told again once joined)
      // (the others gone until the owner says again who is in: their clocks forgotten, so that their states, sent
      // again as they are, are taken)
      const others = [...awareness.getStates().keys()].filter(k => k !== doc.clientID);
      removeAwarenessStates(awareness, others, 'relay');
      for (const k of others) awareness.meta.delete(k);
      onEvent({ type: 'offline', reason: 'the connection to the relay was lost' });
      later(0);
    }, { once: true });
  };
  const minutes = ms => `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`;
  const later = n => {
    const ms = reconnect.delays[Math.min(n, reconnect.delays.length - 1)];
    if (Date.now() + ms - lostAt > reconnect.for) { end(`the connection was lost and could not be made again in ${minutes(reconnect.for)}`); return; }
    timer = setTimeout(() => { timer = null; attempt(n); }, ms);
  };
  async function attempt(n) {
    let S = null;
    // (a transport that fails, the owner not found at the meeting point yet: tried again later; none: the end)
    try { S = transport ? await transport() : WS; } catch { if (!ended) later(n + 1); return; }
    if (ended) return;
    if (!S) { end('the connection was lost and cannot be made again from here'); return; }
    let j;
    try { j = await join(S); } catch (e) {
      if (ended) return;
      if (e.message === NOT_SHARED) end(NOT_SHARED); else later(n + 1);
      return;
    }
    if (ended) { j.c.ws.close(); return; }
    lostAt = null;
    use(j.c);
    // (this participant's state, its clock past the one the others knew: theirs, removed at its leave, taken again)
    awareness.setLocalState({ ...awareness.getLocalState() });
    onEvent({ type: 'online' });
  }
  // (the browser back online: the next try at once)
  function now() { if (timer !== null) { clearTimeout(timer); timer = null; attempt(0); } }
  let first;
  try { first = await join(WS); } catch (e) { awareness.destroy(); throw e; }
  owner = first.owner;
  const p = participant({ conn: () => cur, room, key, doc, awareness, owner: () => owner, onEvent, viewMs });
  use(first.c);
  if (reconnect) globalThis.addEventListener?.('online', now);
  p.send(KIND.awareness, encodeAwarenessUpdate(awareness, [doc.clientID]));
  if (signer) listen(true);
  return {
    ...p, ready,
    /** An editor now (its link's, or the owner's word since, #3997). */
    get editor() { return !!signer; },
    /** The editors' key it signs with (null: a viewer). */
    sign: () => (signer ? signText : null),
    /** The owner's activity on a channel, as it last arrived (#4002; null: none yet): untrusted, checked by its reader. */
    activity: ch => activity.get(ch),
    owner: () => p.peers().find(x => x.role === 'owner') || null,
    closed: () => ended !== null,
    /** Joined now (false: its connection lost, being made again, or the session ended). */
    connected: () => !ended && lostAt === null,
    /** The owner away (#4850): its connection lost, the relay keeping its room for its resume (events 'away', 'back'). */
    away: () => !ended && lostAt === null && away,
    /** How many times the owner came back (#4850: its room resumed after it was away). */
    resumes: () => backs,
    /** What follows it again once its page is loaded again (#4850: followRoom's `resumed`, its document's state and
     *  client id): { client, doc, mine (its own changes, an editor's), clock, sign (the editors' key it signs with now) }. */
    snapshot: () => ({ client: doc.clientID, doc: Y.encodeStateAsUpdate(doc), mine: signer && mine.length ? Y.mergeUpdates(mine) : null, clock: clockOf(awareness), sign: signer ? signText : null }),
    close: async () => {
      stopped = true;
      // (its own end, #4201: said as such, not as a connection lost)
      if (lostAt !== null) { end(LEFT); return; }
      cur.closedReason = LEFT;
      await cur.frame(() => null);
      cur.ws.close();
    },
  };
}

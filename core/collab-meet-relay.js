// A relay as the meeting point of a room the owner's page hosts (#4542; the public trackers' and the codes, #3227, stay
// the others): the owner's page (the host) and each follower meet at the relay's meeting point (core/collab-meeting.js:
// Silinx's relay, or the Cloudflare relay), which carries their WebRTC signalling, and their messages until a direct
// path connects; then they go peer to peer, over a data channel, per follower and on their own: a follower whose
// direct path fails (a network that lets no UDP through) goes on through the relay. The relay sees no message: each is
// sealed with the link's key (the signalling too: no address of theirs reaches it). Its order is kept when a peer
// switches to the direct path: the sender's last message through the relay says so (`switch`), and the channel's
// messages wait for it. The room's checks are the owner's page's (core/collab-loop.js hostedRooms): a follower's edit
// refused, their awareness for themselves only, its rate, an editor's signature.
//   relayMeeting({ url (the relay's address, http(s)), token (the host's: the relay's key or the server's token),
//   WebSocket, RTC (a WebRTC connection's class; none: the relay only, as in node), iceServers (the STUN servers, from
//   the user's list) }) -> a meeting point (core/collab-meet.js): { join({ topic, password, maxReceive, accept,
//   answers }) -> a meeting }; a meeting's `via(id)` says how a peer's messages go: 'relay' or 'direct', and
//   `onVia(f(id, via))` is told when that changes (#4643: the Collaboration tab's P2P / Relay per follower).
import { keyOf, seal, unseal, b64url } from './collab-crypto.js';
import { SUBPROTOCOL } from './collab-wire.js';
import { MEET_PROTOCOL, ID_BYTES } from './collab-meeting.js';
import { splitFrame, frameJoiner } from './collab-frag.js';

const M = Object.freeze({ text: 1, bytes: 2, signal: 3, switch: 4 });   // (a sealed message's kinds)
const LABEL = 'silinx-meet';
const GATHER_MS = 4000, CONNECT_MS = 20_000, WELCOME_MS = 10_000;
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const enc = new TextEncoder(), dec = new TextDecoder();

/** A relay's meeting point's WebSocket address (role: 'host' | 'peer'). */
export function meetUrl(base, role, topic) {
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/api/collab/meet/${role}`;
  u.search = `?topic=${encodeURIComponent(topic)}`;
  u.hash = '';
  return u.href;
}

// a description's candidates gathered whole (or what came in GATHER_MS)
const gathered = pc => new Promise(resolve => {
  if (pc.iceGatheringState === 'complete') { resolve(); return; }
  const t = setTimeout(resolve, GATHER_MS);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
});

export function relayMeeting({ url, token = null, WebSocket: WS = globalThis.WebSocket, RTC = globalThis.RTCPeerConnection, iceServers = [] }) {
  return {
    async join({ topic, password, maxReceive = 16 << 20, accept = () => true, answers = true }) {
      const key = await keyOf(password);
      const ws = new WS(meetUrl(url, answers ? 'host' : 'peer', topic), [SUBPROTOCOL, ...(answers && token ? [`token.${token}`] : [])]);
      ws.binaryType = 'arraybuffer';
      const on = { peer: () => {}, leave: () => {}, via: () => {}, data: null };
      const early = [];   // (what came before onData: kept for it)
      const peers = new Map();   // id -> { out: 'relay' | 'direct', switched (its messages through the channel taken), held, pc, dc, join }
      let self = null, left = false, out = Promise.resolve();
      // (through the relay: sealed, in their order)
      const viaRelay = (id, kind, bytes) => {
        out = out.then(async () => {
          const s = await seal(key, topic, kind, bytes);
          const f = new Uint8Array(ID_BYTES + s.length);
          f.set(unb64(id));
          f.set(s, ID_BYTES);
          if (ws.readyState === 1) ws.send(f);
        }).catch(() => {});
        return out;
      };
      const deliver = (id, d) => {
        if (left || !peers.has(id) || !accept(id, typeof d === 'string' ? d.length : d.byteLength)) return;
        if (on.data) on.data(id, d); else early.push([id, d]);
      };
      const fallBack = p => {
        if (!p.dc && !p.pc) return;
        const was = p.out;
        p.out = 'relay';
        p.switched = true;   // (what the channel held, taken: the relay's messages from now)
        for (const d of p.held.splice(0)) deliver(p.id, d);
        try { p.pc?.close(); } catch { /* closed */ }
        p.pc = p.dc = null;
        if (was !== 'relay' && peers.has(p.id)) on.via(p.id, 'relay');
      };
      // a data channel open: the switch said through the relay, its last message, then the channel
      const use = (p, dc) => {
        dc.binaryType = 'arraybuffer';
        const opened = () => { if (!peers.has(p.id)) return; p.dc = dc; viaRelay(p.id, M.switch, new Uint8Array(0)); p.out = 'direct'; on.via(p.id, 'direct'); };
        if (dc.readyState === 'open') opened(); else dc.addEventListener('open', opened, { once: true });
        dc.addEventListener('message', e => {
          let d = e.data;
          if (typeof d !== 'string') { try { d = p.join.push(new Uint8Array(d)); } catch { fallBack(p); return; } if (!d) return; }
          if (p.switched) deliver(p.id, d); else p.held.push(d);
        });
        dc.addEventListener('close', () => { if (p.dc === dc) fallBack(p); }, { once: true });
      };
      const rtc = p => {
        const pc = new RTC({ iceServers });
        p.pc = pc;
        pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' && p.pc === pc) fallBack(p); });
        // (no direct path in time: the relay's; the timer keeps no process alive, node's)
        setTimeout(() => { if (p.pc === pc && p.out !== 'direct') fallBack(p); }, CONNECT_MS).unref?.();
        return pc;
      };
      const add = id => {
        if (peers.has(id)) return null;
        const p = { id, out: 'relay', switched: false, held: [], pc: null, dc: null, join: frameJoiner(maxReceive) };
        peers.set(id, p);
        return p;
      };
      // (the follower offers, the host answers: a description gathered whole, no trickle)
      const offer = async p => {
        if (!RTC) return;
        const pc = rtc(p);
        use(p, pc.createDataChannel(LABEL, { ordered: true }));
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        if (p.pc === pc) viaRelay(p.id, M.signal, enc.encode(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp })));
      };
      const signal = async (p, bytes) => {
        let msg = null;
        try { msg = JSON.parse(dec.decode(bytes)); } catch { return; }
        if (typeof msg?.sdp !== 'string' || msg.sdp.length > 16 << 10) return;
        if (msg.type === 'offer' && answers && RTC && !p.pc) {
          const pc = rtc(p);
          pc.addEventListener('datachannel', ev => { if (ev.channel.label === LABEL && p.pc === pc) use(p, ev.channel); else ev.channel.close(); });
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
          await pc.setLocalDescription(await pc.createAnswer());
          await gathered(pc);
          if (p.pc === pc) viaRelay(p.id, M.signal, enc.encode(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp })));
        } else if (msg.type === 'answer' && !answers && p.pc && !p.pc.remoteDescription) {
          await p.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }).catch(() => fallBack(p));
        }
      };
      let chain = Promise.resolve();
      const binaryIn = data => {
        const f = new Uint8Array(data);
        if (f.length <= ID_BYTES) return;
        const id = b64url(f.subarray(0, ID_BYTES)), p = peers.get(id);
        if (!p) return;
        chain = chain.then(async () => {
          let m;
          try { m = await unseal(key, topic, f.subarray(ID_BYTES)); } catch { return; }
          if (m.kind === M.text) deliver(id, dec.decode(m.bytes));
          else if (m.kind === M.bytes) deliver(id, m.bytes);
          else if (m.kind === M.signal) await signal(p, m.bytes).catch(() => fallBack(p));
          else if (m.kind === M.switch) { p.switched = true; for (const d of p.held.splice(0)) deliver(id, d); }
        });
      };
      const gone = id => { const p = peers.get(id); if (!p) return; peers.delete(id); try { p.pc?.close(); } catch { /* closed */ } on.leave(id); };
      const welcome = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('the relay\'s meeting point does not answer')), WELCOME_MS);
        ws.addEventListener('message', ev => {
          if (typeof ev.data !== 'string') { binaryIn(ev.data); return; }
          let msg = null;
          try { msg = JSON.parse(ev.data); } catch { return; }
          if (msg?.type === 'welcome') { clearTimeout(t); if (!answers && typeof msg.host === 'string') add(msg.host); resolve(msg); }
          else if (msg?.type === 'error') { clearTimeout(t); reject(new Error(String(msg.message || 'refused by the relay'))); }
          else if (msg?.type === 'peer' && answers && typeof msg.id === 'string' && add(msg.id)) on.peer(msg.id);
          else if (msg?.type === 'leave') { if (msg.id === null || msg.id === undefined) for (const id of [...peers.keys()]) gone(id); else gone(msg.id); }
        });
        ws.addEventListener('close', () => { clearTimeout(t); reject(new Error('the relay closed the connection')); for (const id of [...peers.keys()]) gone(id); });
        ws.addEventListener('error', () => {});
      });
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('close', () => reject(new Error(`cannot reach the relay at ${new URL(url).origin}`)), { once: true });
      });
      ws.send(JSON.stringify({ type: 'hello', v: MEET_PROTOCOL }));
      const w = await welcome;
      self = w.self;
      // (a follower's one peer: the host, offered a direct path)
      if (!answers) setTimeout(() => { const p = peers.get(w.host); if (p) { on.peer(w.host); offer(p).catch(() => fallBack(p)); } }, 0);
      return {
        self,
        onPeer: f => { on.peer = f; }, onLeave: f => { on.leave = f; }, onVia: f => { on.via = f; }, onData: f => { on.data = f; for (const [id, d] of early.splice(0)) f(id, d); },
        send: (id, d) => {
          const p = peers.get(id);
          if (!p || left) return;
          if (p.out === 'direct' && p.dc?.readyState === 'open') { if (typeof d === 'string') p.dc.send(d); else for (const x of splitFrame(d)) p.dc.send(x); return; }
          viaRelay(id, typeof d === 'string' ? M.text : M.bytes, typeof d === 'string' ? enc.encode(d) : d);
        },
        // (the relay's ids: its word for who is who, as the room's on a relay; the owner's proof binds them)
        binding: async id => (peers.has(id) ? { local: self, remote: id } : null),
        via: id => peers.get(id)?.out ?? null,
        drop: id => gone(id),
        leave: async () => {
          if (left) return;
          left = true;
          await out;
          for (const p of peers.values()) { try { p.pc?.close(); } catch { /* closed */ } }
          ws.close();
        },
      };
    },
  };
}

// A WebRTC of the tests' own (#4542), as much of RTCPeerConnection as core/collab-meet-relay.js uses, in node: an
// offer's and an answer's descriptions name their connections, and an answer taken connects them: their data channels
// open, each message delivered to the other end (later, as a network would), counted. A network that lets no direct
// path through (`blocked`) fails the connection instead, as a network with no UDP does.
//   fakeRtc({ blocked }) -> { RTC (the class), net: { sent (messages sent over the channels), connections }, cut()
//   (every connection's path lost: its channels closed) }
export function fakeRtc({ blocked = () => false } = {}) {
  const pcs = new Map();
  const net = { sent: 0, connections: 0 };
  let seq = 0;
  const later = f => setImmediate(f);
  const fire = (t, type, props = {}) => t.dispatchEvent(Object.assign(new Event(type), props));

  class Channel extends EventTarget {
    constructor(label) { super(); this.label = label; this.readyState = 'connecting'; this.binaryType = 'blob'; this.peer = null; }
    send(d) {
      if (this.readyState !== 'open') throw new Error('the channel is not open');
      net.sent++;
      const v = typeof d === 'string' ? d : new Uint8Array(d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d).slice().buffer;
      const p = this.peer;
      later(() => { if (p.readyState === 'open') fire(p, 'message', { data: v }); });
    }
    open() { this.readyState = 'open'; fire(this, 'open'); }
    close() {
      for (const c of [this, this.peer]) if (c && c.readyState !== 'closed') { c.readyState = 'closed'; later(() => fire(c, 'close')); }
    }
  }

  class RTC extends EventTarget {
    constructor(config = {}) {
      super();
      this.config = config;
      this.id = `pc${++seq}`;
      this.iceGatheringState = 'new';
      this.connectionState = 'new';
      this.localDescription = this.remoteDescription = null;
      this.channels = [];
      pcs.set(this.id, this);
    }
    createDataChannel(label) { const c = new Channel(label); this.channels.push(c); return c; }
    async createOffer() { return { type: 'offer', sdp: `v=0\r\na=fake:${this.id}\r\n` }; }
    async createAnswer() { return { type: 'answer', sdp: `v=0\r\na=fake:${this.id}\r\n` }; }
    async setLocalDescription(d) {
      this.localDescription = d;
      this.iceGatheringState = 'gathering';
      later(() => { this.iceGatheringState = 'complete'; fire(this, 'icegatheringstatechange'); });
    }
    async setRemoteDescription(d) {
      const other = pcs.get(/a=fake:(\S+)/.exec(d.sdp)?.[1]);
      if (!other) throw new Error('not a description of these tests');
      this.remoteDescription = d;
      this.other = other;
      if (d.type === 'answer') later(() => this.connect(other));
    }
    // (the offerer, its answer taken: both connected, or both failed)
    connect(answerer) {
      if (this.connectionState === 'closed' || answerer.connectionState === 'closed') return;
      if (blocked(this, answerer)) {
        for (const pc of [this, answerer]) { pc.connectionState = 'failed'; fire(pc, 'connectionstatechange'); }
        return;
      }
      net.connections++;
      for (const pc of [this, answerer]) { pc.connectionState = 'connected'; fire(pc, 'connectionstatechange'); }
      for (const c of this.channels) {
        const twin = new Channel(c.label);
        c.peer = twin; twin.peer = c;
        answerer.channels.push(twin);
        fire(answerer, 'datachannel', { channel: twin });
        later(() => { c.open(); twin.open(); });
      }
    }
    close() {
      if (this.connectionState === 'closed') return;
      this.connectionState = 'closed';
      for (const c of this.channels) c.close();
      pcs.delete(this.id);
    }
  }
  const cut = () => { for (const pc of [...pcs.values()]) for (const c of pc.channels) c.close(); };
  return { RTC, net, cut };
}

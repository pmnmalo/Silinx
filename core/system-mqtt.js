// Silinx - a System's network links and its MQTT broker node (#5500, roadmap #4695's phase 4, docs/SYSTEMS.md): a
// network link carries messages, each a value of the scheduler's link (core/system-sim.js) at its time, after the link's
// latency (its lookahead: exact and deterministic). A broker node is a JS model of an MQTT broker (version 3.1.1's
// semantics, QoS 0): its clients connect, subscribe to topic filters (+ and # wildcards), publish (retained messages
// kept, one per topic, an empty retained one deleting it), and each publication goes to every client subscribed to a
// matching filter, the publisher too. Its traffic is kept with its times, as its view and the report say it.
//
//   const b = new BrokerNode({ clients: ['esp', 'pico'] });   // its pins: rx_<client>, tx_<client>
//   const m = { type: 'publish', topic: 'room/t', payload: '21', retain: false };   // a message
//
// Isomorphic ES module, no DOM.

// (the messages a client sends: connect { client }, subscribe { topic }, unsubscribe { topic }, publish { topic, payload,
// retain }, disconnect; the broker sends: connack, suback { topic }, message { topic, payload, retain })

/** Whether the topic `topic` matches the filter `filter` (MQTT 3.1.1, 4.7: `+` one level, `#` the rest, last). */
export function topicMatches(filter, topic) {
  const f = String(filter).split('/'), t = String(topic).split('/');
  if (t[0].startsWith('$') && (f[0] === '#' || f[0] === '+')) return false;   // ($SYS… topics: not by a wildcard)
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return i === f.length - 1;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/** Why `filter` is not a topic filter (a # not last nor alone in its level, a + not alone), or null. */
export function filterError(filter) {
  const s = String(filter ?? '');
  if (!s) return 'an empty topic filter';
  const lv = s.split('/');
  for (let i = 0; i < lv.length; i++) {
    if (lv[i].includes('#') && (lv[i] !== '#' || i !== lv.length - 1)) return `'${s}': # is a level of its own, the last`;
    if (lv[i].includes('+') && lv[i] !== '+') return `'${s}': + is a level of its own`;
  }
  return null;
}

/** A message as the traffic view says it: `pico -> broker: publish room/t "21" (retained)`. */
export function messageText(e) {
  const m = e.message, arrow = e.dir === 'in' ? `${e.client} -> broker` : `broker -> ${e.client}`;
  const what = m.type === 'publish' || m.type === 'message' ? `${m.type} ${m.topic} ${JSON.stringify(String(m.payload ?? ''))}${m.retain ? ' (retained)' : ''}`
    : m.topic != null ? `${m.type} ${m.topic}` : m.type;
  return `${arrow}: ${what}`;
}

/** What the broker models (the node contract's fidelity notes, #5499). */
const BROKER_FIDELITY = [
  { kind: 'models', text: 'an MQTT 3.1.1 broker: connect, subscribe and unsubscribe (+ and # filters), publish, retained messages' },
  { kind: 'omits', text: 'QoS 1 and 2, sessions kept between connections, last will, authentication, TLS' },
];

/** An MQTT broker as an adapter of the scheduler: its pins rx_<client> (what each client sends) and tx_<client> (what
 *  it sends each client). Its traffic: [{ t, client, dir: 'in' | 'out', message }]. */
export class BrokerNode {
  constructor({ clients = [] } = {}) {
    this.clients = [...clients];
    this.fidelity = BROKER_FIDELITY;   // (the node contract's notes, #5499)
    this.inputs = this.clients.map(c => `rx_${c}`);
    this.outputs = this.clients.map(c => `tx_${c}`);
    this.now = 0;
    this.out = [];
    this.queue = [];
    this.vals = new Map();
    this.subs = new Map(this.clients.map(c => [c, new Set()]));
    this.connected = new Set();
    this.retained = new Map();
    this.traffic = [];
    this.published = new Set();   // (the topics published to: the run's end's warnings)
    this.log = [];
    this.logN = 0;
    this.finished = null;
  }

  value(name) {
    if (!this.inputs.includes(name) && !this.outputs.includes(name)) throw new Error(`no pin '${name}'`);
    return this.vals.get(name) ?? null;
  }

  // a message to a client, now
  deliver(client, message) {
    const pin = `tx_${client}`, v = { ...message };
    this.vals.set(pin, v);
    this.out.push({ pin, t: this.now, value: v });
    this.traffic.push({ t: this.now, client, dir: 'out', message });
  }

  /** A client's message (a new value of its rx pin): the broker's answer now. */
  setPin(name, value) {
    const client = String(name).replace(/^rx_/, '');
    if (!this.inputs.includes(name)) throw new Error(`'${name}' is not an input of the broker`);
    if (value == null || typeof value !== 'object' || value === this.vals.get(name)) return;
    this.vals.set(name, value);
    this.take(client, { ...value });
  }

  // a client's message taken (the user's, typed to the broker's view: `you`)
  take(client, m) {
    this.traffic.push({ t: this.now, client, dir: 'in', message: m });
    if (m.type === 'connect') { this.connected.add(client); this.deliver(client, { type: 'connack' }); return; }
    if (!this.connected.has(client)) { this.log.push({ kind: 'warning', time: this.now, text: `MQTT: ${client} sent ${m.type} before connect: dropped` }); return; }
    if (m.type === 'disconnect') { this.connected.delete(client); this.subs.get(client).clear(); return; }
    if (m.type === 'subscribe' || m.type === 'unsubscribe') {
      const why = filterError(m.topic);
      if (why) { this.log.push({ kind: 'warning', time: this.now, text: `MQTT: ${client}'s ${m.type}: ${why}` }); return; }
      if (m.type === 'unsubscribe') { this.subs.get(client).delete(m.topic); return; }
      this.subs.get(client).add(m.topic);
      this.deliver(client, { type: 'suback', topic: m.topic });
      for (const [topic, r] of this.retained) if (topicMatches(m.topic, topic)) this.deliver(client, { type: 'message', topic, payload: r.payload, retain: true });
      return;
    }
    if (m.type === 'publish') {
      if (/[+#]/.test(m.topic ?? '') || !m.topic) { this.log.push({ kind: 'warning', time: this.now, text: `MQTT: ${client} published to '${m.topic ?? ''}': a topic has no wildcard` }); return; }
      this.published.add(m.topic);
      if (m.retain) { if (String(m.payload ?? '') === '') this.retained.delete(m.topic); else this.retained.set(m.topic, { payload: m.payload }); }
      for (const c of this.clients) {
        if (!this.connected.has(c) || ![...this.subs.get(c)].some(f => topicMatches(f, m.topic))) continue;
        this.deliver(c, { type: 'message', topic: m.topic, payload: m.payload, retain: false });
      }
      return;
    }
    this.log.push({ kind: 'warning', time: this.now, text: `MQTT: ${client} sent '${m.type}', not an MQTT message Silinx models` });
  }

  /** Its traffic as a terminal shows it: a line a message (the view's text, `received`); a line typed to it (`topic
   *  message`) published by the broker itself, as `you`. */
  get received() {
    if (this.shown?.n !== this.traffic.length) this.shown = { n: this.traffic.length, bytes: [...new TextEncoder().encode(this.traffic.map(e => `${messageText(e)}\n`).join(''))].map(byte => ({ t: 0, byte })) };
    return this.shown.bytes;
  }

  send(bytes) {
    for (const line of new TextDecoder().decode(Uint8Array.from(bytes)).split(/\r?\n/).filter(l => l.trim())) {
      const [topic, ...rest] = line.trim().split(/\s+/);
      this.connected.add('you');
      this.take('you', { type: 'publish', topic, payload: rest.join(' '), retain: false });
    }
  }

  /** Each filter subscribed to that no publication matched so far (the report's lines) (`room/t: subscribed by esp, nobody
   *  published to it`). */
  unheard() {
    const out = [];
    for (const [c, fs] of this.subs) for (const f of fs) if (![...this.published, ...this.retained.keys()].some(t => topicMatches(f, t))) out.push(`MQTT: ${f}: subscribed by ${c}, nobody published to it`);
    return out;
  }

  at(t, fn) {
    let i = this.queue.length;
    while (i && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, { t: Math.max(t, this.now), fn });
  }

  nextEventTime() { return this.queue.length ? this.queue[0].t : Infinity; }

  advanceTo(t) {
    if (t < this.now) throw new Error(`the node is at ${this.now} ps, not back at ${t}`);
    while (this.queue.length && this.queue[0].t <= t) { const e = this.queue.shift(); this.now = e.t; e.fn(this); }
    this.now = t;
    return this.out.splice(0);
  }

  messages() { return this.log.slice(this.logN, (this.logN = this.log.length)); }
}


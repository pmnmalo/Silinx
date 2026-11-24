// Silinx - a System's co-simulation scheduler (#4696, docs/SYSTEMS.md): the nodes of a System (FPGA
// modules, microcontrollers, circuits, peripheral models), each engine behind an adapter, simulated together on one
// global time in ps, their links exchanged pin by pin.
//
// An adapter (core/system-sim-compiled.js: Silinx's compiled engine; core/system-sim-event.js: the event-driven
// simulator; the AVR's comes with #4698) has:
//   now                    its time (ps)
//   inputs, outputs        its pins' names ('rx', 'led[3]': a bit of a port)
//   advanceTo(t)           runs up to t (ps, from now): its output pins' changes since the last call, in time order,
//                          each at its own time, [{ pin, t, value }] (a value: a number, null when unknown)
//   setPin(name, value)    an input pin's value from now on
//   value(name)            a pin's value now
//   nextEventTime()        the time of its next event of its own (at), Infinity when none
//   at(t, fn)              fn() at time t, inside its run
//   messages()             its log since the last call: [{ kind ('error', 'warning', 'info'…), text, time }]
//   finished               falsy while it runs; why it stopped
//
// The synchronisation is conservative, in windows: every node runs to the window's end, which is the quantum's end,
// or the next known event (a change to deliver, an event of the system's or of a node's own), whichever comes first.
// The pins that changed are exchanged at the windows' edges: a link's change at t, seen at the end T of its window,
// reaches the other ends at t + lag, the link's lag set by its first change after an idle time (T - t, at least
// the fine quantum) and kept while it is active, so that the waveform keeps its shape (a UART's bits their length,
// whatever the window it was seen in) and is only delayed. The quantum is adaptive: fine while a link is active
// (a sixteenth of a UART bit), wide while all the links are idle (a change within `hold` of the last one: active).
// A burst's first change is seen at the end of the window it fell in, so its lag (and a reply's time) depends on the
// quantum: a UART's bytes are the same, a protocol that depends on the time of a reply may not be. A link with a fixed
// latency is exact instead: every change reaches the other ends at t + latency, and no window is longer than the
// latency, so that the run is the same at every quantum (at the cost of narrow windows while the links are idle).
// The run is deterministic: the nodes in their order, the changes in time order, a delivery a window's edge. It is
// isomorphic (browser, Node), synchronous and needs no
// SharedArrayBuffer: the whole system runs in one Web Worker (core/system-sim-remote.js).

/** The wide quantum by default (ps): 100 µs. */
export const WIDE = 100e6;
/** A wire's fine quantum by default (ps): 1 µs. */
export const FINE = 1e6;
/** A UART link's fine quantum: a sixteenth of its bit. */
export const UART_DIV = 16;

/** A pin's name: { port, bit } ('led[3]': bit 3 of led; 'tx': bit null, the whole port). */
export function parsePin(name) {
  const m = /^([^[\]]+)\[(\d+)\]$/.exec(String(name));
  return m ? { port: m[1], bit: Number(m[2]) } : { port: String(name), bit: null };
}

const endOf = (s) => {
  const i = s.lastIndexOf('.');
  if (i <= 0 || i === s.length - 1) throw new Error(`'${s}' is not a node's pin (node.pin)`);
  return { node: s.slice(0, i), pin: s.slice(i + 1) };
};

// a queue in time order, those of the same time in the order they came
function insert(q, item) {
  let lo = 0, hi = q.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (q[m].t <= item.t) lo = m + 1; else hi = m; }
  q.splice(lo, 0, item);
}

export class SystemSim {
  /**
   * wide: the quantum while the links are idle (ps); fine: every link's fine quantum (ps; null: each link's own: a
   * sixteenth of a UART's bit, FINE for a wire); adaptive: false, the fine quantum always (the smallest of the links').
   */
  constructor({ wide = WIDE, fine = null, adaptive = true } = {}) {
    if (!(wide > 0) || (fine != null && !(fine > 0))) throw new Error('the quanta are times above 0 (ps)');
    this.wide = wide;
    this.fine = fine;
    this.adaptive = adaptive;
    this.nodes = new Map();
    this.links = new Map();
    this.drivenBy = new Map();   // 'node.pin' (an input) -> its link
    this.outLinks = new Map();   // 'node.pin' (an output) -> its link
    this.watched = new Map();   // 'node.pin' (an output no link reads, watched: a board's LED) -> [t, value, …] (#5212)
    this.now = 0;
    this.pending = [];           // the changes to deliver: { t, link, value }
    this.events = [];            // the system's own: { t, fn }
    this.log = [];
    this.finished = null;
    this.started = false;
    this.stats = { windows: 0, changes: 0, late: 0 };
  }

  /** A node: its name and its engine's adapter. */
  addNode(name, adapter) {
    if (this.started) throw new Error('the nodes are added before the run');
    if (!name || /[.\s]/.test(name)) throw new Error(`'${name}' is not a node's name`);
    if (this.nodes.has(name)) throw new Error(`a node '${name}' already`);
    this.nodes.set(name, adapter);
    return adapter;
  }

  /**
   * A link from an output pin to input pins: { from: 'node.pin', to: 'node.pin' or [them], name, kind: 'wire' or
   * 'uart' (baud: its bit's time sets the fine quantum and the hold), fine, hold (ps: active for hold after a change),
   * latency (ps: a fixed one, exact; null: the lag of each burst), pull (the level a floating source gives: an SPI's
   * SS pulled up, #5214; null: floating) }.
   */
  link({ from, to, name = null, kind = 'wire', baud = 9600, fine = null, hold = null, latency = null, pull = null }) {
    if (this.started) throw new Error('the links are added before the run');
    if (kind !== 'wire' && kind !== 'uart') throw new Error(`no link of kind '${kind}'`);
    const src = this.pinOf(from, 'outputs');
    const dsts = (Array.isArray(to) ? to : [to]).map((p) => this.pinOf(p, 'inputs'));
    if (!dsts.length) throw new Error(`the link from '${from}' goes nowhere`);
    if (this.outLinks.has(from)) throw new Error(`'${from}' already drives a link`);
    for (const d of dsts) if (this.drivenBy.has(d.key)) throw new Error(`'${d.key}' is driven by two links`);
    if (kind === 'uart' && !(baud > 0)) throw new Error('a UART link needs its baud rate');
    if (latency != null && !(latency >= 1)) throw new Error('a link\'s latency: 1 ps or more');
    const bit = kind === 'uart' ? 1e12 / baud : null;
    name ??= `${from}>${dsts.map((d) => d.key).join(',')}`;
    if (this.links.has(name)) throw new Error(`a link '${name}' already`);
    const link = {
      name, kind, baud: bit && baud, bit, src, dsts, latency: latency == null ? null : Math.round(latency), pull,
      fine: Math.max(1, Math.round(this.fine ?? fine ?? (bit ? bit / UART_DIV : FINE))),
      hold: hold ?? (bit ? 20 * bit : 16 * (this.fine ?? fine ?? FINE)),
      level: undefined, lag: null, last: -Infinity, delivered: 0, activeUntil: -Infinity,
      sent: [], trace: [],   // the changes at the source's times, and at the other ends': [t, value, t, value…]
    };
    this.links.set(name, link);
    this.outLinks.set(src.key, link);
    for (const d of dsts) this.drivenBy.set(d.key, link);
    return link;
  }

  pinOf(spec, dir) {
    const { node, pin } = endOf(spec);
    const a = this.nodes.get(node);
    if (!a) throw new Error(`no node '${node}'`);
    if (!a[dir].includes(pin)) throw new Error(`'${pin}' is not ${dir === 'inputs' ? 'an input' : 'an output'} of the node '${node}'`);
    return { node, pin, a, key: `${node}.${pin}` };
  }

  /** fn() at time t (ps), at the start of the window that starts there. */
  at(t, fn) {
    if (!(t >= this.now)) throw new Error(`a time from now on (${this.now} ps), not ${t}`);
    insert(this.events, { t, fn });
  }

  /** The quantum now: the fine one of the active links (the smallest), else the wide one; at most a link's latency
   *  (a link with a latency: its latency only, whether it is active or not). */
  quantum() {
    let q = Infinity, lat = Infinity;
    for (const l of this.links.values()) {
      if (l.latency != null) lat = Math.min(lat, l.latency);
      else if (!this.adaptive || l.activeUntil > this.now) q = Math.min(q, l.fine);
    }
    return Math.min(q === Infinity ? this.wide : q, lat);
  }

  // the links' levels at the start: each other end set from its source's value at 0; each link active for its hold,
  // so that the first windows are fine ones: a node's start-up (an AVR's D1 floating until its USART is on, #5130) is
  // seen within the fine quantum, not at the end of a wide window (a floating line read as a start bit for 100 µs)
  start() {
    this.started = true;
    for (const l of this.links.values()) {
      l.activeUntil = this.now + l.hold;
      l.level = l.src.a.value(l.src.pin) ?? l.pull;
      l.sent.push(this.now, l.level);
      for (const d of l.dsts) d.a.setPin(d.pin, l.level);
      l.trace.push(this.now, l.level);
    }
  }

  // what is due now: the changes to deliver, then the system's events
  due() {
    while (this.pending.length && this.pending[0].t <= this.now) {
      const { link, value } = this.pending.shift();
      for (const d of link.dsts) d.a.setPin(d.pin, value);
      link.trace.push(this.now, value);
    }
    while (this.events.length && this.events[0].t <= this.now) this.events.shift().fn(this);
  }

  /** Watch outputs of a node that no link reads (a board's LEDs, the System Emulator's, #5212): their changes kept
   *  in `watched` ('node.pin' -> [t, value, …], from their value at the start). */
  watch(node, pins) {
    const a = this.nodes.get(node);
    if (!a) throw new Error(`no node '${node}'`);
    for (const p of pins) {
      if (!a.outputs.includes(p)) throw new Error(`'${p}' is not an output of the node '${node}'`);
      this.watched.set(`${node}.${p}`, [this.now, a.value(p)]);
    }
  }

  // a node's output changes seen at the window's end T, to deliver at their time plus their link's lag (a watched
  // pin's kept at its time)
  route(name, changes, T) {
    for (const { pin, t, value: v } of changes) {
      const l = this.outLinks.get(`${name}.${pin}`), value = v ?? l?.pull ?? null;
      const w = this.watched.get(`${name}.${pin}`);
      if (w && w.at(-1) !== value) w.push(t, value);
      if (!l || value === l.level) continue;
      l.level = value;
      l.sent.push(t, value);
      this.stats.changes++;
      if (l.latency != null) l.lag = l.latency;
      else if (l.lag == null || t - l.last > l.hold) l.lag = Math.max(T - t, l.fine);
      let d = t + l.lag;
      if (d < T) { this.stats.late++; d = T; }
      d = Math.max(d, l.delivered);
      l.delivered = d;
      l.last = t;
      l.activeUntil = Math.max(l.activeUntil, t + l.hold, d);
      insert(this.pending, { t: d, link: l, value });
    }
  }

  // the window from now: its end
  windowEnd(until) {
    let end = Math.min(this.now + this.quantum(), until);
    if (this.pending.length) end = Math.min(end, this.pending[0].t);
    if (this.events.length) end = Math.min(end, this.events[0].t);
    for (const a of this.nodes.values()) {
      const e = a.nextEventTime();
      if (e > this.now) end = Math.min(end, e);
    }
    return end;
  }

  /** Run up to `until` (ps), or until a node stops (finished: { node, why }). */
  run(until) {
    if (typeof until !== 'number' || Number.isNaN(until)) throw new Error('run(until): a time in ps');
    if (!this.started) this.start();
    while (!this.finished) {
      this.due();
      if (this.now >= until) break;
      const end = this.windowEnd(until);
      for (const [name, a] of this.nodes) this.route(name, a.advanceTo(end), end);
      this.now = end;
      this.stats.windows++;
      for (const [name, a] of this.nodes) {
        for (const m of a.messages()) this.log.push({ node: name, ...m });
        if (a.finished && !this.finished) this.finished = { node: name, why: a.finished };
      }
    }
    return { now: this.now, finished: this.finished };
  }

  /** The messages of a kind (warning, error…) the nodes said, as 'node: text'. */
  messages(kind) { return this.log.filter((m) => m.kind === kind).map((m) => `${m.node}: ${m.text}`); }
}

// Silinx - the co-design system's waves (#4699, docs/CODESIGN.md): one set of waves for the whole system, from what the
// co-simulation scheduler recorded (core/system-sim.js: each link's changes at its source, `sent`, and at its other
// ends, `trace`): a scope per node with its linked pins (an output as it drove the link, an input as the link reached
// it, later by the link's lag), and a scope `links` with each link's named signal (`uart_avr_tx`: its source's
// changes). The waves have the simulator's shape (a design's scopes and signals, each its wave { t, v }), so that the
// waveform viewer shows them and the simulator's toVCD writes their VCD (core/simulator.js). Isomorphic ES module.
import * as V from './values.js';
import { toVCD } from './simulator.js';

const X = V.allX(1);
const valueOf = (v) => (v == null ? X : V.mk(1, BigInt(v ? 1 : 0)));

// a signal of one bit from changes [t, value…] (a change to the same value dropped)
function signal(name, changes) {
  const wave = { t: [], v: [] };
  let last;
  for (let i = 0; i + 1 < changes.length; i += 2) {
    const v = changes[i + 1] == null ? null : changes[i + 1] ? 1 : 0;
    if (wave.t.length && v === last) continue;
    if (wave.t.length && changes[i] === wave.t.at(-1)) { wave.v[wave.v.length - 1] = valueOf(v); last = v; continue; }
    wave.t.push(changes[i]); wave.v.push(valueOf(v)); last = v;
  }
  return { name, kind: 'signal', net: 'wire', t: { kind: 'logic', w: 1, s: false, scalar: true }, wave, val: wave.v.at(-1) ?? X };
}

const scope = (name, signals) => ({ name, ports: [], signals, children: [] });

/** The system's waves: { design: { top, signals } } (the scopes `system` ▸ each node, `links`). */
export function systemWaves(sys, { name = 'system' } = {}) {
  const pins = new Map([...sys.nodes.keys()].map((n) => [n, []]));
  const links = [];
  for (const l of sys.links.values()) {
    pins.get(l.src.node).push(signal(l.src.pin, l.sent));
    for (const d of l.dsts) pins.get(d.node).push(signal(d.pin, l.trace));
    links.push(signal(l.name, l.sent));
  }
  const children = [...pins].map(([n, s]) => scope(n, s));
  const top = { ...scope(name, []), children: [...children, scope('links', links)] };
  return { design: { top, signals: [...children.flatMap((c) => c.signals), ...links] } };
}

/** The system's VCD (its waves, systemWaves'), in ps. */
export function systemVcd(sys, opts = {}) {
  const { design } = systemWaves(sys, opts);
  return toVCD(design, null, { signals: design.signals });
}

// Silinx - the co-design system's scheduler at the other end of a message port (#4696): the whole system in one Web
// Worker (or on the page's thread, a MessageChannel), its nodes and links built there from what a message carries
// (structured clone: the compiled models are their code as text; no SharedArrayBuffer, so no cross-origin
// isolation, which GitHub Pages cannot set).
//
// The messages, page -> host: init { nodes: [{ name, kind: 'compiled', model, pins, period }], links: [link's],
// options: SystemSim's }, set { t, node, pin, value } (an input at t), run { id, until }; host -> page: ready
// { warnings }, state { id, now, finished, links: { name: { sent, trace } } (their changes since the last state),
// log (the nodes' messages since the last state), stats }, error { id, message }.
//
// Isomorphic ES module (browser + Node), no DOM.
import { SystemSim } from './system-sim.js';
import { CompiledNode } from './system-sim-compiled.js';

/** The adapters a message can build, by the node's kind (the AVR's comes with #4698). */
export const REMOTE_KINDS = {
  compiled: (n) => new CompiledNode({ model: n.model, pins: n.pins, index: n.index, period: n.period }),
};

/** The host: a SystemSim driven by the messages of `port` (a worker's self, a MessagePort). */
export function hostSystem(port) {
  let sys = null, logN = 0;
  const seen = new Map();   // link -> [sent, trace] already posted
  const post = (m) => port.postMessage(m);
  const handle = {
    init({ nodes, links = [], options = {} }) {
      sys = new SystemSim(options);
      const warnings = [];
      for (const n of nodes) {
        const make = REMOTE_KINDS[n.kind];
        if (!make) throw new Error(`no node of kind '${n.kind}'`);
        const a = sys.addNode(n.name, make(n));
        warnings.push(...(a.warnings || []).map((w) => `${n.name}: ${w}`));
      }
      for (const l of links) seen.set(sys.link(l).name, [0, 0]);
      logN = 0;
      post({ type: 'ready', warnings });
    },
    set({ t, node, pin, value }) {
      const a = sys.nodes.get(node);
      if (!a) throw new Error(`no node '${node}'`);
      sys.at(t, () => a.setPin(pin, value));
    },
    run({ id, until }) {
      if (!sys) throw new Error('no system: init first');
      sys.run(until);
      const links = {};
      for (const [name, l] of sys.links) {
        const s = seen.get(name);
        links[name] = { sent: l.sent.slice(s[0]), trace: l.trace.slice(s[1]) };
        seen.set(name, [l.sent.length, l.trace.length]);
      }
      const log = sys.log.slice(logN);
      logN = sys.log.length;
      post({ type: 'state', id, now: sys.now, finished: sys.finished, links, log, stats: { ...sys.stats } });
    },
  };
  const onMessage = (e) => {
    const m = e.data;
    try { handle[m.type]?.(m); }
    catch (err) { post({ type: 'error', id: m.id, message: err.message }); }
  };
  if (port.addEventListener) { port.addEventListener('message', onMessage); port.start?.(); }
  else port.onmessage = onMessage;
}

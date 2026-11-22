// The System's waves in the waveform viewer (#4701): what the co-simulation recorded (core/system-waves.js, sent by its
// worker: a scope per
// node with its linked pins, a scope `links` with each wire) shown by the ISim-style window (web/js/isim.js) as a run that
// has ended: its waves to the run's time, nothing more to run (Run, Restart: it says so). Opened again, it shows the run
// as it is then.
import { S, closeDoc, findDoc, openDoc } from './app.js';

// a run recorded, as the window reads a simulator: its time, its values, nothing to run
function recorded(now) {
  return {
    now, started: true, finished: 'recorded', active: [], nbaQ: [], heap: { size: 0, peek: () => null }, onLog: null,
    run: () => ({ pending: false }), reset() {}, start() {}, force() {}, release() {},
    valueAt(sig, t) {
      const w = sig.wave;
      if (!w?.t.length) return sig.val;
      let lo = 0, hi = w.t.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w.t[m] <= t) lo = m; else hi = m - 1; }
      return w.v[lo];
    },
  };
}

/** The waves of a run (`design`: core/system-waves.js's, to `now`; the System `name`'s) in a document of their own. */
export async function openSystemWaves(design, now, name) {
  const id = `syswaves:${S.project?.name}`;
  const prev = findDoc(id);
  if (prev) await closeDoc(prev);
  const { mountISim } = await import('./isim.js');
  const run = recorded(now);
  openDoc({
    id, title: `Waves (${name})`, icon: 'wave',
    create(el) {
      const view = mountISim(el, { design, sim: run, title: name, runAllCap: Math.max(1, now) });
      view.addSignals?.(design.signals);
      return { view, destroy: () => view.destroy?.(), onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
}

// A circuit's Try it in the waveform viewer (#3900, docs/CIRCUITS.md): its session replayed by the circuit's generated HDL
// (core/circuit-replay.js: the inputs' changes as a test bench) in the simulator, opened in SSim as every simulation of
// Silinx is (as the logic analyzer's capture, web/js/capture-ui.js): run to its end, its logic probes' nets the first
// waves, every net and IC pin of the circuit's module in its hierarchy.
import { compile, elaborate } from '/core/compile.js';
import { Simulator } from '/core/simulator.js';
import { circuitReplay } from '/core/circuit-replay.js';
import { closeDoc, findDoc, openDoc } from './app.js';
import { log } from './console.js';

/** The waveforms of a Try it session of the circuit `model` (its file `path`; `events` its inputs' changes). */
export async function openCircuitWaves(path, model, events) {
  const replay = circuitReplay(model, events, { lang: model.lang });
  const lib = compile(replay.files);
  // (a replay that does not compile: said, not an empty window, as the capture's, #3340)
  if (lib.errors.length) { log(`ERROR: View Waveforms: the circuit's replay does not compile: ${lib.errors[0].message}`); return null; }
  const design = elaborate(lib, replay.top);
  const sim = new Simulator(design);
  const id = `circwave:${path}`;
  const prev = findDoc(id);
  if (prev) await closeDoc(prev);
  const { mountISim } = await import('./isim.js');
  let view = null;
  openDoc({
    id, title: `Waveforms (${model.name})`, icon: 'wave',
    create(el) {
      view = mountISim(el, { design, sim, title: model.name, runAllCap: replay.untilNs * 1000 });
      // (its probes' nets first, then the whole session run)
      (async () => {
        for (const p of replay.probes) if (p.path) await view.exec(`wave add /${replay.top}/${p.path}`);
        await view.exec(`run ${replay.untilNs} ns`);
      })();
      return { view, destroy: () => view.destroy?.(), onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
  log(`${path.split('/').pop()}: Try it replayed in the waveform viewer: ${events.length} input change(s), ${replay.untilNs} ns${replay.probes.length ? `, the probes ${replay.probes.map((p) => p.label).join(', ')}` : ''}.`);
  return view;
}

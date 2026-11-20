// Silinx toolchain - the Spartan-6's Place & Route by nextpnr (#2138; the plan: #2131), the one engine since Silinx's
// own router was removed (#2824). Silinx's Map stays (open-flow-s6.js: the netlist packed into sites); nextpnr-himbaechel with the spartan6
// micro-architecture (the fork pmnmalo/nextpnr-spartan, its WebAssembly package through io.nextpnr.spartan6) places those sites,
// and, the placed design written with its constants' sources (fpga/s6/xdl.js), routes it. Silinx's own placer is removed
// (#4776): with Silinx's Map nextpnr places every site but the pads, the global buffers and the BSCANs, which Silinx's
// rules fix (fpga/s6/fixed-sites.js); with nextpnr's Map it places them all.
import { parseXdl, writeXdl } from './xdl.js';
import { loadChipdb } from './nextpnr-io.js';
import { s6Sites } from './fpga/s6/sites.js';
import { fixedSitesS6 } from './fpga/s6/fixed-sites.js';
import { placedXdlS6 } from './fpga/s6/xdl.js';
import { checkRoutingS6 } from './fpga/s6/route-check.js';
import { analyzeTimingS6 } from './fpga/s6/timing.js';
import { placementOf, routedDesignS6, siteNetlist } from './fpga/s6/nextpnr.js';
import { packInput, samePacking } from './fpga/s6/nextpnr-pack.js';

const PLACE_SEEDS = 3;
// a routed design's minimum period by Silinx's timing model (ns; 0: no clocked paths)
const periodOf = (routed, device) => analyzeTimingS6(parseXdl(writeXdl(routed)), device).clocks.reduce((a, c) => Math.max(a, c.period), 0);

/** runPar of the Spartan-6 by nextpnr. ctx: mountS6Steps's, and its state() ({ packed, phys, sites }) after Map. */
export function mountNextpnrS6(ctx) {
  const { io, spec, log, report, now, ms, netlist, netlistText, constraints, StepError, setRouted, state } = ctx;
  const part = `${spec.device}${spec.pkg}`;

  // one run of nextpnr: { json, lines } (its problems: StepError, with nextpnr's ERROR lines, e.nextpnr)
  async function run(what, args, input, db) {
    const lines = [];
    const errors = () => lines.filter(l => /^ERROR:/.test(l)).slice(0, 20);
    let files;
    try {
      files = await io.nextpnr.spartan6.run(['--device', part, '--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'out.json', ...args],
        { 'design.json': JSON.stringify(input), 'chipdb.bin': db }, l => lines.push(l));
    } catch (e) {
      // (a WebAssembly exception has no message: nextpnr's own ERROR lines say why)
      throw Object.assign(new StepError(`nextpnr's ${what} failed: ${e?.message ?? 'it stopped on an error'}`, errors()), { nextpnr: true });
    }
    const out = files?.['out.json'];
    if (!out) throw Object.assign(new StepError(`nextpnr's ${what} wrote no design`, errors()), { nextpnr: true });
    return { json: JSON.parse(typeof out === 'string' ? out : new TextDecoder().decode(out)), lines };
  }

  async function runPar() {
    const device = io.device(), { packed, phys } = state(), sites = state().sites || s6Sites(device), nl = netlist();
    if (!io.nextpnr?.spartan6) throw new StepError('the nextpnr engine is not available here (io.nextpnr)');
    const t = now();
    const db = await loadChipdb(io.nextpnr.spartan6, part, log, StepError);
    // nextpnr's Map (#3138, the default since #3140): it packs Yosys's netlist into the sites of Silinx's Map and places
    // them, its pads and clocks by its own rules (#3135, #3136); with spec.s6Map 'silinx' it places the sites of Silinx's
    // Map, the pads, the global buffers and the BSCANs fixed by Silinx's rules (#4776, fixedSitesS6: the ports without a
    // LOC too, on bonded pads, #4950), the rest (the block RAMs and DSP48A1s, #3137) as with its own Map
    const byPacker = spec.s6Map !== 'silinx';
    let fixed = new Map();
    if (!byPacker) {
      let r;
      try { r = fixedSitesS6(phys, sites); } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }
      fixed = r.fixed;
      for (const w of r.warnings) log(`WARNING:Place - ${w}`);
    }
    // (an I/O buffer on a pad with no dedicated path to a global buffer: GENERAL_OK, spartan6.cc's)
    const generalOkOf = site => new Set(phys.insts.filter((inst, i) => inst.kind === 'iob' && site[i] && !sites.pads.get(site[i])?.bufg.length).map(i => i.name));
    const generalOk = generalOkOf(phys.insts.map(inst => fixed.get(inst.name)));
    const chains = phys.chains.filter(c => c.length > 1).map(c => c.map(i => phys.insts[i].name));
    let mhz = null;
    try { const c = constraints()?.clocks || []; if (c.length) mhz = 1000 / Math.min(...c.map(x => x.period)); } catch { /* translate's */ }
    const freq = [...(mhz ? ['--freq', mhz.toFixed(3)] : []), '--timing-allow-fail'];
    const unplaced = placedXdlS6(nl, packed, phys, { site: [], tile: [], pos: [] }, { part: spec.part, name: spec.top });
    // 1. the placements and their routings, of the placed design with its constants' sources. The seeds differ by up
    // to 20 %, and nextpnr's estimates do not rank them: PLACE_SEEDS of them, the one Silinx's timing model finds fastest.
    const netlistIn = byPacker ? packInput(netlistText(), phys, device) : siteNetlist(unplaced, { top: spec.top, fixed, chains, generalOk, device });
    // (a seed nextpnr cannot route, #2131: the next one; the step fails only when none routes)
    let best = null, failed = null;
    const seedOf = async seed => {
      const placedRun = await run(byPacker ? 'packing' : 'placement', ['--no-route', '--seed', seed, ...freq], netlistIn, db);
      // (nextpnr's sites are those of Silinx's Map, whose settings xdl.js writes: a difference is the packer's error)
      const differ = byPacker ? samePacking(placedRun.json, phys) : [];
      if (differ.length) throw new StepError(`nextpnr's packing differs from Silinx's Map in ${differ.length} site(s)`, differ.slice(0, 20));
      let placement, placed;
      try {
        placement = placementOf(placedRun.json, phys, device);
        placed = placedXdlS6(nl, packed, phys, placement, { part: spec.part, name: spec.top, device });
      } catch (e) { throw new StepError(`nextpnr's placement cannot be read: ${e.message}`); }
      const routedRun = await run('routing', ['--no-place', '--seed', seed, ...freq], siteNetlist(placed, { top: spec.top, generalOk: generalOkOf(placement.site), chains: [], device }), db);
      let routed;
      try { routed = routedDesignS6(routedRun.json, placed, device); } catch (e) { throw new StepError(`nextpnr's routed design cannot be read: ${e.message}`); }
      return { period: periodOf(routed, device), placed, placement, routed, lines: [...placedRun.lines, ...routedRun.lines] };
    };
    for (let k = 0; k < PLACE_SEEDS; k++) {
      const seed = String((spec.seed || 1) + k);
      let r;
      try { r = await seedOf(seed); } catch (e) {
        if (!e.nextpnr) throw e;
        failed ||= e;
        const why = e.list[0]?.replace(/^ERROR:\s*/, '').replace(/\.$/, '');   // (unless the message says it, #4260)
        log(`nextpnr, seed ${seed}: ${e.message}${why && !e.message.includes(why) ? ` (${why})` : ''}.`);
        continue;
      }
      log(`nextpnr, seed ${seed}: ${r.period ? `minimum period ${r.period.toFixed(3)} ns` : 'no clocked paths'}.`);
      if (!best || r.period < best.period) best = r;
    }
    if (!best) throw failed;
    // (the kept seed's warnings; a clock's frequency: the timing step's)
    for (const l of best.lines) if (/^Warning:/.test(l) && !/Max frequency/.test(l)) log(`WARNING:nextpnr - ${l.replace(/^Warning:\s*/, '')}`);
    const { placed, placement, routed } = best;
    report.files.placed = io.write('open/placed.xdl', writeXdl(placed));
    log(`${byPacker ? 'Packed and placed' : 'Placed'} ${placement.site.length} sites by nextpnr in ${ms(t)}: ${report.files.placed}`);
    const text = writeXdl(routed);
    report.files.routed = io.write('open/routed.xdl', text);
    const check = checkRoutingS6(parseXdl(text), device);
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    setRouted(text);
    const pips = routed.nets.reduce((n, x) => n + x.pips.length, 0);
    report.par = { routed: true, unroutedSignals: 0, nets: routed.nets.length, pips, iterations: null, done: true, engine: 'nextpnr' };
    log(`Routed ${routed.nets.length} nets (${pips} PIPs) by nextpnr: ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  return { runPar };
}

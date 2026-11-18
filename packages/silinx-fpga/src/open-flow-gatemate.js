// Silinx toolchain - the GateMate's back end (#2431), a family of open-flow-backends.js's: Yosys's synth_gatemate, then
// nextpnr-himbaechel-gatemate's place and route (Project Peppercorn's chip databases) into its text configuration
// (open/routed.cfg), then gmpack's bitstream (<top>.bit, Cologne Chip's: no Xilinx header); the constraints are CCF (ccf.js).
// nextpnr and gmpack come through io.nextpnr.gatemate { run(args, files, onLine) -> files, pack(config) -> bytes }
// (nextpnr-gatemate-io.js: YoWASP's package, @yowasp/nextpnr-himbaechel-gatemate).
// synth_gatemate's -luttree and -nomx8: Yosys maps by default onto CC_LUT3 / CC_LUT4 and CC_MX8, which this nextpnr refuses (its
// Yosys is newer than its nextpnr). The CCGM1A2 (two dies) is routed by router1, through no CPE's CP lines (no-cpe-cp): router2's
// state for its every wire passes the 4 GiB of WebAssembly's memory (2.3 GB on the CCGM1A1 for one gate: a std::bad_alloc nextpnr
// does not catch), and router1's routes through the CP lines write a CPE's C_SEL_P twice ("Trying to add value to already
// assigned word"). Slow: pong in about 12 minutes (#2431).
import { scriptSynthesis } from './synth-script.js';
import { CCF } from './ccf.js';
import { portBits, nextpnrNames } from './nextpnr-ports.js';
import { mountNextpnrTiming } from './nextpnr-timing.js';

/** The GateMate's parts nextpnr-himbaechel-gatemate has a chip database for (YoWASP's package: the CCGM1A1 and CCGM1A2), by
 *  Silinx's names: its --device, the router it is routed by (null: nextpnr's, router2) and its options (--vopt). */
export const GATEMATE_PARTS = { ccgm1a1: { device: 'CCGM1A1', router: null, vopts: [] }, ccgm1a2: { device: 'CCGM1A2', router: 'router1', vopts: ['no-cpe-cp'] } };

/** How many times a crash of nextpnr's is placed and routed again, each with the next seed. */
export const RETRIES = 3;

/** The GateMate's steps, as runFlow runs them. */
export const GATEMATE_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'trce', label: 'Generate Post-Place & Route Static Timing', needs: ['par'] },
  { id: 'bitgen', label: 'Generate Programming File - gmpack', needs: ['par'] },
];

// the synthesis's resources, from synth_gatemate's cells
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const gatemateUtilization = counts => ({
  luts: sum(counts, /^(CC_LUT[1-4]|CC_L2T[45])$/), flipFlops: sum(counts, /^CC_DFF$/), latches: sum(counts, /^CC_DLT$/),
  ios: sum(counts, /^CC_(I|O|TO|IO|LVDS_I|LVDS_O|LVDS_TO|LVDS_IO)BUF$/), carry: sum(counts, /^CC_ADDF$/), muxes: sum(counts, /^CC_MX[248]$/),
  blockRam: sum(counts, /^(CC_BRAM_(20K|40K)|CC_FIFO_40K)$/), multipliers: sum(counts, /^CC_MULT$/), clockBuffers: sum(counts, /^CC_BUFG$/),
  dcms: sum(counts, /^CC_PLL/), cells: sum(counts, /./),
});
const NAMES = { luts: 'Number of LUTs', ffs: 'Number of flip-flops', iob: 'Number of IOs' };

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
// a clock as the report names its net: its input buffer's ($iopadmap$clk) or a global buffer's ($glbnet$clk), on a CCGM1A2 its
// copy on the second die ($iopadmap$clk$die1: the clocks mirrored) -> clk
export const clockName = n => n.replace(/^\$(iopadmap|glbnet)\$/, '').replace(/\$die\d+$/, '');

// nextpnr's bels that are no resource a design asks for: a CPE's ports it takes for an I/O or a RAM's port, its CP lines'
// (CPE_RAMIO, CPE_CPLINES), a GPIO's I/O select (IOSEL, one per GPIO) and the clock inputs' multiplexer (CLKIN)
const NOT_RESOURCES = /^(CPE_RAMIO|CPE_CPLINES|CPE_BRIDGE|IOSEL|CLKIN)$/;
/** The resources a design takes, of nextpnr's report's utilization: [[bel, { used, available }]]. */
export const gatematePlaced = r => Object.entries(r.utilization || {}).filter(([name, u]) => u.used && u.available && !NOT_RESOURCES.test(name));

/** The clocks of a CCF's model as nextpnr's SDC: '' with none. */
export const gatemateSdc = clocks => clocks.map(c => `create_clock -period ${c.period.toFixed(6)} [get_ports {${c.net}}]\n`).join('');

/** The GateMate's part of a spec: { device, router }, or null. */
const gatematePart = spec => GATEMATE_PARTS[String(spec.device || '').toLowerCase()] || null;

function mountGatemate(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const timing = mountNextpnrTiming(ctx, { tool: 'nextpnr-himbaechel-gatemate', clockName });
  let config = null;
  const configOrEarlier = () => {
    if (config == null) config = io.read('open/routed.cfg');
    if (config == null) throw new StepError('no routed design: run Place & Route first', [], '');
    return config;
  };
  const tool = () => {
    if (!io.nextpnr?.gatemate) throw new StepError('nextpnr-himbaechel-gatemate is not in this installation (io.nextpnr.gatemate)', [], 'Install it: npm install @yowasp/nextpnr-himbaechel-gatemate');
    return io.nextpnr.gatemate;
  };

  async function runPar() {
    const part = gatematePart(spec);
    if (!part) throw new StepError(`${spec.device}: not a GateMate part of nextpnr-himbaechel-gatemate (${Object.values(GATEMATE_PARTS).map(p => p.device).join(', ')})`, [], '');
    const t = now();
    const bits = portBits(netlistText(), top);
    const read = constraints(), ccf = read && nextpnrNames(read, bits);
    const pins = ccf?.assignments || {};
    const free = bits.map(b => b.name).filter(p => !pins[p]?.loc);
    for (const p of free) log(`WARNING:Place - the port ${p} has no pin (Loc in the CCF): nextpnr places it anywhere.`);
    const sdc = gatemateSdc(ccf?.clocks || []);
    const seed0 = spec.seed || 1;
    const args = seed => ['--device', part.device, '--json', 'netlist.json', '--vopt', 'out=routed.cfg', '--write', 'routed.json', '--report', 'report.json',
      '--seed', String(seed), '--timing-allow-fail', ...(ccf ? ['--vopt', 'ccf=design.ccf'] : []), ...(free.length ? ['--vopt', 'allow-unconstrained'] : []),
      ...(sdc ? ['--sdc', 'design.sdc'] : []), ...(part.router ? ['--router', part.router] : []), ...part.vopts.flatMap(v => ['--vopt', v])];
    const files = { 'netlist.json': netlistText(), ...(ccf && { 'design.ccf': CCF.write(ccf) }), ...(sdc && { 'design.sdc': sdc }) };
    const nextpnr = tool();
    let out, lines;
    // (a crash of nextpnr's, a WebAssembly trap with no ERROR: line, after some placements (uart's with seeds 1 and 2): placed
    // and routed again with the next seed, up to RETRIES times, each said)
    for (let seed = seed0; ; seed++) {
      lines = [];
      try {
        out = await nextpnr.run(args(seed), files, l => lines.push(l));
        break;
      } catch (e) {
        const trap = !lines.some(l => /^ERROR:/.test(l)) && (e?.name === 'RuntimeError' || /memory access out of bounds|unreachable/.test(e?.message));
        if (!trap || seed - seed0 >= RETRIES) throw new StepError(`nextpnr-himbaechel-gatemate failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)), '');
        log(`WARNING:Place - nextpnr-himbaechel-gatemate crashed with seed ${seed} (${e.message}): placed and routed again with seed ${seed + 1}.`);
      }
    }
    // (its own warnings of a port with no pin: said above, by the port's name; a CCGM1A2's clocks mirrored on both dies: its default)
    const own = /^Warning: (IO '.*' is unconstrained in CCF and will be automatically placed\.|Multi die clock placement strategy set to 'mirror'\.)$/;
    for (const l of lines.filter(l => /^Warning:/.test(l) && !own.test(l))) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    const r = JSON.parse(text(out['report.json']));
    config = text(out['routed.cfg']);
    report.files.routed = io.write('open/routed.cfg', config);
    ctx.setRouted?.(text(out['routed.json']));
    io.write('open/routed.json', text(out['routed.json']));
    const items = gatematePlaced(r).map(([name, u]) => ctx.util(name, u.used, u.available));
    report.map = { utilization: items, warnings: 0, errors: 0 };
    log('Device utilization (nextpnr-himbaechel-gatemate):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    const asked = (ccf?.clocks || []).map(c => c.net);
    const fmax = Object.entries(r.fmax || {}).map(([clock, f]) => ({ clock: clockName(clock), achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }))
      .map(f => ({ ...f, constraint: asked.includes(f.clock) ? f.constraint : null }));
    for (const f of fmax) log(`Clock ${f.clock}: ${f.achieved} MHz (${f.constraint == null ? 'no constraint' : `${f.achieved >= f.constraint ? 'met' : 'NOT met'}, ${f.constraint} MHz asked`})`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', fmax, constraintsMet: fmax.every(f => f.constraint == null || f.achieved >= f.constraint) };
    timing.record(r, fmax);
    log(`Placed and routed by nextpnr-himbaechel-gatemate in ${ms(t)}: ${report.files.routed}`);
  }

  async function runBitgen() {
    const t = now();
    let bytes;
    try { bytes = await tool().pack(configOrEarlier()); } catch (e) { throw new StepError(`gmpack failed: ${e.message}`, [], ''); }
    report.bit = { path: io.write(`${top}.bit`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.bit (${bytes.length} bytes, gmpack in ${ms(t)})`);
  }

  return { steps: { translate: ctx.readNetlist, par: runPar, trce: timing.runTiming, bitgen: runBitgen } };
}

export const GATEMATE = {
  id: 'gatemate', mount: mountGatemate, steps: GATEMATE_STEPS, constraints: CCF,
  synth: scriptSynthesis({ script: top => `synth_gatemate -luttree -nomx8 -top ${top}`, utilization: gatemateUtilization }),
  synthName: (id, resource) => resource?.report || NAMES[id] || id,
};

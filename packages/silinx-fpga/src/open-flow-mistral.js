// Silinx toolchain - the Cyclone V's back end (#5377), a family of open-flow-backends.js's: Yosys's synth_intel_alm -family
// cyclonev, then nextpnr-mistral's place and route (the Mistral project's database), which writes the bitstream itself, the
// .rbf openFPGALoader loads into the FPGA's SRAM (<top>.rbf, #5379); the constraints are a QSF (qsf.js), read by nextpnr-mistral
// (its pins and I/O standards), a clock's period a comment of it (`# create_clock …`) given to nextpnr in an SDC. nextpnr comes
// through io.nextpnr.cyclone5 { run(args, files, onLine) -> files, data(model) -> { '<die>-r.bin': bytes } } (nextpnr-mistral-io.js:
// Silinx's package, @silinx/nextpnr-mistral, built in nextpnr-spartan's CI with Mistral's routing data of the e50f and the
// sx120f: the DE0-CV's, the DE1-SoC's and the DE10-Nano's devices). Experimental, as nextpnr-mistral is upstream.
import { scriptSynthesis } from './synth-script.js';
import { QSF } from './qsf.js';
import { portBits, nextpnrNames } from './nextpnr-ports.js';
import { mountNextpnrTiming } from './nextpnr-timing.js';
import { FAMILY_INFO } from './family.js';

/** The Cyclone V's parts whose routing data @silinx/nextpnr-mistral has (Mistral's e50f: the E A2 / A4; its sx120f: the SE /
 *  SX / ST A5 / A6), by Silinx's part names: the family's openParts (family.js). */
export const MISTRAL_PARTS = FAMILY_INFO.cyclone5.openParts;

/** The Cyclone V's steps, as runFlow runs them: nextpnr-mistral's place and route writes the .rbf, Generate Programming File
 *  makes it the project's. */
export const MISTRAL_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'trce', label: 'Generate Post-Place & Route Static Timing', needs: ['par'] },
  { id: 'bitgen', label: 'Generate Programming File - nextpnr-mistral', needs: ['par'] },
];

// the synthesis's resources, from synth_intel_alm's cells (as scripts/cyclonev-measure.mjs counts them)
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const mistralUtilization = counts => ({
  luts: sum(counts, /^MISTRAL_(ALUT\d|ALUT_ARITH|NOT)$/), flipFlops: sum(counts, /^MISTRAL_FF$/), ios: sum(counts, /^MISTRAL_(IB|OB|IO)$/),
  carry: sum(counts, /^MISTRAL_ALUT_ARITH$/), distributedRam: sum(counts, /^MISTRAL_MLAB$/), blockRam: sum(counts, /^MISTRAL_M10K$/),
  multipliers: sum(counts, /^MISTRAL_MUL\w*$/), clockBuffers: sum(counts, /^MISTRAL_CLKBUF$/), cells: sum(counts, /./),
});
// (the rows' names its own: the Intel parts' resources have no counts yet, their report names Xilinx's)
const NAMES = { luts: 'Number of ALUTs', ffs: 'Number of flip-flops', iob: 'Number of IOs', ramb16: 'Number of M10K blocks', mult18x18: 'Number of DSP blocks',
  bufgmux: 'Number of global clock buffers', dcm: 'Number of PLLs' };

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
// a clock as the report names its net: its input buffer's ($iopadmap$clk) or a global buffer's, or nextpnr-mistral's net out
// of the port's input buffer and its clock buffer (clk_MISTRAL_IB_PAD_O_MISTRAL_CLKBUF_A_Q) -> clk
export const clockName = n => n.replace(/^\$(iopadmap|glbnet|clkbuf)\$/, '').replace(/_MISTRAL_IB_PAD_O(_MISTRAL_CLKBUF_A_Q)?$/, '');

/** The resources a design takes, of nextpnr's report's utilization: [[bel, { used, available }]]. */
export const mistralPlaced = r => Object.entries(r.utilization || {}).filter(([, u]) => u.used && u.available);

/** A QSF's model with its bits as nextpnr names them: led<0> (the model's, as the UCF's) -> led[0]. */
const bitNames = m => {
  const to = n => n.replace(/<(\d+)>$/, '[$1]');
  return { ...m, assignments: Object.fromEntries(Object.entries(m.assignments || {}).map(([n, a]) => [to(n), a])), clocks: (m.clocks || []).map(c => ({ ...c, net: to(c.net) })) };
};

/** The clocks of a QSF's model as nextpnr's SDC: '' with none. */
export const mistralSdc = clocks => clocks.map(c => `create_clock -period ${c.period.toFixed(6)} [get_ports {${c.net}}]\n`).join('');

/** The Cyclone V's model of a spec, as nextpnr-mistral's --device names it (5ceba4, f23, c7 -> 5CEBA4F23C7), or null when the
 *  package has no routing data of its part. */
export const mistralModel = spec => (MISTRAL_PARTS.test(String(spec.device || '').toLowerCase())
  ? `${spec.device}${spec.pkg || ''}${String(spec.speed || '').replace(/^-/, '')}`.toUpperCase() : null);

// the routed design's .rbf kept between the steps as text (io.read reads text): base64
const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = b64 => Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));

function mountMistral(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const timing = mountNextpnrTiming(ctx, { tool: 'nextpnr-mistral', clockName });
  const tool = () => {
    if (!io.nextpnr?.cyclone5) throw new StepError('nextpnr-mistral is not in this installation (io.nextpnr.cyclone5)', [], 'Install it: npm install @silinx/nextpnr-mistral');
    return io.nextpnr.cyclone5;
  };

  async function runPar() {
    const model = mistralModel(spec);
    if (!model) throw new StepError(`${spec.device}: not a Cyclone V part of nextpnr-mistral here (the 5CEBA2 / A4, the 5CSEMA5 / A6 and their kin: Mistral's e50f and sx120f)`, [], 'Implement it with Intel Quartus Prime.');
    const t = now();
    const bits = portBits(netlistText(), top);
    const read = constraints(), qsf = read && nextpnrNames(bitNames(read), bits);
    const pins = qsf?.assignments || {};
    for (const p of bits.map(b => b.name).filter(n => !pins[n]?.loc)) log(`WARNING:Place - the port ${p} has no pin (set_location_assignment in the QSF): nextpnr places it anywhere.`);
    const sdc = mistralSdc(qsf?.clocks || []);
    const np = tool();
    let data;
    try { data = await np.data(model); } catch (e) {
      throw new StepError(`nextpnr-mistral's routing data of ${model} could not be loaded (${e.message})`, [], 'Implement again when this computer is online: the data are downloaded once, then kept.');
    }
    const args = ['--device', model, '--json', 'netlist.json', '--rbf', 'design.rbf', '--write', 'routed.json', '--report', 'report.json',
      '--seed', String(spec.seed || 1), '--timing-allow-fail', ...(qsf ? ['--qsf', 'design.qsf'] : []), ...(sdc ? ['--sdc', 'design.sdc'] : []),
      // (nextpnr-mistral leaves the SDC's clock on the port's net, not past its clock buffer: the fastest clock asked is its target)
      ...(qsf?.clocks?.length ? ['--freq', String(Math.max(...qsf.clocks.map(c => 1000 / c.period)))] : [])];
    const files = { ...data, 'netlist.json': netlistText(), ...(qsf && { 'design.qsf': QSF.write(qsf) }), ...(sdc && { 'design.sdc': sdc }) };
    const lines = [];
    let out;
    try { out = await np.run(args, files, l => lines.push(l)); } catch (e) {
      throw new StepError(`nextpnr-mistral failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)), '');
    }
    for (const l of lines.filter(l => /^Warning:/.test(l))) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    const r = JSON.parse(text(out['report.json']));
    report.files.routed = io.write('open/routed.rbf.b64', toBase64(out['design.rbf']));
    ctx.setRouted?.(text(out['routed.json']));
    io.write('open/routed.json', text(out['routed.json']));
    const items = mistralPlaced(r).map(([name, u]) => ctx.util(name, u.used, u.available));
    report.map = { utilization: items, warnings: 0, errors: 0 };
    log('Device utilization (nextpnr-mistral):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    const asked = (qsf?.clocks || []).map(c => c.net);
    const fmax = Object.entries(r.fmax || {}).map(([clock, f]) => ({ clock: clockName(clock), achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }))
      .map(f => ({ ...f, constraint: asked.includes(f.clock) ? f.constraint : null }));
    for (const f of fmax) log(`Clock ${f.clock}: ${f.achieved} MHz (${f.constraint == null ? 'no constraint' : `${f.achieved >= f.constraint ? 'met' : 'NOT met'}, ${f.constraint} MHz asked`})`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', fmax, constraintsMet: fmax.every(f => f.constraint == null || f.achieved >= f.constraint) };
    timing.record(r, fmax);
    log(`Placed and routed by nextpnr-mistral in ${ms(t)}`);
  }

  async function runBitgen() {
    const b64 = io.read('open/routed.rbf.b64');
    if (b64 == null) throw new StepError('no routed design: run Place & Route first', [], '');
    const bytes = fromBase64(b64);
    report.bit = { path: io.write(`${top}.rbf`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.rbf (${bytes.length} bytes, nextpnr-mistral's)`);
  }

  return { steps: { translate: ctx.readNetlist, par: runPar, trce: timing.runTiming, bitgen: runBitgen } };
}

export const MISTRAL = {
  id: 'cyclone5', mount: mountMistral, steps: MISTRAL_STEPS, constraints: QSF,
  // (-nodsp: nextpnr-mistral has no place for the DSP blocks' MISTRAL_MUL18X18 yet: the multipliers in the logic)
  synth: scriptSynthesis({ script: top => `synth_intel_alm -family cyclonev -nodsp -top ${top}`, utilization: mistralUtilization }),
  synthName: (id, resource) => NAMES[id] || resource?.report || id,
};

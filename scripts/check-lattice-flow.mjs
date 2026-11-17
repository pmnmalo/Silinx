// What proves an iCE40 or ECP5 build (#2301), as check-open-flow.mjs proves a Spartan one against ISE: each example on the
// family's board (the iCEBreaker, the ULX3S), built by the Silinx toolchain as the application builds it (server/open-flow.js:
// its constraints from the board's pins), then checked three ways, none of them Silinx's own code alone:
//   - the timing: nextpnr's static timing of the routed design meets the board's clock (IceStorm's icetime is not in YoWASP's
//     packages: nextpnr's timing analysis is the one there is);
//   - the bitstream: read back by Project IceStorm's iceunpack / Project Trellis's ecpunpack and packed again by icepack /
//     ecppack, the same bytes (the bitstream is one the vendors' formats' independent tools read as a configuration);
//   - the behaviour: the Post-Place & Route model (nextpnr's routed design of the design synthesized with the test bench's
//     generics, simulated with Silinx's models of the family's cells, core/flow-models-nextpnr.js) runs the example's own test
//     bench as the project's RTL does: the same log, line for line, no warning (the RTL's own pass said apart: vga's test bench,
//     written for the example's board, fails on another board's clock, on the RTL and on the model alike).
// Runs on real boards (#1830) are the fourth proof, by hand.
//
//   node scripts/check-lattice-flow.mjs [--family ice40|ecp5] [example …]   (default: both families, every example)
//   npm run check:lattice-flow
// Prints one line per example and family, then the failures; exits 1 when one failed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The families checked: their board, the bitstream's extension and its tools' (YoWASP's) unpack and pack. */
export const FAMILIES = {
  ice40: { board: 'icebreaker', ext: 'bin', pkg: '@yowasp/nextpnr-ice40', unpack: ['runIceunpack', 'routed.asc'], pack: 'runIcepack' },
  ecp5: { board: 'ulx3s', ext: 'bit', pkg: '@yowasp/nextpnr-ecp5', unpack: ['runEcpunpack', 'routed.config'], pack: 'runEcppack' },
};
const quiet = { stdout: () => {}, stderr: () => {}, fetchProgress: () => {}, decodeASCII: false };

/** The bitstream read back and packed again: { same, size } (same: the same bytes). */
export async function roundTrip(family, bytes) {
  const f = FAMILIES[family], tools = await import(f.pkg);
  const [unpack, text] = f.unpack;
  const cfg = (await tools[unpack](['design.in', text], { 'design.in': bytes }, quiet))[text];
  const again = (await tools[f.pack]([text, 'design.out'], { [text]: cfg }, quiet))['design.out'];
  return { same: Buffer.from(again).equals(Buffer.from(bytes)), size: bytes.length };
}

/** A simulation of the example's test bench against `design` (sources: its RTL, or a model's netlist): its log's lines (a
 *  warning or an error marked), the elaboration's messages first. */
async function simulateWith(name, design) {
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const { Simulator } = await import('../core/simulator.js');
  const { example } = await import('../test/examples-lib.mjs');
  const ex = example(name);
  const srcs = [...design, ...ex.sim.map(({ path: p, lang, text }) => ({ path: p, lang, text }))];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, ex.project.simTop);
  const diags = [...lib.errors, ...d.diags].map((x) => `${x.severity === 'warning' ? 'WARNING' : 'ERROR'}: ${x.file}:${x.line} ${x.message}`);
  if (diags.some((l) => l.startsWith('ERROR'))) return diags;
  const s = new Simulator(d, { files: new Map(srcs.map((x) => [x.path, x.text])) });
  for (const sig of d.signals) sig.wave = null;
  const until = name === 'vga' ? 3e10 : 1e11;
  for (let t = until / 100; t <= until; t += until / 100) { const st = s.run(t); if (st.finished || s.log.some((e) => /Simulation finished OK|ERROR/.test(e.text))) break; }
  // (a test bench's assertion of severity error, its text without the word: ERROR)
  return [...diags, ...s.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : e.kind === 'error' ? 'ERROR: ' : ''}${e.text}`)];
}
/** A model's simulation (its Verilog file) against the example's test bench. */
export const simulateModel = (name, file) => simulateWith(name, [{ path: path.basename(file), lang: 'verilog', text: fs.readFileSync(file, 'utf8') }]);
// the example's design as the board's project has it: its sources, each file the project rewrote (the board's top: its clock's
// generics, #3710) from the project's folder
async function projectDesign(name, dir) {
  const { example } = await import('../test/examples-lib.mjs');
  const ex = example(name);
  return ex.design.map((src) => {
    const own = path.join(ex.dir, src.path), mine = path.join(dir, src.path);
    if (!fs.existsSync(own) || !fs.existsSync(mine)) return src;
    const text = fs.readFileSync(mine, 'utf8');
    return text === fs.readFileSync(own, 'utf8') ? src : { ...src, text };
  });
}

/** One example checked on a family's board: { name, family, ok, build, timing, bitstream, model, failures }. */
export async function checkExample(name, family, into) {
  const { exampleProject, exampleBoard, silinxFlow } = await import('../test/examples-lib.mjs');
  const f = FAMILIES[family];
  const { dir, project } = exampleProject(name, exampleBoard(name, { board: f.board }), into);
  const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'trce', 'bitgen', 'postpar']);
  const out = { name, family, failures: [] };
  out.build = job.status === 'ok';
  if (!out.build) out.failures.push(`the build failed: ${job.lines.filter((l) => /ERROR/.test(l)).slice(0, 3).join(' | ')}`);
  // (the board's clock: every clock nextpnr reports met; a design with none, gates', has nothing to meet)
  const clocks = job.lines.filter((l) => /^Clock \S+: [\d.]+ MHz \(/.test(l));
  out.timing = out.build && clocks.every((l) => /\(met,/.test(l));
  out.clocks = clocks.length;
  if (out.build && !out.timing) out.failures.push(`the timing: ${clocks.join(' | ')}`);
  const bit = path.join(dir, 'build', `${project.top}.${f.ext}`);
  if (out.build && fs.existsSync(bit)) {
    const r = await roundTrip(family, fs.readFileSync(bit));
    out.bitstream = r.same;
    if (!r.same) out.failures.push(`the bitstream: ${f.unpack[0]} then ${f.pack} gave other bytes`);
  } else out.bitstream = false;
  const model = path.join(dir, 'build', 'netgen', 'par', `${project.top}_timesim.v`);
  if (out.build && fs.existsSync(model)) {
    // (as the RTL of the same project: the test bench's log the same, line for line; its own pass on the RTL said apart, a test
    // bench written for the example's own board failing on another board's clock, vga's)
    const rtl = await simulateWith(name, await projectDesign(name, dir));
    const log = await simulateModel(name, model);
    out.rtlPasses = rtl.includes('Simulation finished OK') && !rtl.some((l) => /ERROR|WARNING/.test(l));
    out.model = JSON.stringify(log) === JSON.stringify(rtl);
    if (!out.model) {
      const i = log.findIndex((l, k) => l !== rtl[k]);
      out.failures.push(`the post-route model's test bench differs from the RTL's: line ${i + 1}, ${JSON.stringify(log[i] ?? '(none)')} for ${JSON.stringify(rtl[i] ?? '(none)')}`);
    }
  } else out.model = false;
  out.ok = out.build && out.timing && out.bitstream && out.model;
  return out;
}

async function main(argv) {
  const { EXAMPLES } = await import('../test/examples-lib.mjs');
  const fi = argv.indexOf('--family');
  const families = fi >= 0 ? [argv[fi + 1]] : Object.keys(FAMILIES);
  const names = argv.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
  for (const f of families) if (!FAMILIES[f]) { console.error(`--family: ${Object.keys(FAMILIES).join(' or ')}`); return 2; }
  for (const n of names) if (!EXAMPLES.includes(n)) { console.error(`${n}: not an example (${EXAMPLES.join(', ')})`); return 2; }
  const into = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-lattice-check-'));
  process.env.SILINX_CONFIG_DIR ||= path.join(into, 'config');
  const results = [];
  const mark = (b) => (b ? 'ok' : 'FAIL');
  try {
    for (const family of families) {
      for (const name of names.length ? names : EXAMPLES) {
        const r = await checkExample(name, family, into);
        results.push(r);
        console.log(`${family.padEnd(6)} ${name.padEnd(11)} build ${mark(r.build)}, timing ${r.build && !r.clocks ? 'no clock' : mark(r.timing)}, bitstream round trip ${mark(r.bitstream)}, post-route model ${mark(r.model)}${r.model && !r.rtlPasses ? ' (as the RTL, whose test bench fails on this board\'s clock)' : ''}`);
      }
    }
  } finally { fs.rmSync(into, { recursive: true, force: true }); }
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.log(`FAILED ${r.family} ${r.name}: ${r.failures.join('; ')}`);
  console.log(`${results.length - failed.length} of ${results.length} checked builds proved.`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

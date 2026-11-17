#!/usr/bin/env node
// The 7-series' open flow checked (#3145), as scripts/check-open-flow.mjs checks the Spartan-3E's against ISE: Vivado reads
// no FASM and cannot rebuild a .bit offline, so a byte-identical .bit is not the oracle here. Each design is built by the
// application's open flow (server/open-flow.js: Yosys's synth_xilinx, nextpnr-himbaechel-xc7, the .bit from nextpnr's FASM)
// and its .bit checked with no Vivado (packages/silinx-fpga/src/fpga/xc7/check.js):
//   - its frames the ones Project X-Ray's fasm2frames makes of the FASM;
//   - the round trip: the .bit read back into features (bit2fasm) and compared with the FASM by bits: none lost, none stray;
//   - its pins: each port's IOB at its XDC pin, its direction and its IO standard the XDC's, no other IOB configured.
// The open flow's own warnings are listed. With --vivado, the same designs are then built by AMD Vivado through
// scripts/xc7-vivado-compare.mjs (Vivado's own flow, and Silinx's netlist placed and routed by Vivado: its DRC, timing and
// utilisation against the open flow's, its write_cfgmem on Silinx's .bit; test/xc7-vivado-comparison.test.js holds the
// margins), on the ISE runner's machine (SILINX_ISE_HOST, as that script reads it).
//
//   npm run check:xc7 [-- --boards basys3,nexys-a7] [--filter '^(blinky|pong)$'] [--vivado] [project folder …]
//   (default: every example on both boards; a project folder: a 7-series project, built on a copy)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The command line: { boards, filter, vivado, folders } or { error }. */
export function parseArgs(argv) {
  const out = { boards: null, filter: null, vivado: false, folders: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vivado') out.vivado = true;
    else if (a === '--boards' || a === '--filter') {
      if (argv[i + 1] == null || argv[i + 1].startsWith('--')) return { error: `${a}: a value is missing` };
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) return { error: `unknown option ${a}` };
    else out.folders.push(a);
  }
  if (out.folders.length && (out.boards || out.filter)) return { error: '--boards and --filter are for the examples, not a project folder' };
  return out;
}

/** A design's line: its checks' outcome (check.js checkBitXc7's result), the open flow's warnings after it. */
export function reportLine(name, r, warnings = []) {
  const rt = r.roundTrip.counts;
  const head = r.ok ? `${name}: ok (${r.frames.reference} frames fasm2frames', round trip by bits: the FASM's ${rt.features} bits, ${rt.read} features read back; ${r.pins?.checked ?? 0} pins)`
    : `${name}: FAILED\n${r.errors.map(e => `  ${e}`).join('\n')}`;
  return [head, ...warnings.map(w => `  open flow: ${w}`)].join('\n');
}

const indexes = new Map();
async function indexOf(part) {
  if (!indexes.has(part)) {
    const { bitIndexXc7 } = await import('../packages/silinx-fpga/src/index.js');
    const { XC7_DB_DIR } = await import('../packages/silinx-fpga/src/node.js');
    indexes.set(part, bitIndexXc7(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${part}.json.gz`))).toString('utf8'))));
  }
  return indexes.get(part);
}

/** A built project's .bit checked (its build/open folder: the netlist, the FASM; its XDC): checkBitXc7's result. */
export async function checkBuild(dir, project, part) {
  const { checkBitXc7, xdcPins, readXdc } = await import('../packages/silinx-fpga/src/index.js');
  const open = path.join(dir, 'build', 'open');
  const netlist = fs.readFileSync(path.join(open, `${project.top}.json`), 'utf8');
  const top = Object.entries(JSON.parse(netlist).modules).find(([, m]) => m.attributes?.top)?.[0] || project.top;
  const pins = xdcPins(readXdc(fs.readFileSync(path.join(dir, project.constraints), 'utf8')), netlist, top);
  return checkBitXc7(await indexOf(part), { fasm: fs.readFileSync(path.join(open, 'routed.fasm'), 'utf8'),
    bit: new Uint8Array(fs.readFileSync(path.join(dir, 'build', `${project.top}.bit`))), pins });
}

async function build(dir, project) {
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  await runOpenImplementation(job, { project, projectDir: dir, steps: ['synth', 'translate', 'par', 'trce', 'bitgen'] });
  return lines.filter(l => /WARNING|ERROR/.test(l));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) { console.error(`${args.error}\nusage: node scripts/check-xc7.mjs [--boards basys3,nexys-a7] [--filter re] [--vivado] [project folder …]`); process.exit(2); }
  const { selectDesigns } = await import('./xc7-timing-vivado.mjs');
  const { EXAMPLES, exampleProject } = await import('../test/examples-lib.mjs');
  const { vivadoPart } = await import('../server/vivado.js');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-check-'));
  let failed = 0;
  try {
    const designs = args.folders.length
      ? args.folders.map((f, i) => {
        const project = JSON.parse(fs.readFileSync(path.join(f, 'silinx.json'), 'utf8'));
        const dir = path.join(work, `${i}-${path.basename(path.resolve(f))}`);
        fs.cpSync(f, dir, { recursive: true, filter: s => !/[\\/]build$/.test(s) });
        return { id: path.basename(path.resolve(f)), dir, project, part: vivadoPart(project.device) };
      })
      : selectDesigns(EXAMPLES, (args.boards || 'basys3,nexys-a7').split(','), args.filter).map(d => ({ ...d, ...exampleProject(d.name, { board: d.board }, work) }));
    if (!designs.length) { console.error('no design selected (--boards, --filter)'); process.exit(2); }
    for (const d of designs) {
      let line;
      try {
        const warnings = await build(d.dir, d.project);
        const r = await checkBuild(d.dir, d.project, d.part);
        if (!r.ok) failed++;
        line = reportLine(d.id, r, warnings);
      } catch (e) { failed++; line = `${d.id}: FAILED\n  ${e.message}`; }
      console.log(line);
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  if (args.vivado) {
    if (args.folders.length) { console.error('--vivado: the examples only (scripts/xc7-vivado-compare.mjs)'); process.exit(2); }
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xc7-vivado-compare.mjs'), ...(args.boards ? ['--boards', args.boards] : []),
      ...(args.filter ? ['--filter', args.filter] : [])], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `${failed} FAILED` : 'all checks passed');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e.message); process.exit(1); });

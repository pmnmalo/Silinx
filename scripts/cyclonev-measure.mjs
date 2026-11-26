#!/usr/bin/env node
// The Cyclone V's measurement (#5377): what of the examples the open tools take on a Cyclone V, before the family has a flow
// of the Silinx toolchain. Each example is made a project for the ULX3S and synthesised by the Silinx toolchain to its flat
// Verilog (machxo2-measure.mjs exampleNetlist), then mapped by Yosys's synth_intel_alm -family cyclonev (YoWASP's
// @yowasp/yosys, the Silinx toolchain's own) onto the Cyclone V's cells: its ALMs' adaptive LUTs (MISTRAL_ALUT*), their
// carry chains (MISTRAL_ALUT_ARITH), the flip-flops (MISTRAL_FF), the MLABs and M10Ks, the DSPs. The place and route
// (nextpnr-mistral) and the bitstream (Mistral's .rbf) are not measured: no build of nextpnr-mistral for WebAssembly exists
// (YoWASP has none) and none is installed (#5377's notes).
//   node scripts/cyclonev-measure.mjs [--examples gates,blinky] [--json out.json]
// prints a Markdown table: synthesis, its size, its warnings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../test/examples-lib.mjs';
import { cellCounts, exampleNetlist, run } from './machxo2-measure.mjs';

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
const sum = (cells, re) => Object.entries(cells).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
const KNOWN = /^(MISTRAL_ALUT\w*|MISTRAL_NOT|MISTRAL_FF|MISTRAL_MLAB|MISTRAL_M10K|MISTRAL_MUL\w*|MISTRAL_IB|MISTRAL_OB|MISTRAL_IO|MISTRAL_CLKBUF)$/;

/** The synthesis's size on the Cyclone V: adaptive LUTs (their carry chains' among them), flip-flops, MLABs, M10Ks, DSP
 *  multipliers, I/O buffers, the other cells by name. */
export const synthSize = cells => ({
  aluts: sum(cells, /^MISTRAL_(ALUT\w*|NOT)$/), carry: sum(cells, /^MISTRAL_ALUT_ARITH$/), ffs: sum(cells, /^MISTRAL_FF$/),
  mlab: sum(cells, /^MISTRAL_MLAB$/), m10k: sum(cells, /^MISTRAL_M10K$/), dsp: sum(cells, /^MISTRAL_MUL\w*$/), ios: sum(cells, /^MISTRAL_(IB|OB|IO)$/),
  other: Object.keys(cells).filter(t => !KNOWN.test(t)).sort(),
});

/** The Cyclone V's synthesis of a flat Verilog: { ok, cells, size, warnings } or { ok: false, error, warnings }. */
export async function measureNetlist({ syn, top }) {
  const { runYosys } = await import('@yowasp/yosys');
  const y = await run(runYosys, ['-q', '-p', `read_verilog -sv top_syn.v; synth_intel_alm -family cyclonev -top ${top}; write_json netlist.json`], { 'top_syn.v': syn });
  const warnings = y.lines.filter(l => /^Warning:/.test(l)).map(l => l.replace(/^Warning:\s*/, ''));
  if (y.error) return { ok: false, error: y.error, warnings };
  const cells = cellCounts(text(y.files['netlist.json']), top);
  return { ok: true, cells, size: synthSize(cells), warnings };
}

/** The results as a Markdown table. */
export function table(results) {
  const rows = ['| Example | Synthesis (ALUTs / carry / FFs) | MLAB / M10K / DSP | I/O | Other cells | Warnings |', '|---|---|---|---|---|---|'];
  for (const r of results) {
    const s = r.size;
    rows.push(`| ${r.name} | ${r.ok ? `${s.aluts} / ${s.carry} / ${s.ffs}` : `no: ${r.error}`} | ${r.ok ? `${s.mlab} / ${s.m10k} / ${s.dsp}` : '-'} | ${r.ok ? s.ios : '-'} | ${
      r.ok ? s.other.join(', ') || 'none' : '-'} | ${r.warnings?.length ? r.warnings.length === 1 ? r.warnings[0] : `${r.warnings.length}: ${[...new Set(r.warnings)].slice(0, 3).join('; ')}` : 'none'} |`);
  }
  return rows.join('\n');
}

async function main(argv) {
  const opt = (name, def) => { const i = argv.indexOf(name); return i < 0 ? def : argv[i + 1]; };
  const names = (opt('--examples', '') || EXAMPLES.join(',')).split(',');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-cyclonev-'));
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
  const results = [];
  try {
    for (const name of names) {
      const t = Date.now(), n = await exampleNetlist(name, tmp);
      const r = n.error ? { name, ok: false, error: n.error } : { name, ...(await measureNetlist(n)) };
      r.seconds = Math.round((Date.now() - t) / 1000);
      results.push(r);
      process.stderr.write(`${name}: ${r.ok ? `${r.size.aluts} ALUTs, ${r.size.ffs} FFs` : 'failed'} (${r.seconds} s)\n`);
    }
    console.log(`\n### Cyclone V (synth_intel_alm -family cyclonev)\n\n${table(results)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const out = opt('--json');
  if (out) fs.writeFileSync(out, `${JSON.stringify(results, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));

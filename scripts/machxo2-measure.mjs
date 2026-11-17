#!/usr/bin/env node
// The MachXO2's measurement (#2302): what of the examples builds on a MachXO2 (or MachXO3) part with the open tools, before
// the family is added to Silinx. Each example is made a project for the ULX3S (the ECP5's board: its clock, 25 MHz, as
// the top's generics) and synthesised by the Silinx toolchain to its flat Verilog (open/<top>_syn.v); then Yosys's
// synth_lattice -family xo2 (xo3: synth_machxo2 is gone from Yosys), nextpnr-machxo2 and ecppack (Project Trellis), the
// two of YoWASP's @yowasp/nextpnr-machxo2 (a development dependency). The clock, clk, is given a pin of the part (CLOCK_PIN:
// nextpnr-machxo2 fails to route a global clock from a pin it placed itself, one design in about fifteen, by the seed:
// YosysHQ/nextpnr#1236); the other ports none (nextpnr places them, each warned): a board's LPF is the next step. The
// board's clock asked of nextpnr (FREQUENCY PORT, from the ULX3S's LPF).
// The bitstream is read back (ecpunpack) and packed again, the same bytes asked.
//   node scripts/machxo2-measure.mjs [--device LCMXO2-1200HC-4TG100C]... [--examples gates,blinky] [--seed 1] [--json out.json]
// prints a Markdown table per device: synthesis, place and route, bitstream, warnings, size.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, ECP5_TARGETS, exampleBoard, exampleProject, silinxFlow } from '../test/examples-lib.mjs';

export const DEVICES = ['LCMXO2-1200HC-4TG100C', 'LCMXO3LF-6900C-5BG256C'];
/** The pin given the clock on each package (any of its I/O pins routes it). */
const CLOCK_PIN = { TG100: '27', BG256: 'C8' };
const clockPin = device => CLOCK_PIN[/-\d([A-Z]+\d+)[CI]$/i.exec(device)?.[1]?.toUpperCase()];

/** synth_lattice's family of a part: xo2 (LCMXO2-…), xo3 (LCMXO3L-…, LCMXO3LF-…). */
export const familyOf = device => (/^LCMXO3/i.test(device) ? 'xo3' : /^LCMXO2/i.test(device) ? 'xo2' : null);

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
const sum = (cells, re) => Object.entries(cells).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);

/** The netlist's cells by type, Yosys's JSON's top module's ({ LUT4: 127, … }). */
export function cellCounts(json, top) {
  const m = JSON.parse(json).modules[top];
  const counts = {};
  for (const c of Object.values(m?.cells || {})) counts[c.type] = (counts[c.type] || 0) + 1;
  return counts;
}

/** The synthesis's size: LUT4s, flip-flops, carries, distributed and block RAM, multipliers, the other cells. */
export const synthSize = cells => ({
  luts: sum(cells, /^LUT4$/), ffs: sum(cells, /^TRELLIS_FF$/), carry: sum(cells, /^CCU2D$/), muxes: sum(cells, /^(PFUMX|L6MUX21)$/),
  dram: sum(cells, /^TRELLIS_DPR16X4$/), bram: sum(cells, /^(DP8KC|PDPW8KC|SP8KC)$/), mult: sum(cells, /^MULT/),
  other: Object.keys(cells).filter(t => !/^(LUT4|TRELLIS_FF|CCU2D|PFUMX|L6MUX21|TRELLIS_DPR16X4|DP8KC|PDPW8KC|SP8KC|MULT\w*|TRELLIS_IO)$/.test(t)).sort(),
});

/** nextpnr's warnings split: the ports it placed itself (no pin in the LPF) and the others, as they are. */
export function splitWarnings(lines) {
  const unpinned = [], other = [];
  for (const l of lines.filter(x => /^Warning:/.test(x))) {
    const m = /^Warning: IO '(.+)' is unconstrained in LPF and will be automatically placed$/.exec(l);
    if (m) unpinned.push(m[1]); else other.push(l.replace(/^Warning:\s*/, ''));
  }
  return { unpinned, other };
}

/** The ULX3S's LPF's clock constraints only (FREQUENCY PORT): nextpnr-machxo2 is asked the board's clock, the pins left. */
export const clockLpf = lpf => lpf.split(/\r?\n/).filter(l => /^\s*FREQUENCY\s+PORT\b/i.test(l)).join('\n');

/** The LPF given nextpnr-machxo2: the clock's FREQUENCY and, for a clocked design, clk's pin on the device's package. */
export function deviceLpf(lpf, device) {
  const pin = /FREQUENCY\s+PORT\s+"clk"/i.test(lpf) && clockPin(device);
  return pin ? `${lpf}\nLOCATE COMP "clk" SITE "${pin}";` : lpf;
}

let tools = null;
async function load() {
  if (tools) return tools;
  const { runYosys } = await import('@yowasp/yosys');
  const { runNextpnrMachxo2, runEcppack, runEcpunpack } = await import('@yowasp/nextpnr-machxo2');
  return (tools = { runYosys, runNextpnrMachxo2, runEcppack, runEcpunpack });
}

// a YoWASP tool's run: its output files and its lines, or its error and its lines
async function run(fn, args, files) {
  const lines = [];
  let rest = '';
  const out = b => {
    if (b === null) { if (rest) lines.push(rest); rest = ''; return; }
    const ls = (rest + new TextDecoder().decode(b)).replace(/\x1b\[[0-9;]*m/g, '').split('\n');   // (Yosys's colours)
    rest = ls.pop();
    lines.push(...ls);
  };
  try {
    const files2 = await fn(args, files, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
    if (rest) lines.push(rest);
    return { files: files2, lines };
  } catch (e) {
    if (rest) lines.push(rest);
    const error = lines.filter(l => /^ERROR:/.test(l)).pop() || (e?.code != null ? `exit code ${e.code}` : String(e?.message || e));
    return { error, lines };
  }
}

/** The MachXO2 part's back half on a synthesised flat Verilog: { synth, par, bit }, each { ok, … } or { ok: false, error }. */
export async function measureNetlist({ syn, top, lpf: clocks = '', device, seed = 1 }) {
  const lpf = deviceLpf(clocks, device);
  const { runYosys, runNextpnrMachxo2, runEcppack, runEcpunpack } = await load();
  const r = { device, synth: { ok: false }, par: { ok: false }, bit: { ok: false } };
  const y = await run(runYosys, ['-q', '-p', `read_verilog -sv top_syn.v; synth_lattice -family ${familyOf(device)} -top ${top}; write_json netlist.json`], { 'top_syn.v': syn });
  r.synth.warnings = y.lines.filter(l => /^Warning:/.test(l)).map(l => l.replace(/^Warning:\s*/, ''));
  if (y.error) return { ...r, synth: { ...r.synth, error: y.error } };
  const json = text(y.files['netlist.json']);
  const cells = cellCounts(json, top);
  r.synth = { ...r.synth, ok: true, cells, size: synthSize(cells) };
  const args = ['--device', device, '--json', 'netlist.json', '--textcfg', 'routed.config', '--report', 'report.json', '--seed', String(seed),
    '--timing-allow-fail', '--lpf-allow-unconstrained', ...(lpf ? ['--lpf', 'design.lpf'] : [])];
  const n = await run(runNextpnrMachxo2, args, { 'netlist.json': json, ...(lpf && { 'design.lpf': lpf }) });
  r.par.warnings = splitWarnings(n.lines);
  if (n.error) return { ...r, par: { ...r.par, error: n.error } };
  const rep = JSON.parse(text(n.files['report.json']));
  const util = Object.fromEntries(Object.entries(rep.utilization || {}).filter(([, u]) => u.used).map(([k, u]) => [k, [u.used, u.available]]));
  const fmax = Object.entries(rep.fmax || {}).map(([clock, f]) => ({ clock: clock.replace(/\$.*$/, ''), achieved: +f.achieved.toFixed(1), constraint: +f.constraint.toFixed(1) }));
  r.par = { ...r.par, ok: true, util, fmax };
  const p = await run(runEcppack, ['routed.config', 'design.bit'], { 'routed.config': n.files['routed.config'] });
  if (p.error) return { ...r, bit: { ok: false, error: p.error, lines: p.lines.slice(-5) } };
  const bit = p.files['design.bit'];
  r.bit = { ok: true, size: bit.length, warnings: p.lines.filter(l => /warning/i.test(l)) };
  // the bitstream read back by ecpunpack and packed again: the same bytes (Project Trellis's database knows every bit it set)
  const u = await run(runEcpunpack, ['design.bit', 'unpacked.config'], { 'design.bit': bit });
  const again = !u.error && await run(runEcppack, ['unpacked.config', 'again.bit'], { 'unpacked.config': u.files['unpacked.config'] });
  r.bit.roundTrip = !!again && !again.error && Buffer.compare(Buffer.from(again.files['again.bit']), Buffer.from(bit)) === 0;
  return r;
}

/** An example's flat Verilog, by the Silinx toolchain's synthesis on the ULX3S (the ECP5's board): { syn, top, lpf } or { error }. */
export async function exampleNetlist(name, into) {
  const { dir, project } = exampleProject(name, exampleBoard(name, ECP5_TARGETS[0]), into);
  const job = await silinxFlow(dir, project, ['synth']);
  if (job.status !== 'ok') return { error: job.lines.filter(l => /error/i.test(l)).slice(-3).join(' | ') || job.status };
  const top = project.top;
  return { top, syn: fs.readFileSync(path.join(dir, 'build', 'open', `${top}_syn.v`), 'utf8'), lpf: clockLpf(fs.readFileSync(path.join(dir, project.constraints), 'utf8')) };
}

const cell = (ok, s) => (ok ? (s ?? 'yes') : 'no');
const bitCell = b => (b.ok ? `${b.size} bytes${b.roundTrip ? '' : ' (not read back the same)'}` : b.error ? `no: ${b.error}` : '-');
/** A device's results as a Markdown table. */
export function table(results) {
  const rows = ['| Example | Synthesis (LUT4 / FF / CCU2D / RAM) | Place & route (slices\' LUTs, FFs, IOs) | Fmax at 25 MHz | Bitstream | Warnings |', '|---|---|---|---|---|---|'];
  for (const r of results) {
    const s = r.synth?.size;
    const ram = s ? [s.dram && `${s.dram} DPR16X4`, s.bram && `${s.bram} EBR`].filter(Boolean).join(', ') || '0' : '';
    const u = k => (r.par.util?.[k] ? `${r.par.util[k][0]}/${r.par.util[k][1]}` : '0');
    const warn = [...(r.synth?.warnings || []).map(w => `Yosys: ${w}`), ...(r.par?.warnings?.other || []).map(w => `nextpnr: ${w}`),
      ...(r.bit?.warnings || []).map(w => `ecppack: ${w}`)];
    rows.push(`| ${r.name} | ${r.error ? `no: ${r.error}` : cell(r.synth.ok, s && `${s.luts} / ${s.ffs} / ${s.carry} / ${ram}`) || r.synth.error} | ${
      r.par.ok ? `${u('TRELLIS_COMB')}, ${u('TRELLIS_FF')}, ${u('TRELLIS_IO')}` : r.par.error ? `no: ${r.par.error}` : '-'} | ${
      r.par.fmax?.length ? r.par.fmax.map(f => `${f.achieved} MHz`).join(', ') : r.par.ok ? '(no clock)' : '-'} | ${
      bitCell(r.bit)} | ${warn.length ? warn.length === 1 ? warn[0] : `${warn.length}: ${[...new Set(warn)].slice(0, 3).join('; ')}` : 'none'} |`);
  }
  return rows.join('\n');
}

async function main(argv) {
  const opt = (name, def) => { const i = argv.indexOf(name); return i < 0 ? def : argv[i + 1]; };
  const devices = argv.flatMap((a, i) => (a === '--device' ? [argv[i + 1]] : []));
  const names = (opt('--examples', '') || EXAMPLES.join(',')).split(',');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-machxo2-'));
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
  const all = {};
  try {
    const nets = {};
    for (const name of names) nets[name] = await exampleNetlist(name, tmp);
    for (const device of devices.length ? devices : DEVICES) {
      const results = [];
      for (const name of names) {
        const t = Date.now();
        const n = nets[name];
        const r = n.error ? { name, error: n.error, synth: {}, par: {}, bit: {} } : { name, ...(await measureNetlist({ ...n, device, seed: +opt('--seed', 1) })) };
        r.seconds = Math.round((Date.now() - t) / 1000);
        results.push(r);
        process.stderr.write(`${device} ${name}: ${r.bit.ok ? `${r.bit.size} bytes` : 'failed'} (${r.seconds} s)\n`);
      }
      all[device] = results;
      console.log(`\n### ${device}\n\n${table(results)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const out = opt('--json');
  if (out) fs.writeFileSync(out, `${JSON.stringify(all, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));

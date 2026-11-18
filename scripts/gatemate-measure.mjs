#!/usr/bin/env node
// The GateMate's measurement (#2431): what of the examples builds on a Cologne Chip GateMate with the open tools, before the
// family is added to Silinx. Each example is made a project for the ULX3S (the ECP5's board: its clock, 25 MHz, as the top's
// generics) and synthesised by the Silinx toolchain to its flat Verilog (open/<top>_syn.v); then Yosys's synth_gatemate,
// nextpnr-himbaechel's gatemate and gmpack (Project Peppercorn), the two of YoWASP's @yowasp/nextpnr-himbaechel-gatemate (a
// development dependency). The clock, clk, is given the GateMate A1 Evaluation Board's clock pin (CLOCK_PIN, a global clock
// input); the other ports none (nextpnr places them, each warned): a board's CCF is the next step. The board's clock asked
// of nextpnr (--freq, from the ULX3S's LPF: the GateMate board's own is 10 MHz).
// The bitstream is read back (gmunpack) and packed again, the same bytes asked.
//   node scripts/gatemate-measure.mjs [--device CCGM1A1]... [--examples gates,blinky] [--seed 1] [--json out.json]
// prints a Markdown table per device: synthesis, place and route, bitstream, warnings, size, run time.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, ECP5_TARGETS, exampleBoard, exampleProject, silinxFlow } from '../test/examples-lib.mjs';

/** The parts nextpnr-himbaechel-gatemate has a chip database for (the CCGM1A4 and larger: none in YoWASP's package). */
export const DEVICES = ['CCGM1A1', 'CCGM1A2'];
/** The GateMate A1 Evaluation Board's clock pin (its 10 MHz oscillator), a global clock input of every part. */
export const CLOCK_PIN = 'IO_SB_A8';

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
const sum = (cells, re) => Object.entries(cells).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);

/** The netlist's cells by type, Yosys's JSON's top module's ({ CC_LUT2: 12, … }). */
export function cellCounts(json, top) {
  const m = JSON.parse(json).modules[top];
  const counts = {};
  for (const c of Object.values(m?.cells || {})) counts[c.type] = (counts[c.type] || 0) + 1;
  return counts;
}

const KNOWN = /^(CC_LUT[1-4]|CC_L2T[45]|CC_MX[248]|CC_DFF|CC_DLT|CC_ADDF|CC_BRAM_(20K|40K)|CC_FIFO_40K|CC_MULT|CC_[IO]BUF|CC_TOBUF|CC_IOBUF|CC_BUFG)$/;
/** The synthesis's size: LUTs (CC_LUTn, CC_L2T4/5), multiplexers, flip-flops and latches, adders, block RAM, multipliers, the other cells. */
export const synthSize = cells => ({
  luts: sum(cells, /^(CC_LUT[1-4]|CC_L2T[45])$/), muxes: sum(cells, /^CC_MX[248]$/), ffs: sum(cells, /^(CC_DFF|CC_DLT)$/),
  carry: sum(cells, /^CC_ADDF$/), bram: sum(cells, /^(CC_BRAM_(20K|40K)|CC_FIFO_40K)$/), mult: sum(cells, /^CC_MULT$/),
  other: Object.keys(cells).filter(t => !KNOWN.test(t)).sort(),
});

/** nextpnr's warnings split: the ports it placed itself (no pin in the CCF: Yosys's $iopadmap$<top>. taken off) and the others. */
export function splitWarnings(lines) {
  const unpinned = [], other = [];
  for (const l of lines.filter(x => /^Warning:/.test(x))) {
    const m = /^Warning: IO '(?:\$iopadmap\$[^.]+\.)?(.+)' is unconstrained in CCF and will be automatically placed\.?$/.exec(l);
    if (m) unpinned.push(m[1]); else other.push(l.replace(/^Warning:\s*/, ''));
  }
  return { unpinned, other };
}

/** The ULX3S's LPF's clock (FREQUENCY PORT "clk"), in MHz, or null: the clock nextpnr is asked for. */
export function clockMhz(lpf) {
  const m = /^\s*FREQUENCY\s+PORT\s+"clk"\s+([\d.]+)\s*MHZ/im.exec(lpf || '');
  return m ? +m[1] : null;
}

/** The CCF given nextpnr: a clocked design's clk on the board's clock pin, none for a design with no clock. */
export const deviceCcf = mhz => (mhz ? `NET "clk" Loc = "${CLOCK_PIN}";\n` : '');

let tools = null;
async function load() {
  if (tools) return tools;
  const { runYosys } = await import('@yowasp/yosys');
  const { runNextpnrHimbaechelGatemate, runGmpack, runGmunpack } = await import('@yowasp/nextpnr-himbaechel-gatemate');
  return (tools = { runYosys, runNextpnrHimbaechelGatemate, runGmpack, runGmunpack });
}

// a YoWASP tool's run: its output files and its lines, or its error and its lines (a WebAssembly trap too)
async function run(fn, args, files) {
  const lines = [];
  let rest = '';
  const out = b => {
    if (b === null) return;   // (a flush, not a line's end: Yosys flushes between "Warning: " and its text)
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
    const error = lines.filter(l => /^ERROR:/.test(l)).pop() || (e?.code != null ? `exit code ${e.code}` : e instanceof WebAssembly.Exception ? 'crashed (a WebAssembly exception)' : String(e?.message || e));
    return { error, lines };
  }
}

/** The GateMate's back half on a synthesised flat Verilog: { synth, par, bit }, each { ok, … } or { ok: false, error }. */
export async function measureNetlist({ syn, top, mhz = null, device, seed = 1, router }) {
  const ccf = deviceCcf(mhz);
  const { runYosys, runNextpnrHimbaechelGatemate, runGmpack, runGmunpack } = await load();
  const r = { device, synth: { ok: false }, par: { ok: false }, bit: { ok: false } };
  const y = await run(runYosys, ['-q', '-p', `read_verilog -sv top_syn.v; synth_gatemate -luttree -nomx8 -top ${top}; write_json netlist.json`], { 'top_syn.v': syn });
  r.synth.warnings = y.lines.filter(l => /^Warning:/.test(l)).map(l => l.replace(/^Warning:\s*/, ''));
  if (y.error) return { ...r, synth: { ...r.synth, error: y.error } };
  const json = text(y.files['netlist.json']);
  const cells = cellCounts(json, top);
  r.synth = { ...r.synth, ok: true, cells, size: synthSize(cells) };
  const args = ['--device', device, '--json', 'netlist.json', '-o', 'out=impl.txt', '--report', 'report.json', '--seed', String(seed),
    '-o', 'allow-unconstrained', ...(mhz ? ['--freq', String(mhz)] : []), ...(router ? ['--router', router] : []), ...(ccf ? ['-o', 'ccf=design.ccf'] : [])];
  const n = await run(runNextpnrHimbaechelGatemate, args, { 'netlist.json': json, ...(ccf && { 'design.ccf': ccf }) });
  r.par.warnings = splitWarnings(n.lines);
  if (n.error) return { ...r, par: { ...r.par, error: n.error } };
  const rep = JSON.parse(text(n.files['report.json']));
  const util = Object.fromEntries(Object.entries(rep.utilization || {}).filter(([, u]) => u.used).map(([k, u]) => [k, [u.used, u.available]]));
  // (nextpnr names the clock by the global buffer's net, Yosys's $abc$… : one clock per design here)
  const fmax = Object.entries(rep.fmax || {}).map(([clock, f]) => ({ clock, achieved: +f.achieved.toFixed(1), constraint: +f.constraint.toFixed(1) }));
  r.par = { ...r.par, ok: true, util, fmax };
  const p = await run(runGmpack, ['impl.txt', 'design.bit'], { 'impl.txt': n.files['impl.txt'] });
  if (p.error) return { ...r, bit: { ok: false, error: p.error, lines: p.lines.slice(-5) } };
  const bit = p.files['design.bit'];
  r.bit = { ok: true, size: bit.length, warnings: p.lines.filter(l => /warning/i.test(l)) };
  // the bitstream read back by gmunpack: the configuration nextpnr wrote, its settings that are not zero (a tile nextpnr writes
  // with only zeros is left out of the read back, and so of the bitstream packed again from it); and packed again, the same bytes
  const u = await run(runGmunpack, ['design.bit', 'unpacked.txt'], { 'design.bit': bit });
  if (u.error) return { ...r, bit: { ...r.bit, readBack: { error: u.error } } };
  r.bit.readBack = compareConfigs(text(n.files['impl.txt']), text(u.files['unpacked.txt']));
  const again = await run(runGmpack, ['unpacked.txt', 'again.bit'], { 'unpacked.txt': u.files['unpacked.txt'] });
  r.bit.sameBytes = !again.error && Buffer.compare(Buffer.from(again.files['again.bit']), Buffer.from(bit)) === 0;
  return r;
}

/** A Peppercorn configuration's (nextpnr's out=, gmunpack's) settings that are not zero: '<section>|<name> <value>', sorted. */
export function configSettings(config) {
  let section = '';
  const out = [];
  for (const l of config.split(/\r?\n/)) {
    const s = l.trim().replace(/\s+/g, ' ');
    if (!s) continue;
    if (s.startsWith('.')) { section = s; continue; }
    const [, value] = s.split(' ');
    if (value === undefined || !/^0+$/.test(value)) out.push(`${section}|${s}`);
  }
  return out.sort();
}

/** nextpnr's configuration against the one read back from the bitstream: the settings lost and those added. */
export function compareConfigs(written, read) {
  const a = configSettings(written), b = configSettings(read);
  const count = xs => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  const lost = [...ca].flatMap(([x, k]) => Array(Math.max(0, k - (cb.get(x) || 0))).fill(x));
  const added = [...cb].flatMap(([x, k]) => Array(Math.max(0, k - (ca.get(x) || 0))).fill(x));
  return { settings: a.length, lost, added };
}

/** An example's flat Verilog, by the Silinx toolchain's synthesis on the ULX3S (the ECP5's board): { syn, top, mhz } or { error }. */
export async function exampleNetlist(name, into) {
  const { dir, project } = exampleProject(name, exampleBoard(name, ECP5_TARGETS[0]), into);
  const job = await silinxFlow(dir, project, ['synth']);
  if (job.status !== 'ok') return { error: job.lines.filter(l => /error/i.test(l)).slice(-3).join(' | ') || job.status };
  const top = project.top;
  return { top, syn: fs.readFileSync(path.join(dir, 'build', 'open', `${top}_syn.v`), 'utf8'), mhz: clockMhz(fs.readFileSync(path.join(dir, project.constraints), 'utf8')) };
}

const readBack = rb => (!rb ? '' : rb.error ? ' (not read back)' : rb.lost.length || rb.added.length
  ? ` (read back: ${[rb.lost.length && `${rb.lost.length} of ${rb.settings} settings lost`, rb.added.length && `${rb.added.length} added`].filter(Boolean).join(', ')})` : '');
const bitCell = b => (b.ok ? `${b.size} bytes${readBack(b.readBack)}` : b.error ? `no: ${b.error}` : '-');
/** A device's results as a Markdown table. */
export function table(results) {
  const rows = ['| Example | Synthesis (LUT / MX / FF / ADDF / BRAM / MULT) | Place & route (CPE LT, FF; GPIO; RAM halves) | Fmax at 25 MHz | Bitstream | Warnings | Time |',
    '|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const s = r.synth?.size;
    const u = k => (r.par.util?.[k] ? `${r.par.util[k][0]}/${r.par.util[k][1]}` : '0');
    const warn = [...(r.synth?.warnings || []).map(w => `Yosys: ${w}`), ...(r.par?.warnings?.other || []).map(w => `nextpnr: ${w}`),
      ...(r.bit?.warnings || []).map(w => `gmpack: ${w}`)];
    rows.push(`| ${r.name} | ${r.error ? `no: ${r.error}` : r.synth.ok ? `${s.luts} / ${s.muxes} / ${s.ffs} / ${s.carry} / ${s.bram} / ${s.mult}` : `no: ${r.synth.error}`} | ${
      r.par.ok ? `${u('CPE_LT')}, ${u('CPE_FF')}; ${u('GPIO')}; ${u('RAM_HALF')}` : r.par.error ? `no: ${r.par.error}` : '-'} | ${
      r.par.fmax?.length ? r.par.fmax.map(f => `${f.achieved} MHz`).join(', ') : r.par.ok ? '(no clock)' : '-'} | ${
      bitCell(r.bit)} | ${warn.length ? warn.length === 1 ? warn[0] : `${warn.length}: ${[...new Set(warn)].slice(0, 3).join('; ')}` : 'none'} | ${
      r.seconds != null ? `${r.seconds} s` : '-'} |`);
  }
  return rows.join('\n');
}

async function main(argv) {
  const opt = (name, def) => { const i = argv.indexOf(name); return i < 0 ? def : argv[i + 1]; };
  const devices = argv.flatMap((a, i) => (a === '--device' ? [argv[i + 1]] : []));
  const names = (opt('--examples', '') || EXAMPLES.join(',')).split(',');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-gatemate-'));
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
        const r = n.error ? { name, error: n.error, synth: {}, par: {}, bit: {} }
          : { name, ...(await measureNetlist({ ...n, device, seed: +opt('--seed', 1), router: opt('--router') })) };
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

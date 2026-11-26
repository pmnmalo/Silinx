// Intel Quartus Prime's reports (#5378, server/quartus.js), in the shape of Vivado's (server/vivado.js collectVivadoReports,
// source 'quartus'): the Design Summary, get_report and the MCP server read them alike.
//   output_files/<top>.map.summary   Analysis & Synthesis: "Total registers : 24", "Total pins : 18"…
//   output_files/<top>.fit.summary   the Fitter: "Logic utilization (in ALMs) : 12 / 18,480 ( < 1 % )", "Total logic elements :
//                                    45 / 22,320 ( < 1 % )" (the MAX 10, the Cyclone IV), "Total pins : 18 / 224 ( 8 % )"…
//   output_files/<top>.sta.summary   the Timing Analyzer: per clock and corner, "Type : Slow 1100mV 85C Model Setup 'clk'",
//                                    "Slack : 16.123", "TNS : 0.000"
//   output_files/<top>.{map,fit,sta,asm}.rpt   each tool's last message: "Quartus Prime Fitter was successful. 0 errors, 3 warnings"
//   output_files/<top>.sof           the programming file
import fs from 'node:fs/promises';
import path from 'node:path';

const num = s => { const n = Number(String(s ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : null; };
async function readIf(p) { try { return await fs.readFile(p, 'utf8'); } catch { return null; } }

/** A .summary's lines: { key: value } (the first of each key). */
function parseSummary(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([^:]+?)\s*:\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1].trim() in out)) out[m[1].trim()] = m[2];
  }
  return out;
}

// the Design Summary's rows of a .summary: its resources, a count of an available one ("12 / 18,480 ( < 1 % )") or a bare count
const ROWS = ['Logic utilization (in ALMs)', 'Total logic elements', 'Total combinational functions', 'Dedicated logic registers', 'Total registers', 'Total pins',
  'Total block memory bits', 'Total memory bits', 'Total RAM Blocks', 'Total DSP Blocks', 'Embedded Multiplier 9-bit elements', 'Total PLLs', 'UFM blocks', 'ADC blocks'];
/** The utilization of a .summary: [{ name, used, total, percent, level: 0 }], ROWS' order, the ones it has. */
export function summaryUtilization(text) {
  const s = parseSummary(text), out = [];
  for (const name of ROWS) {
    if (!(name in s)) continue;
    const m = /^([\d,]+)(?:\s*\/\s*([\d,]+))?/.exec(s[name]);
    if (!m) continue;
    const used = num(m[1]), total = m[2] ? num(m[2]) : null;
    out.push({ name, used, total, percent: total ? +(100 * used / total).toFixed(2) : null, level: 0 });
  }
  return out;
}

const pick = (items, re) => { const it = items.find(i => re.test(i.name)); return it ? { used: it.used, total: it.total, percent: it.percent } : null; };
/** The headline counts, as ISE's map summary names them: an ALM or an LE a slice's place, the registers its flip-flops. */
export const utilizationSummary = items => ({
  slices: pick(items, /^Logic utilization \(in ALMs\)$|^Total logic elements$/), luts: pick(items, /^Total combinational functions$/) || pick(items, /^Logic utilization \(in ALMs\)$/),
  ffs: pick(items, /^Total registers$|^Dedicated logic registers$/), iobs: pick(items, /^Total pins$/), bram: pick(items, /^Total RAM Blocks$/) || pick(items, /^Total memory bits$|^Total block memory bits$/),
  dsp: pick(items, /^Total DSP Blocks$|^Embedded Multiplier 9-bit elements$/), pll: pick(items, /^Total PLLs$/),
});

/** A tool's last message of its .rpt: { ok, errors, warnings } ("Quartus Prime Fitter was successful. 0 errors, 3 warnings"), or null. */
export function toolMessages(text) {
  const all = [...String(text || '').matchAll(/Quartus Prime [\w &]+? was (successful|unsuccessful)\. (\d+) errors?, (\d+) warnings?/g)];
  const m = all.at(-1);
  return m ? { ok: m[1] === 'successful', errors: +m[2], warnings: +m[3] } : null;
}

/** The Timing Analyzer's summary: each clock's worst slacks across the corners; the clocks' periods (the SDC's, given) make
 *  its Fmax. { met, constraints: [{ name, periodNs, wnsNs, whsNs, minPeriodNs, maxFreqMHz }], minPeriodNs, maxFreqMHz, wnsNs, whsNs, noConstraints }. */
export function parseStaSummary(text, clocks = []) {
  const byClock = new Map();
  let type = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = /^Type\s*:\s*(.+?)\s*$/.exec(line);
    if (t) { type = t[1]; continue; }
    const s = /^Slack\s*:\s*(-?[\d.]+)/.exec(line);
    if (!s || !type) continue;
    const m = /\b(Setup|Hold|Recovery|Removal|Minimum Pulse Width)\s+'([^']+)'/.exec(type);
    if (m) {
      const c = byClock.get(m[2]) || { name: m[2] };
      const key = { Setup: 'wnsNs', Hold: 'whsNs' }[m[1]];
      if (key && (c[key] === undefined || +s[1] < c[key])) c[key] = +s[1];
      byClock.set(m[2], c);
    }
    type = null;
  }
  const periods = Object.fromEntries(clocks.map(c => [String(c.name || c.net).replace(/<(\d+)>$/, '[$1]'), c.period]));
  const constraints = [...byClock.values()].map(c => {
    const periodNs = periods[c.name] ?? null;
    const minPeriodNs = periodNs !== null && c.wnsNs !== undefined ? +(periodNs - c.wnsNs).toFixed(3) : null;
    return { name: c.name, periodNs, wnsNs: c.wnsNs ?? null, whsNs: c.whsNs ?? null, minPeriodNs, maxFreqMHz: minPeriodNs ? +(1000 / minPeriodNs).toFixed(3) : null };
  });
  const worst = (k) => (constraints.some(c => c[k] !== null) ? Math.min(...constraints.filter(c => c[k] !== null).map(c => c[k])) : null);
  const timed = constraints.filter(c => c.maxFreqMHz !== null);
  const slowest = timed.length ? timed.reduce((a, b) => (b.maxFreqMHz < a.maxFreqMHz ? b : a)) : null;
  const wnsNs = worst('wnsNs'), whsNs = worst('whsNs');
  return { met: constraints.length ? (wnsNs ?? 0) >= 0 && (whsNs ?? 0) >= 0 : null, wnsNs, whsNs, constraints, minPeriodNs: slowest?.minPeriodNs ?? null,
    maxFreqMHz: slowest?.maxFreqMHz ?? null, noConstraints: !constraints.length };
}

/** The reports of build/ (Quartus's) in the shape of vivado.js collectVivadoReports, with source 'quartus'. clocks: the SDC's. */
export async function collectQuartusReports(buildDir, top, device, clocks = []) {
  const out = { generatedAt: new Date().toISOString(), top, device: device || null, source: 'quartus' };
  const f = ext => path.join(buildDir, 'output_files', `${top}.${ext}`);
  const [mapSum, fitSum, staSum, mapRpt, fitRpt, staRpt, asmRpt] = await Promise.all(['map.summary', 'fit.summary', 'sta.summary', 'map.rpt', 'fit.rpt', 'sta.rpt', 'asm.rpt'].map(e => readIf(f(e))));
  const msg = { map: toolMessages(mapRpt), fit: toolMessages(fitRpt), sta: toolMessages(staRpt), asm: toolMessages(asmRpt) };
  if (mapSum || msg.map) {
    const utilization = summaryUtilization(mapSum);
    out.synthesis = { utilization, summary: utilizationSummary(utilization), errors: msg.map?.errors ?? null, warnings: msg.map?.warnings ?? null };
  }
  if (fitSum) {
    const utilization = summaryUtilization(fitSum);
    out.map = { utilization, summary: utilizationSummary(utilization), errors: msg.fit?.errors ?? null, warnings: msg.fit?.warnings ?? null };
    const ok = /^Successful/.test(parseSummary(fitSum)['Fitter Status'] || '');
    out.par = { routed: ok, done: ok, unroutedSignals: ok ? 0 : null };
  }
  if (staSum) out.timing = parseStaSummary(staSum, clocks);
  const sof = await fs.stat(f('sof')).catch(() => null);
  if (sof) out.bit = { path: `build/output_files/${top}.sof`, size: sof.size };
  const tools = Object.values(msg).filter(Boolean);
  out.messages = { errors: tools.reduce((a, m) => a + m.errors, 0), criticalWarnings: 0, warnings: tools.reduce((a, m) => a + m.warnings, 0) };
  out.summary = {
    synthesized: !!out.synthesis, mapped: !!out.map, routed: out.par ? out.par.routed : null, timingMet: out.timing ? out.timing.met : null,
    maxFreqMHz: out.timing?.maxFreqMHz ?? null, utilization: out.map?.summary || out.synthesis?.summary || null, drc: null, bitstream: !!out.bit,
  };
  return out;
}

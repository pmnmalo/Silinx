// The Design Summary's Device Utilization Summary (web/js/summary.js; the MCP's get_report summary, #4512): its caption and
// its rows, of a run's reports (build/reports.json) and the target part's resources (packages/silinx-fpga/src/resources.js,
// #790). Isomorphic ES module (browser + Node), no DOM.
import { resourcesOf } from '../packages/silinx-fpga/src/parts.js';

const pct = (u, t) => (t ? Math.round((100 * u) / t) : 0);

/**
 * The Device Utilization Summary of a run: { caption, rows: [{ name, used, total, percent }] } (used '-': not known,
 * percent null then). rep: the run's reports (null: none yet); part: the target's part record (server/devices.js findPart,
 * S.devices.parts; null: not known); pkg: its package.
 *
 * Every resource of the part, used of available (#795): MAP's report's lines (and the part's resources it does not list,
 * ISE's leaves the unused ones out), or before an implementation the synthesis's (the Silinx toolchain's), or the part's
 * counts alone. A report that names its lines as nextpnr's cells (the iCE40's ICESTORM_LC, the Gowin's LUT4, the ECP5's,
 * the GateMate's), none as the part's resources, has its own lines alone: no Spartan rows at 0 after them (#4512).
 */
export function designUtilization(rep, part, pkg) {
  // made by the Silinx toolchain (no ISE), by AMD Vivado (a 7-series device, #1649)
  // (Intel Quartus Prime's, #5378: its summaries' rows, as Vivado's)
  const open = rep?.source === 'open', vivado = rep?.source === 'vivado' || rep?.source === 'quartus';
  const syn = open || vivado ? (rep?.synthesis?.utilization || []).filter(u => u.total && !u.level) : [];
  const caption = `Device Utilization Summary${rep?.map ? (open ? ' (Silinx toolchain)' : rep.source === 'quartus' ? ' (Intel Quartus Prime)' : vivado ? ' (AMD Vivado)' : '') : syn.length ? ' (after synthesis)' : ' (not yet implemented)'}`;
  const res = part ? resourcesOf(part, pkg).filter(r => r.report && r.count) : [];
  let lines = (rep?.map?.utilization || []).filter(u => u.total).map(u => [u.name, u.used, u.total, u.percent]);
  // (Vivado's rows name the 7-series' resources its own way: its rows alone, after routing or after synthesis)
  if (vivado && !lines.length) lines = syn.map(u => [u.name, u.used, u.total, u.percent]);
  if (lines.length && !vivado) {
    // (the part's resources the report leaves out, when it names its lines as they are)
    if (lines.some(l => res.some(r => r.report === l[0]))) lines.push(...res.filter(r => !lines.some(l => l[0] === r.report)).map(r => [r.report, 0, r.count]));
  } else if (!lines.length) {
    const used = r => syn.find(u => u.id === r.id || u.name === r.report)?.used ?? (syn.length && r.id !== 'slices' ? 0 : '-');
    lines = res.map(r => [r.report, used(r), r.count]);
  }
  const rows = lines.map(([name, used, total, percent]) => ({ name, used, total: total ?? null, percent: typeof used === 'number' ? (percent ?? pct(used, total)) : null }));
  return { caption, rows };
}

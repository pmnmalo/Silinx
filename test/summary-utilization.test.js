// The Design Summary's Device Utilization Summary (core/summary-utilization.js, #4512): its caption and rows of a run's reports
// on each family (the Spartan-3E's MAP rows and the part's resources it leaves out; nextpnr's own rows alone on the iCE40, the
// Gowin, the ECP5 and the GateMate; the 7-series' Silinx toolchain rows named as the part's; Vivado's own), after synthesis
// and before; and the MCP's get_report summary, the same rows (#2674).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { designUtilization } from '../core/summary-utilization.js';
import { findPart } from '../core/devices.js';
import { scratchEnv } from './server-helpers.js';

const items = rows => rows.map(([name, used, total]) => ({ name, used, total, percent: Math.round((100 * used) / total) }));
const rowsOf = u => u.rows.map(r => [r.name, r.used, r.total, r.percent]);
const open = (map, synthesis = { utilization: [] }) => ({ source: 'open', top: 'blinky', synthesis, ...(map && { map: { utilization: items(map), warnings: 0, errors: 0 } }) });

// each family's run: the Silinx toolchain's map rows (nextpnr's cells, open-flow-ice40.js, -gowin.js, -ecp5.js, -gatemate.js)
const ICE40 = [['ICESTORM_LC', 184, 5280], ['SB_GB', 2, 8], ['SB_IO', 27, 39]];
const GOWIN = [['ALU', 26, 6480], ['DFF', 52, 6480], ['IOB', 15, 71], ['LUT4', 61, 8640], ['MUX2_LUT5', 4, 4320]];
const ECP5 = [['DCCA', 1, 56], ['TRELLIS_COMB', 120, 83640], ['TRELLIS_FF', 52, 83640], ['TRELLIS_IO', 15, 365]];
const GATEMATE = [['CPE_COMB', 80, 20480], ['CPE_FF', 52, 40960], ['GPIO', 15, 162], ['GLBOUT', 1, 4]];
const S3E = [['Number of Slice Flip Flops', 52, 4896], ['Number of 4 input LUTs', 110, 4896], ['Number of occupied Slices', 64, 2448], ['Number of bonded IOBs', 27, 92], ['Number of BUFGMUXs', 1, 24]];

test('#4512 iCE40: nextpnr\'s rows alone, no Spartan row at 0 after them (the old code listed the part\'s 4 input LUTs, Slices, IOBs, SB_GBs at 0)', () => {
  const u = designUtilization(open(ICE40), findPart('ice40up5k'), 'sg48');
  assert.equal(u.caption, 'Device Utilization Summary (Silinx toolchain)');
  assert.deepEqual(rowsOf(u), [['ICESTORM_LC', 184, 5280, 3], ['SB_GB', 2, 8, 25], ['SB_IO', 27, 39, 69]]);
});

test('#4512 Gowin, ECP5, GateMate: nextpnr\'s rows alone', () => {
  for (const [rows, part, pkg] of [[GOWIN, 'gw1nr-9c', 'qn88p'], [ECP5, 'lfe5u-85f', 'cabga381'], [GATEMATE, 'ccgm1a1', 'fbga324']]) {
    const u = designUtilization(open(rows), findPart(part), pkg);
    assert.ok(findPart(part), part);
    assert.deepEqual(u.rows.map(r => r.name), rows.map(r => r[0]), part);
    assert.ok(u.rows.every(r => r.used > 0), part);
  }
});

test('#4512 Spartan-3E: MAP\'s rows, then the part\'s resources the report leaves out at 0 (as before)', () => {
  const u = designUtilization(open(S3E), findPart('xc3s250e'), 'cp132');
  assert.equal(u.caption, 'Device Utilization Summary (Silinx toolchain)');
  assert.deepEqual(rowsOf(u), [['Number of Slice Flip Flops', 52, 4896, 1], ['Number of 4 input LUTs', 110, 4896, 2], ['Number of occupied Slices', 64, 2448, 3],
    ['Number of bonded IOBs', 27, 92, 29], ['Number of BUFGMUXs', 1, 24, 4], ['Number of RAMB16s', 0, 12, 0], ['Number of MULT18X18SIOs', 0, 12, 0], ['Number of DCMs', 0, 4, 0]]);
  // (ISE's: the same rows, no caption's toolchain)
  assert.equal(designUtilization({ ...open(S3E), source: undefined }, findPart('xc3s250e'), 'cp132').caption, 'Device Utilization Summary');
});

test('#4512 7-series with the Silinx toolchain: its rows named as the part\'s, the ones it leaves out at 0; Vivado\'s rows alone', () => {
  const xc7 = [['Number of Slice LUTs', 70, 20800], ['LUTs as feed-throughs (nextpnr)', 3, 20800], ['Number of occupied Slices', 30, 8150], ['RAMB18', 1, 100]];
  assert.deepEqual(designUtilization(open(xc7), findPart('xc7a35t'), 'csg324').rows.map(r => [r.name, r.used]),
    [['Number of Slice LUTs', 70], ['LUTs as feed-throughs (nextpnr)', 3], ['Number of occupied Slices', 30], ['RAMB18', 1], ['Number of Slice Registers', 0], ['Number of bonded IOBs', 0]]);
  const viv = { source: 'vivado', map: { utilization: items([['Slice LUTs', 85, 63400], ['Bonded IOB', 29, 210]]) } };
  const u = designUtilization(viv, findPart('xc7a100t'), 'csg324');
  assert.deepEqual([u.caption, u.rows.map(r => r.name)], ['Device Utilization Summary (AMD Vivado)', ['Slice LUTs', 'Bonded IOB']]);
});

test('#4512 before an implementation: after synthesis the part\'s rows with the synthesis\'s counts; with no run the part\'s counts alone; no part, no rows', () => {
  const syn = { utilization: [{ id: 'luts', name: 'Number of 4 input LUTs', used: 15, total: 4896, percent: 0 }, { id: 'iob', name: 'Number of IOs', used: 26, total: 92, percent: 28 }] };
  const u = designUtilization(open(null, syn), findPart('xc3s250e'), 'cp132');
  assert.equal(u.caption, 'Device Utilization Summary (after synthesis)');
  assert.deepEqual(rowsOf(u).slice(0, 4), [['Number of Slice Flip Flops', 0, 4896, 0], ['Number of 4 input LUTs', 15, 4896, 0], ['Number of occupied Slices', '-', 2448, null], ['Number of bonded IOBs', 26, 92, 28]]);
  const none = designUtilization(null, findPart('ice40up5k'), 'sg48');
  assert.equal(none.caption, 'Device Utilization Summary (not yet implemented)');
  assert.deepEqual(none.rows.map(r => [r.name, r.used]), [['Number of Slice Flip Flops', '-'], ['Number of 4 input LUTs', '-'], ['Number of occupied Slices', '-'], ['Number of bonded IOBs', '-'], ['Number of SB_GBs', '-']]);
  assert.deepEqual(designUtilization(open(ICE40), null, null).rows.length, 3);
  assert.deepEqual(designUtilization(null, null, null), { caption: 'Device Utilization Summary (not yet implemented)', rows: [] });
});

// the MCP's get_report summary: the Device Utilization Summary as the interface's (#2674)
let tmp;
before(async () => { tmp = await scratchEnv('silinx-summary-utilization-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#4512 MCP get_report summary: designSummary.utilization, the family\'s rows alone (Basys2, iCEBreaker, Tang Nano 9K)', async () => {
  const { handle } = await import('../server/mcp.js');
  const P = await import('../server/projects.js');
  let id = 0;
  const call = async (name, args) => {
    const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
    assert.equal(r.isError, false, r.content[0].text);
    return r.structuredContent;
  };
  for (const [board, rows, names] of [['basys2', S3E, [...S3E.map(r => r[0]), 'Number of RAMB16s', 'Number of MULT18X18SIOs', 'Number of DCMs']],
    ['icebreaker', ICE40, ICE40.map(r => r[0])], ['tangnano9k', GOWIN, GOWIN.map(r => r[0])]]) {
    const name = `u-${board}`;
    await call('new_project_from_example', { name, example: 'blinky' });
    // (blinky's board is the Basys2)
    if (board !== 'basys2') await call('set_design_properties', { project: name, board, update_constraints: true });
    fs.mkdirSync(path.join(P.projectDir(name), 'build'), { recursive: true });
    fs.writeFileSync(path.join(P.projectDir(name), 'build', 'reports.json'), JSON.stringify(open(rows)));
    const { summary } = await call('get_report', { project: name });
    assert.equal(summary.designSummary.utilization.caption, 'Device Utilization Summary (Silinx toolchain)', board);
    assert.deepEqual(summary.designSummary.utilization.rows.map(r => r.name), names, board);
  }
});

// A System's FPGA node's reports (#5632, server/system-implement.js nodeReports): its build folder's reports.json
// (build/nodes/<id>/build/), the route's (GET /projects/:p/reports?node=<id>) and the MCP's get_report with node: before
// its build none, said; after its Implement Design (the Silinx toolchain, the uart-zynq example's Zybo Z7 node) its Design
// Summary (its device's utilization rows), its synthesis and timing reports (its files there), its map and place and
// route (from its summary); a report the Silinx toolchain does not make said; a node that is no FPGA node refused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-node-reports-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const { projectReports } = await import('../server/impl-routes.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#5632 a node\'s reports: none before its build, said; after it its Design Summary and its reports; refusals', { timeout: 300000 }, async () => {
  await ok('new_project_from_example', { name: 'nr', example: 'uart-zynq' });
  assert.deepEqual(await projectReports('nr', { node: 'zybo' }), { available: false, node: 'zybo', module: 'leds', dir: 'build/nodes/zybo/build' });
  const none = await ok('get_report', { project: 'nr', node: 'zybo' });
  assert.equal(none.text, 'No report yet for node zybo of \'nr\': run_process implement with node zybo.');
  await ok('run_process', { project: 'nr', process: 'implement', node: 'zybo' });
  const s = await ok('get_report', { project: 'nr', node: 'zybo' });
  assert.deepEqual([s.data.summary.node, s.data.summary.module, s.data.summary.dir, s.data.summary.top, s.data.summary.device.part, s.data.summary.source],
    ['zybo', 'leds', 'build/nodes/zybo/build', 'leds', 'xc7z020', 'open']);
  assert.deepEqual(s.data.summary.designSummary.utilization.rows.map((r) => r.name).slice(0, 2), ['Number of Slice LUTs', 'LUTs as feed-throughs (nextpnr)']);
  const syn = await ok('get_report', { project: 'nr', node: 'zybo', report: 'synthesis' });
  assert.deepEqual([syn.data.path, /=== leds ===/.test(syn.text)], ['build/nodes/zybo/build/open/leds_stat.txt', true]);
  const tim = await ok('get_report', { project: 'nr', node: 'zybo', report: 'timing' });
  assert.equal(tim.data.path, 'build/nodes/zybo/build/open/timing.txt');
  assert.match(tim.text, /^Timing of xc7z020clg400-1 after Place & Route/);
  const par = await ok('get_report', { project: 'nr', node: 'zybo', report: 'par' });
  assert.deepEqual([par.data.path, par.text.split('\n')[0]], ['build/nodes/zybo/build/reports.json', 'Place and route (Silinx toolchain) of leds: all signals are completely routed.']);
  const pwr = await ok('get_report', { project: 'nr', node: 'zybo', report: 'power' });
  assert.equal(pwr.text, 'No power report for node zybo of \'nr\' from its last run (Silinx toolchain: build/nodes/zybo/build/leds.pwr).');
  // (refusals: a node that is no FPGA node, a report not known)
  assert.deepEqual([(await call('get_report', { project: 'nr', node: 'term' })).text], ['get_report: no FPGA node \'term\' in the System of \'nr\' (zybo)']);
  const bogus = await call('get_report', { project: 'nr', node: 'zybo', report: 'bogus' });
  assert.deepEqual([bogus.isError, bogus.text], [true, 'get_report: report: one of summary, power, timing, synthesis, map, par, pins, drc']);
});

// The Spartan-6's Map through the MCP server (#3138, #2674): nextpnr's packer, the one Map since Silinx's placer was
// removed (#3140). set_process_properties has no s6_map any more (refused as unknown) and drops a Map a project saved;
// run_process implements with nextpnr's (the Map's line of the log: "Packed and placed … sites by nextpnr"), with no
// warnings, a project saved with Silinx's Map too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-s6-map-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };

test('#3140 set_process_properties: no s6_map in its schema; refused as unknown', async () => {
  const t = TOOLS.find(x => x.name === 'set_process_properties');
  assert.deepEqual(Object.keys(t.inputSchema.properties), ['project', 'optimization', 'startup_clock']);
  assert.doesNotMatch(t.description, /s6_map|Silinx's own/);
  await ok('new_project_from_example', { name: 'n3', example: 'gates', board: 'nexys3' });
  await fails('set_process_properties', { project: 'n3', s6_map: 'silinx' }, 'unknown s6_map');
  await fails('set_process_properties', { project: 'n3' }, 'give optimization or startup_clock');
});

test('#3140 set_process_properties on a Spartan-6 project: no Map said; a Map the project saved (Silinx\'s, or nextpnr\'s on trial) dropped', async () => {
  for (const saved of ['silinx', 'nextpnr']) {
    await P.updateProject('n3', p => ({ ...p, impl: { ...p.impl, s6Map: saved } }));
    const r = await ok('set_process_properties', { project: 'n3', optimization: 'fast' });
    assert.equal(r.text, 'n3: Optimization fast, FPGA start-up clock jtag.');
    assert.deepEqual(r.data, { project: 'n3', optimization: 'fast', startupClock: 'jtag' });
    assert.deepEqual((await P.readProject('n3')).impl, { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });
  }
});

test('#3140 run_process implement: nextpnr packs and places blinky on the Nexys3, routed, no warnings, a project saved with Silinx\'s Map too', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'k3', example: 'blinky', board: 'nexys3' });
  await P.updateProject('k3', p => ({ ...p, impl: { ...p.impl, s6Map: 'silinx' } }));
  const r = await ok('run_process', { project: 'k3', process: 'implement', toolchain: 'silinx', log_lines: 400 });
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.errors, []);
  assert.deepEqual(r.data.warnings, []);
  assert.ok(r.data.log.some(l => /^Packed and placed \d+ sites by nextpnr in /.test(l)), r.data.log.join('\n'));
  assert.ok(!r.data.log.some(l => /^Placed \d+ sites by nextpnr in /.test(l)), r.data.log.join('\n'));
  assert.ok(r.data.log.includes('All signals are completely routed.'));
});

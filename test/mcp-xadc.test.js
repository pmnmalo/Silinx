// The MCP server and the XADC's analog inputs (#5385): what the Board Emulator's controls set (core/emulate-xadc.js),
// simulate's forces set too: a Basys 3 design reading VAUX6, its die temperature, simulated with the model's vaux6_mv and
// temp_mc forced; its LEDs the codes of UG480's transfer functions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { XADC_TOP } from './xadc-design.mjs';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-xadc-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#5385 simulate: an XADC\'s VAUX6 forced to 0.75 V (its code\'s top bits on the LEDs), then 0.25 V', async () => {
  await ok('new_project', { name: 'x' });
  await ok('set_design_properties', { project: 'x', board: 'basys3' });
  await ok('write_file', { project: 'x', path: 'src/adcled.vhd', text: XADC_TOP });
  const run = async (v) => (await ok('simulate', { project: 'x', top: 'adcled', time_ns: 20000, signals: ['led'],
    forces: [{ signal: 'clk', clock: true, period: 10 }, { signal: 'adc/vaux6_mv', value: v }] })).data.signals.led.final;
  assert.equal(await run(750), '"11000000"', '0.75 V: 3072, 1100 0000 0000');
  assert.equal(await run(250), '"01000000"', '0.25 V: 1024');
});

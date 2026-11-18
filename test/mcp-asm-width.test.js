// The MCP server and an ASM chart's register whose width is an expression of the chart's generics (#4378, #2674):
// write_file of the chart makes its HDL again with the expression, check_drawing reports a wrong one as the editor's
// Check does, simulate_drawing steps the register at its width at the generics' default values.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-asm-width-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const { generate } = await import('../core/asm.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

test('#4378 MCP: blinky\'s chart with a width expression, written, checked, simulated; its HDL made again', async () => {
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  const chart = JSON.parse((await ok('read_file', { project: 'b', path: 'src/speed_ctrl.asm.json' })).text);
  // its debounce counters sized by the generic
  for (const r of chart.registers) if (r.name.startsWith('cnt_')) r.width = 'clog2(DEBOUNCE)';
  await ok('write_file', { project: 'b', path: 'src/speed_ctrl.asm.json', text: JSON.stringify(chart, null, 2) });
  assert.match((await ok('read_file', { project: 'b', path: 'src/speed_ctrl.vhd' })).text, /signal cnt_s, cnt_s_next : std_logic_vector\(clog2\(DEBOUNCE\) - 1 downto 0\)/);
  assert.deepEqual((await ok('check_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json' })).data, { project: 'b', file: 'src/speed_ctrl.asm.json', ok: true, errors: [], warnings: [] });

  // another expression: the HDL file follows the chart
  chart.registers.find((r) => r.name === 'cnt_f').width = 'clog2(DEBOUNCE) + 1';
  await ok('write_file', { project: 'b', path: 'src/speed_ctrl.asm.json', text: JSON.stringify(chart, null, 2) });
  const vhd = (await ok('read_file', { project: 'b', path: 'src/speed_ctrl.vhd' })).text;
  assert.equal(vhd, generate(chart, 'vhdl').code);
  assert.match(vhd, /signal cnt_f, cnt_f_next : std_logic_vector\(clog2\(DEBOUNCE\) \+ 1 - 1 downto 0\) := \(others => '0'\);/);
  assert.match((await ok('check_syntax', { project: 'b', simulation: true })).text, /^Process "Check Syntax" of <tb_top> completed successfully/);

  // simulate_drawing: cnt_f has 3 bits at DEBOUNCE = 3, counts the ticks while faster differs from its debounced value
  const cycles = [{ faster: 1, tick: 1 }, { faster: 1, tick: 1 }, { faster: 1, tick: 1 }, { faster: 1, tick: 1 }];
  const r = await ok('simulate_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json', cycles });
  assert.deepEqual(r.data.cycles.map((c) => c.registers.cnt_f), [0, 0, 0, 1]);
  assert.match(r.text, /registers step=0 cnt_f=000 /);

  // a wrong width: check_drawing's error (the boxes that use the register cannot find it)
  chart.registers.find((r) => r.name === 'cnt_f').width = 'clog2(debounce)';
  await ok('write_file', { project: 'b', path: 'src/speed_ctrl.asm.json', text: JSON.stringify(chart, null, 2) });
  const c = await call('check_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json' });
  assert.equal(c.data.ok, false);
  assert.equal(c.data.errors[0].message, "Register 'cnt_f': width 'clog2(debounce)': 'debounce' is not a generic of the chart (did you mean 'DEBOUNCE'?)");
  assert.ok(c.data.errors.slice(1).every((e) => /'cnt_f' is not a declared/.test(e.message)), c.text);
  assert.deepEqual(c.data.warnings, []);
  const s = await call('simulate_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json', cycles });
  assert.equal(s.isError, true);
  assert.match(s.text, /Register 'cnt_f': width 'clog2\(debounce\)': 'debounce' is not a generic of the chart/);
});

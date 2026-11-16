// The MCP server and a KiCad part modelled by a module of the project (#4283): import_part writes Silinx.HDL; edit_circuit
// places it, its check against the project's modules; the circuit's HDL file instantiating the module; check_drawing
// with the module removed: its error
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp, ex;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-kicad-hdl-')); ex = path.join(tmp, 'exchange'); fs.mkdirSync(ex); process.env.SILINX_MCP_FOLDER = ex; });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, text) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${text}`); return r; };
const read = (rel) => fs.readFileSync(path.join(tmp, 'ws', 'H', rel), 'utf8');
const pin = (t, n, name) => `(pin ${t} line (name "${name}") (number "${n}"))`;
const LIB = `(kicad_symbol_lib (version 20251024) (symbol "INV" (property "Value" "TEST-INV") (property "Footprint" "PinHeader_1x02_P2.54mm_Vertical") (symbol "INV_1_1" ${pin('input', 1, 'A+')} ${pin('output', 2, 'Y')})))`;
const VHD = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity test_inv is\n  port (\n    a : in std_logic;\n    y : out std_logic\n  );\nend entity test_inv;\n\narchitecture rtl of test_inv is\nbegin\n  y <= not a;\nend architecture rtl;\n';
const WARN = 'WARNING: U1 (TEST-INV) is simulated by its module test_inv in the HDL only: Try it does not run it';

test('a part modelled by a module: imported, placed, checked, in the circuit\'s HDL; its module removed: its error', async () => {
  fs.writeFileSync(path.join(ex, 'inv.kicad_sym'), LIB);
  await ok('new_project', { name: 'H' });
  await ok('write_file', { project: 'H', path: 'src/test_inv.vhd', text: VHD });
  await ok('add_to_project', { project: 'H', path: 'src/test_inv.vhd' });
  await fails('import_part', { project: 'H', file: 'inv.kicad_sym', symbols: { INV: { hdl: 'test_inv', model: '7404' } } }, 'symbols.INV: model or hdl, not both');
  const r = await ok('import_part', { project: 'H', file: 'inv.kicad_sym', symbols: { INV: { hdl: 'test_inv', ports: '1=a' } } });
  assert.deepEqual(r.text.split('\n'), ['parts/inv.kicad_sym written (its symbols\' Silinx properties set)', 'parts/inv.kicad_sym#INV: modelled by the project\'s module test_inv']);
  assert.match(read('parts/inv.kicad_sym'), /"Silinx\.HDL" "test_inv"[^\n]*\n[^\n]*"Silinx\.Ports" "1=a"/);
  assert.equal((await ok('circuit_parts', { project: 'H', type: 'parts/inv.kicad_sym#INV' })).text.split('\n')[1], 'Simulated by the project\'s module test_inv in the HDL (Try it does not run it).');
  await ok('new_source', { project: 'H', type: 'circuit', name: 'mc', language: 'vhdl' });
  const e = await ok('edit_circuit', { project: 'H', path: 'src/mc.circ.json', operations: [{ op: 'add', type: 'parts/inv.kicad_sym#INV', at: [40, 20], id: 'U1' }, { op: 'add', type: 'logic-switch', at: [30, 20], id: 'S1', label: 'a' },
    { op: 'add', type: 'led', at: [45, 25], id: 'D1', label: 'y' }, { op: 'wire', from: 'S1.out', to: 'U1.1' }, { op: 'wire', from: 'U1.2', to: 'D1.A' }, { op: 'wire', from: 'D1.K', to: 'BB1.tn5' }] });
  assert.deepEqual(e.text.split('\n').slice(-3), [WARN, 'Process "Check Circuit" of mc.circ.json completed successfully with 1 warning(s).', 'src/mc.vhd updated from src/mc.circ.json']);
  assert.match(read('src/mc.vhd'), /^ {2}u_U1 : entity work\.test_inv port map \(a => \w+, y => \w+\);$/m);
  assert.match(read('src/mc.vhd'), /Parts {7}: U1 \(TEST-INV, by its module test_inv\)/);
  // the module removed from the project: its error
  await ok('remove_from_project', { project: 'H', path: 'src/test_inv.vhd' });
  assert.deepEqual((await ok('check_drawing', { project: 'H', file: 'src/mc.circ.json' })).text.split('\n'), [WARN, 'ERROR: U1 (TEST-INV): no module \'test_inv\' in the project',
    'Process "Check Circuit" of mc.circ.json failed (1 error(s), 1 warning(s)).']);
});

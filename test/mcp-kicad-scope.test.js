// Each MCP call its own project's KiCad parts (#4294, server/parts-scope.js): two projects whose parts/ttl.kicad_sym#X
// are different symbols (a 74LS00, a module drawn only), their circuits checked, simulated and edited by calls run at
// once, their awaits interleaved: each call's check and HDL its own project's
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-kicad-scope-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const pin = (t, n, name = '') => `(pin ${t} line (name "${name}") (number "${n}"))`;
const NAND = '(symbol "X" (property "Value" "74LS00") (property "ki_fp_filters" "DIP*W7.62mm*") '
  + `${[[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]].map(([a, b, y], i) => `(symbol "X_${i + 1}_1" ${pin('input', a)} ${pin('input', b)} ${pin('output', y)})`).join(' ')} (symbol "X_5_0" ${pin('power_in', 14, 'VCC')} ${pin('power_in', 7, 'GND')}))`;
const MODULE = `(symbol "X" (property "Value" "TEST-X") (property "Footprint" "PinHeader_1x04_P2.54mm_Vertical") (symbol "X_1_1" ${pin('input', 1, 'A')} ${pin('input', 2, 'B')} ${pin('output', 3, 'C')} ${pin('input', 4, 'D')}))`;
const lib = (sym) => `(kicad_symbol_lib (version 20251024) (generator "t") ${sym})`;
const CHECK = { a: "ERROR: U1 (74LS00) is not powered: its VCC (pin 14) is not on the supply's + and its GND (pin 7) is not on the supply's −",
  b: 'WARNING: U1 (TEST-X) is drawn only: it is not simulated and its pins drive nothing' };

test('two projects\' parts/ttl.kicad_sym#X at once: each call\'s check, part info and simulation its own project\'s', async () => {
  for (const [p, sym] of [['a', NAND], ['b', MODULE]]) {
    await ok('new_project', { name: p });
    await ok('new_source', { project: p, type: 'circuit', name: 'c', language: 'vhdl' });
    fs.mkdirSync(path.join(tmp, 'ws', p, 'parts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ws', p, 'parts', 'ttl.kicad_sym'), lib(sym));
    const r = await call('edit_circuit', { project: p, path: 'src/c.circ.json', operations: [{ op: 'add', type: 'parts/ttl.kicad_sym#X', at: [40, 20], id: 'U1' }] });
    assert.equal(r.text.split('\n')[1], CHECK[p], r.text);
  }
  const runs = [];
  for (let k = 0; k < 12; k++) {
    for (const p of ['a', 'b']) {
      runs.push(call('check_drawing', { project: p, file: 'src/c.circ.json' }).then((r) => ['check', p, r.text.split('\n')[0]]));
      runs.push(call('circuit_parts', { project: p, type: 'parts/ttl.kicad_sym#X' }).then((r) => ['parts', p, r.text.split('\n')[1]]));
      runs.push(call('edit_circuit', { project: p, path: 'src/c.circ.json', operations: [{ op: 'move', id: 'U1', at: [40, 20 + (k % 2)] }] }).then((r) => ['edit', p, r.text.split('\n')[1]]));
    }
  }
  const want = { check: CHECK, parts: { a: 'Behaves as the 7400 of the library (by its part number).', b: 'Drawn only: not simulated, its pins drive nothing.' }, edit: CHECK };
  for (const [what, p, line] of await Promise.all(runs)) assert.equal(line, want[what][p], `${what} on ${p}`);
});

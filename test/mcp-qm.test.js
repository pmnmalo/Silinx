// The MCP server's Quine-McCluskey results (#3939, server/mcp-views.js and server/mcp-tables.js): related_view's results
// list the Karnaugh map's SOP and POS up to 6 inputs and Quine-McCluskey's for any number (its prime implicants, the
// essential ones, its steps when small, not proven minimal past the bound), as the editor; set_output_logic sets the
// forms qsop and qpos, the HDL module made again in it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { newTable } from '../core/logic.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const read = (project, f) => fs.readFileSync(path.join(P.projectDir(project), f), 'utf8');
const results = (project, rel) => ok('related_view', { project, path: rel, view: 'results' });

before(async () => { tmp = await scratchEnv('silinx-mcp-qm-'); await ok('set_notation', { notation: 'slash' }); await ok('new_project', { name: 'q' }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('related_view: Σm(0, 1, 2, 5, 6, 7), its Quine-McCluskey SOP with its prime implicants, none essential, its steps\' columns', async () => {
  await ok('write_file', { project: 'q', path: 'src/cyc.bool.json', text: JSON.stringify({ ...newTable('cyc', ['a', 'b', 'c'], ['f']), table: { f: '11100111' } }) });
  const r = await results('q', 'src/cyc.bool.json');
  const q = r.data.outputs[0].quineMcCluskey.sop;
  assert.deepEqual([q.expr, q.terms, q.literals, q.exact, q.method], ['f = /a./b + b./c + a.c', 3, 6, true, 'exact']);
  assert.deepEqual(q.primes.map(p => p.cube), ['00-', '0-0', '-01', '-10', '1-1', '11-']);
  assert.deepEqual(q.essential, []);
  assert.deepEqual(q.columns.map(col => col.map(c => `${c.cube}${c.combined ? '✓' : ''}`)), [['000✓', '001✓', '010✓', '101✓', '110✓', '111✓'], ['00-', '0-0', '-01', '-10', '1-1', '11-']]);
  assert.ok(r.text.includes(`Quine-McCluskey SOP: f = /a./b + b./c + a.c   (3 term(s), 6 literal(s))
  Prime implicants: 00- /a./b, 0-0 /a./c, -01 /b.c, -10 b./c, 1-1 a.c, 11- a.b
  Essential: none
Quine-McCluskey POS: `), r.text);
  assert.ok(r.data.outputs[0].kmap.sop.expr === q.expr);
});

test('related_view: 7 inputs: no Karnaugh map, Quine-McCluskey\'s; 16 inputs: not proven minimal (the cover heuristic), in a few seconds', async () => {
  const ins = n => Array.from({ length: n }, (_, i) => `x${i}`);
  // y = x5 xor x6, whatever the rest
  await ok('write_file', { project: 'q', path: 'src/s.bool.json', text: JSON.stringify({ ...newTable('s', ins(7), ['y']), table: { y: '0110'.repeat(32) } }) });
  const r = await results('q', 'src/s.bool.json');
  assert.equal(r.data.outputs[0].kmap, null);
  assert.ok(r.text.includes(`Karnaugh map: none for more than 6 inputs (it has 7): the simplified function is Quine-McCluskey's.
Quine-McCluskey SOP: y = /x5.x6 + x5./x6   (2 term(s), 4 literal(s))`), r.text);
  assert.ok(r.text.includes('Least number of gates: Quine-McCluskey SOP: y = /x5.x6 + x5./x6'), r.text);
  let seed = 3, col = '';
  for (let i = 0; i < 2 ** 16; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; col += seed >> 16 & 1 ? '1' : '0'; }
  await ok('write_file', { project: 'q', path: 'src/big.bool.json', text: JSON.stringify({ ...newTable('big', ins(16), ['f']), table: { f: col }, form: 'qsop' }) });
  const t0 = Date.now(), b = await results('q', 'src/big.bool.json');
  assert.ok(Date.now() - t0 < 30000, `${Date.now() - t0} ms`);
  const q = b.data.outputs[0].quineMcCluskey.sop;
  assert.deepEqual([q.exact, q.method, q.columns], [false, 'heuristic', null]);
  assert.match(b.text, /\nQuine-McCluskey SOP: f = .+   \(\d+ term\(s\), \d+ literal\(s\); not proven minimal\)\n  \d+ prime implicant\(s\)\n/);
  assert.match(b.text, /HDL logic: Quine-McCluskey SOP: f = .+   \(Quine-McCluskey SOP \(not proven minimal\), \d+ literal\(s\), \d+ gate\(s\), delay \d+\)$/);
});

test('set_output_logic: Quine-McCluskey\'s POS (qpos), the VHDL module made again in it, related_view saying it', async () => {
  await ok('write_file', { project: 'q', path: 'src/m.bool.json', text: JSON.stringify({ ...newTable('m', ['s', 'a', 'b'], ['y']), table: { y: '00110101' } }) });
  await ok('write_file', { project: 'q', path: 'src/m.vhd', text: '' });
  const m = JSON.parse(read('q', 'src/m.bool.json'));
  await ok('write_file', { project: 'q', path: 'src/m.bool.json', text: JSON.stringify({ ...m, generatedFile: 'src/m.vhd' }) });
  const r = await ok('set_output_logic', { project: 'q', path: 'src/m.bool.json', output: 'y', form: 'qpos' });
  assert.equal(r.text.split('\n')[0], 'src/m.bool.json: y\'s HDL logic: Quine-McCluskey POS: y = (s + a).(/s + b)   (Quine-McCluskey POS, 4 literal(s), 4 gate(s), delay 3)');
  assert.equal(r.data.form, 'qpos');
  assert.equal(JSON.parse(read('q', 'src/m.bool.json')).forms.y, 'qpos');
  assert.match(read('q', 'src/m.vhd'), /y <= \(s or a\) and \(not s or b\);/);
  assert.match((await results('q', 'src/m.bool.json')).text, /HDL logic: Quine-McCluskey POS: y = \(s \+ a\)\.\(\/s \+ b\)/);
});

test('set_notation with a table\'s path: its own notation (as its editor\'s ⋮ menu), related_view and set_output_logic in it; cleared, the one set', async () => {
  await ok('write_file', { project: 'q', path: 'src/own.bool.json', text: JSON.stringify({ ...newTable('own', ['a', 'b'], ['f']), table: { f: '0010' } }) });
  assert.equal((await ok('set_notation', { project: 'q', path: 'src/own.bool.json' })).text, 'src/own.bool.json: Boolean notation: as the settings, Text only (/a.b + c)');
  const set = await ok('set_notation', { project: 'q', path: 'src/own.bool.json', notation: 'logic' });
  assert.deepEqual([set.text, set.data.notation], ['src/own.bool.json: Boolean notation: Logic / Set theory (¬a ∧ b ∨ c)', 'logic']);
  assert.equal(JSON.parse(read('q', 'src/own.bool.json')).notation, 'logic');
  assert.equal((await ok('set_notation', { project: 'q', path: 'src/own.bool.json', notation: 'logic' })).text, 'src/own.bool.json: Boolean notation: already Logic / Set theory (¬a ∧ b ∨ c)');
  assert.equal((await results('q', 'src/own.bool.json')).data.outputs[0].quineMcCluskey.sop.expr, 'f = a ∧ ¬b');
  assert.equal((await ok('related_view', { project: 'q', path: 'src/own.bool.json', view: 'results', notation: 'vhdl' })).data.outputs[0].quineMcCluskey.sop.expr, 'f = a and not b');
  assert.match((await ok('set_output_logic', { project: 'q', path: 'src/own.bool.json', output: 'f', form: 'qsop' })).text, /^src\/own\.bool\.json: f's HDL logic: Quine-McCluskey SOP: f = a ∧ ¬b /);
  assert.equal((await ok('set_notation', {})).data.notation, 'slash');   // (the one set unchanged)
  await ok('set_notation', { project: 'q', path: 'src/own.bool.json', notation: 'settings' });
  assert.equal(JSON.parse(read('q', 'src/own.bool.json')).notation, undefined);
  assert.equal((await results('q', 'src/own.bool.json')).data.outputs[0].quineMcCluskey.sop.expr, 'f = a./b');
  const fails = async (args, message) => { const r = await call('set_notation', args); assert.deepEqual([r.isError, r.text], [true, `set_notation: ${message}`]); };
  await fails({ notation: 'settings' }, 'notation settings: a truth table\'s (its project and path)');
  await fails({ project: 'q' }, 'a table\'s notation: its project and its path');
  await fails({ project: 'q', path: 'src/m.vhd', notation: 'logic' }, 'src/m.vhd: a truth table (.bool.json, .tt.json) has a notation of its own');
  await fails({ project: 'q', path: 'src/none.bool.json', notation: 'logic' }, "no file 'src/none.bool.json' in the project 'q'");
});

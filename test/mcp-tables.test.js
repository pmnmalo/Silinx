// The MCP server's set_output_logic (server/mcp-tables.js, #2950, #2951): an output's HDL logic and the minimal solution
// it uses set as the editor sets them (core/logic-choice.js setOutputLogic), the table written and its HDL file made again
// (traffic's lamps: its VHDL module follows); related_view's results say them; the errors. Its inputs and outputs set as its
// Inputs and Outputs boxes set them (core/logic.js shapeTable): one name changed in place a rename, its
// column or its rows kept (#5165), names added or removed following their names, reordered as the editor's headers dragged
// (#5863: moveColumn), an output duplicated (#5869: duplicateOutput); its refusals, nothing written.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { newTable, normalizeTable, setOutputLogic, generateTableHdl, shapeTable, moveColumn } from '../core/logic.js';
import { duplicateOutput, insertColumn, deleteColumn } from '../core/logic-columns.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (args) => { const r = await call('set_output_logic', args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, message) => { const r = await call('set_output_logic', args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `set_output_logic: ${message}`); };
const read = (project, f) => fs.readFileSync(path.join(P.projectDir(project), f), 'utf8');

// (the expressions in the text notation, /a.b + c, set as the interface's Settings ▸ Boolean Notation sets it, #3915)
before(async () => { tmp = await scratchEnv('silinx-mcp-tables-'); assert.equal((await call('set_notation', { notation: 'slash' })).isError, false); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('set_output_logic: traffic\'s lamps, an output in the canonical SOP: the table as setOutputLogic makes it, its VHDL module made again', async () => {
  await call('new_project_from_example', { name: 't', example: 'traffic' });
  const before = JSON.parse(read('t', 'src/lamps.bool.json'));
  const r = await ok({ project: 't', path: 'src/lamps.bool.json', output: 'car_y', form: 'csop' });
  const doc = JSON.parse(read('t', 'src/lamps.bool.json'));
  assert.deepEqual(doc, setOutputLogic(before, 'car_y', { form: 'csop' }));
  assert.equal(read('t', 'src/lamps.bool.json'), JSON.stringify(doc, null, 2));
  assert.deepEqual([doc.form, doc.forms], ['sop', { car_y: 'csop' }]);
  // its module: the one the table generates, car_y's assignment a sum of minterms of the four inputs
  assert.equal(read('t', 'src/lamps.vhd'), generateTableHdl(doc, 'vhdl', { source: 'lamps.bool.json' }).code);
  assert.match(read('t', 'src/lamps.vhd'), /car_y <= \(not phase2 and not phase1 and phase0 and not blink\) or /);
  assert.deepEqual([r.data.output, r.data.form, r.data.solutions, r.data.hdl.file, r.data.hdl.written], ['car_y', 'csop', {}, 'src/lamps.vhd', true]);
  assert.match(r.text, /^src\/lamps\.bool\.json: car_y's HDL logic: Canonical SOP: car_y = \/phase2\.\/phase1\.phase0\.\/blink \+ .* {3}\(canonical SOP, \d+ gate\(s\), delay \d+\)/);
  // related_view's results say it
  const v = (await call('related_view', { project: 't', path: 'src/lamps.bool.json', view: 'results' })).data.outputs;
  assert.deepEqual(v.map(o => [o.output, o.hdlLogic.form, o.hdlLogic.name]), [['car_r', 'sop', 'Karnaugh map SOP'], ['car_y', 'csop', 'Canonical SOP'], ['car_g', 'sop', 'Karnaugh map SOP'], ['walk_r', 'sop', 'Karnaugh map SOP'], ['walk_g', 'sop', 'Karnaugh map SOP']]);
  // back to its minimal SOP: the module committed with the example again
  await ok({ project: 't', path: 'src/lamps.bool.json', output: 'car_y', form: 'sop' });
  assert.equal(read('t', 'src/lamps.vhd'), fs.readFileSync(new URL('../examples/traffic/src/lamps.vhd', import.meta.url), 'utf8'));
});

test('set_output_logic: the minimal solution used (a cyclic chart) and the form at once; related_view marks the solution used', async () => {
  await call('new_project', { name: 'c' });
  const t = normalizeTable({ ...newTable('cyc', ['a', 'b', 'c'], ['f']), table: { f: '11100111' } });
  await call('write_file', { project: 'c', path: 'src/cyc.bool.json', text: JSON.stringify(t, null, 2) });
  const r = await ok({ project: 'c', path: 'src/cyc.bool.json', output: 'f', form: 'sop', solution: { sop: 1 } });
  assert.deepEqual([r.data.form, r.data.solutions, r.data.expr, r.data.what], ['sop', { sop: 1 }, 'f = /a./c + /b.c + a.b', 'minimal SOP (solution 2 of 2), 6 literal(s), 4 gate(s), delay 2']);
  // (the table written by write_file has its HDL file since #3184, which set_output_logic writes again, #3234)
  assert.deepEqual(r.data.hdl, { file: 'src/cyc.vhd', written: true });
  assert.match(read('c', 'src/cyc.vhd'), /^entity cyc is/m);
  assert.deepEqual(JSON.parse(read('c', 'src/cyc.bool.json')).solutions, { f: { sop: 1 } });
  const v = await call('related_view', { project: 'c', path: 'src/cyc.bool.json', view: 'results' });
  assert.equal(v.data.outputs[0].kmap.sop.used, 1);
  assert.equal(v.data.outputs[0].kmap.sop.expr, 'f = /a./c + /b.c + a.b');
  assert.ok(v.text.includes(`Karnaugh map SOP: f = /a./c + /b.c + a.b   (3 term(s), 6 literal(s); gates: 1 AND2, 1 AND2B1, 1 AND2B2, 1 OR3)
  2 minimal solutions exist.
  Solution 1 of 2: f = /a./b + b./c + a.c
  Solution 2 of 2: f = /a./c + /b.c + a.b   (used)
`), v.text);
  assert.ok(v.text.endsWith('HDL logic: Karnaugh map SOP: f = /a./c + /b.c + a.b   (minimal SOP (solution 2 of 2), 6 literal(s), 4 gate(s), delay 2)'), v.text);
  // the solution alone: the form kept
  const s = await ok({ project: 'c', path: 'src/cyc.bool.json', output: 'f', solution: { sop: 0 } });
  assert.deepEqual([s.data.form, s.data.solutions, s.data.expr], ['sop', {}, 'f = /a./b + b./c + a.c']);
});

test('set_output_logic refuses: not a table, nothing to set, an output, a form or a solution that does not exist, a file not there', async () => {
  await call('new_project_from_example', { name: 'b', example: 'traffic' });
  const before = read('b', 'src/lamps.bool.json');
  await fails({ project: 'b', path: 'src/top.vhd', output: 'f', form: 'sop' }, 'src/top.vhd: a truth table (.bool.json, .tt.json) has outputs');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r' }, 'form or solution (or inputs, outputs, duplicate): what to set');
  await fails({ project: 'b', path: 'src/lamps.bool.json', form: 'sop' }, 'output: the output whose logic to set');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'f', form: 'sop' }, "src/lamps.bool.json: no output 'f' (outputs: car_r, car_y, car_g, walk_r, walk_g)");
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r', form: 'esop' }, 'form: one of sop, pos, qsop, qpos, xor, nand, nor, gates, delay, csop, cpos');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r', solution: { sop: 3 } }, 'src/lamps.bool.json: solution sop: one minimal solution (0)');
  await fails({ project: 'b', path: 'src/none.bool.json', output: 'f', form: 'sop' }, "no file 'src/none.bool.json' in the project 'b'");
  assert.equal(read('b', 'src/lamps.bool.json'), before, 'nothing written');
});

// ------------------------------------------------------------------ set_output_logic: the inputs and outputs (#5165)
const TABLE = { ...newTable('m', ['a', 'b'], ['f', 'g']), table: { f: '0111', g: '0001' }, exprs: { f: 'a + b' } };
const table = () => JSON.parse(read('p', 'src/m.bool.json'));
const ports = (inputs, outputs, rel = 'src/m.bool.json') => call('set_output_logic', { project: 'p', path: rel, inputs, outputs });
const portsOk = async (inputs, outputs) => { const r = await ports(inputs, outputs); assert.equal(r.isError, false, r.text); return r; };
const fresh = () => call('write_file', { project: 'p', path: 'src/m.bool.json', text: JSON.stringify(TABLE) });

test('set_output_logic, inputs and outputs: an output renamed keeps its column, an input renamed its rows (#5165); the HDL made again', async () => {
  await call('new_project', { name: 'p' });
  await fresh();
  let r = await portsOk(['a', 'b'], ['f', 'match']);
  assert.equal(r.text.split('\n')[0], 'src/m.bool.json: inputs a, b; outputs f, match');
  assert.deepEqual([r.data.table, table().table, table().exprs], [{ f: '0111', match: '0001' }, { f: '0111', match: '0001' }, { f: 'a + b' }]);
  assert.match(read('p', r.data.hdl.file), /match\s*:\s*out/i);
  r = await portsOk(['a', 'flash'], ['f', 'match']);
  assert.deepEqual([table().inputs, table().table, table().exprs], [['a', 'flash'], { f: '0111', match: '0001' }, { f: 'a + flash' }]);
  // the editor's function: the same document (with the HDL file it makes)
  assert.deepEqual(table(), { ...shapeTable(normalizeTable(TABLE), ['a', 'flash'], ['f', 'match']), generatedFile: 'src/m.vhd' });
  assert.match(read('p', r.data.hdl.file), /flash\s*:\s*in/i);
});

test('set_output_logic, inputs and outputs: traffic\'s lamps, blink renamed flash: the same table (#5165)', async () => {
  await call('new_project_from_example', { name: 'l', example: 'traffic' });
  const before = JSON.parse(read('l', 'src/lamps.bool.json'));
  const r = await call('set_output_logic', { project: 'l', path: 'src/lamps.bool.json', inputs: ['phase2', 'phase1', 'phase0', 'flash'], outputs: before.outputs });
  assert.equal(r.isError, false, r.text);
  const after = JSON.parse(read('l', 'src/lamps.bool.json'));
  assert.deepEqual([after.inputs, after.table], [['phase2', 'phase1', 'phase0', 'flash'], before.table]);
});

test('set_output_logic, inputs and outputs reordered: the rows sorted again as the editor\'s headers dragged (moveColumn, #5863)', async () => {
  // traffic's lamps: blink moved first, then the outputs reversed; each the editor's move, its HDL's ports in the new order
  await call('new_project_from_example', { name: 'o', example: 'traffic' });
  const before = normalizeTable(JSON.parse(read('o', 'src/lamps.bool.json')));
  const ins = before.inputs, last = ins.length - 1;
  let r = await call('set_output_logic', { project: 'o', path: 'src/lamps.bool.json', inputs: [ins[last], ...ins.slice(0, last)] });
  assert.equal(r.isError, false, r.text);
  const moved = moveColumn(before, 'inputs', last, 0);
  assert.equal(r.text.split('\n')[0], `src/lamps.bool.json: inputs ${moved.inputs.join(', ')}; outputs ${moved.outputs.join(', ')}`);
  assert.deepEqual(normalizeTable(JSON.parse(read('o', 'src/lamps.bool.json'))), moved);
  assert.notDeepEqual(moved.table, before.table);
  assert.match(read('o', r.data.hdl.file), new RegExp(`${moved.inputs.join(', ')} : in`));
  r = await call('set_output_logic', { project: 'o', path: 'src/lamps.bool.json', outputs: [...moved.outputs].reverse() });
  assert.equal(r.isError, false, r.text);
  let doc = moved;
  for (let i = 0; i < moved.outputs.length - 1; i++) doc = moveColumn(doc, 'outputs', moved.outputs.length - 1, i);
  assert.deepEqual(normalizeTable(JSON.parse(read('o', 'src/lamps.bool.json'))), doc);
  assert.deepEqual(doc.table, moved.table);
});

test('set_output_logic, duplicate: an output copied after it as its header\'s menu copies it (duplicateOutput, #5869); refused', async () => {
  await call('write_file', { project: 'p', path: 'src/m.bool.json', text: JSON.stringify({ ...TABLE, generatedFile: 'src/m.vhd' }) });   // (its module linked)
  const r = await call('set_output_logic', { project: 'p', path: 'src/m.bool.json', duplicate: 'f' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text.split('\n')[0], 'src/m.bool.json: inputs a, b; outputs f, f2, g');
  const { generatedFile, ...doc } = table();
  assert.deepEqual(doc, duplicateOutput(normalizeTable(TABLE), 0));
  assert.deepEqual([doc.table.f2, doc.exprs.f2], ['0111', 'a + b']);
  assert.match(read('p', r.data.hdl.file), /f, f2, g\s*:\s*out/i);
  // a column inserted and one deleted, by their names: the menu's Insert and Delete (an input's outputs independent of it)
  await portsOk(['a', 'c', 'b'], ['f', 'g']);
  assert.deepEqual(table().table, insertColumn(deleteColumn(doc, 'outputs', 1), 'inputs', 1, 'c').table);
  await fails({ project: 'p', path: 'src/m.bool.json', duplicate: 'h' }, "src/m.bool.json: no output 'h'");
});

test('set_output_logic: an output renamed and its logic set at once, the logic of the new name', async () => {
  await fresh();
  const r = await call('set_output_logic', { project: 'p', path: 'src/m.bool.json', outputs: ['y', 'g'], output: 'y', form: 'csop' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual([table().table, table().forms, r.data.form], [{ y: '0111', g: '0001' }, { y: 'csop' }, 'csop']);
});

test('set_output_logic, inputs and outputs: names added and removed follow their names, a new output is 0s; two changed at once are new', async () => {
  await fresh();
  await portsOk(['a', 'b', 'c'], ['g', 'h']);
  assert.deepEqual(table().table, { g: '00000011', h: '00000000' });
  await fresh();
  await portsOk(['a', 'b'], ['x', 'y']);
  assert.deepEqual(table().table, { x: '0000', y: '0000' });
});

test('set_output_logic, inputs and outputs: refused as the editor does, nothing written: a name twice, a reserved word, an empty list, not a table', async () => {
  await fresh();
  const before = read('p', 'src/m.bool.json');
  const refused = async (inputs, outputs, message, rel) => {
    const r = await ports(inputs, outputs, rel);
    assert.deepEqual([r.isError, r.text], [true, `set_output_logic: ${message}`]);
    assert.equal(read('p', 'src/m.bool.json'), before);
  };
  await refused(['a', 'b'], ['f', 'a'], "src/m.bool.json: the name 'a' is used twice");
  await refused(['a', 'signal'], ['f', 'g'], "src/m.bool.json: 'signal' is a reserved word of VHDL: choose another name.");
  await refused([], ['f'], 'src/m.bool.json: 1 to 16 inputs');   // (an empty list: the tool's refusal, no minItems in the MCP's schemas, #5201)
  await refused(['a'], [], 'src/m.bool.json: At least 1 output');
  await refused(['a'], ['f'], 'src/m.vhd: a truth table (.bool.json, .tt.json) has outputs', 'src/m.vhd');
});

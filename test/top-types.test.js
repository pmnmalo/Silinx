// The Top-Level Source Type (core/top-types.js, #4105): its types, a project's (HDL's before the setting), why one is
// not a project's (unknown; HDL or C / C++ in a design and simulation project); set_design_properties top_source_type,
// as Design Properties': saved alone or with the rest, nothing made, in either kind of project, with its checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { TOP_TYPES, HDL_TOP_TYPES, topType, projectTopType, topTypeRefusal } from '../core/top-types.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-top-types-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const DRAWN = 'top_source_type c: a design and simulation project\'s top is a drawing (sch, fsm, asm, tt, petri, circuit)';

test('the types, a project\'s, the refusals', () => {
  assert.deepEqual(TOP_TYPES.map(t => t.id), ['hdl', 'sch', 'fsm', 'asm', 'tt', 'petri', 'circuit', 'c', 'cpp']);
  assert.deepEqual(TOP_TYPES.filter(t => !t.file).map(t => t.id), ['hdl']);
  assert.deepEqual(HDL_TOP_TYPES, ['hdl', 'c', 'cpp']);
  assert.deepEqual([topType('petri').label, topType('nope'), projectTopType({}).id, projectTopType(null).id, projectTopType({ topSourceType: 'cpp' }).label], ['Petri Net', null, 'hdl', 'hdl', 'C++ Function (HLS)']);
  assert.equal(topTypeRefusal({}, 'cpp'), null);
  assert.equal(topTypeRefusal({ kind: 'design' }, 'circuit'), null);
  assert.equal(topTypeRefusal({ kind: 'design' }, 'c'), DRAWN);
  assert.equal(topTypeRefusal({}, 'vhdl'), 'top_source_type: one of hdl, sch, fsm, asm, tt, petri, circuit, c, cpp');
});

test('set_design_properties top_source_type: saved alone, nothing made; with the rest; a design project\'s drawings only', async () => {
  await ok('new_project', { name: 't1' });
  const before = await P.fileTree('t1');
  const r = await ok('set_design_properties', { project: 't1', top_source_type: 'petri' });
  assert.equal(r.text, 'Top-Level Source Type: Petri Net.');
  assert.deepEqual([(await P.readProject('t1')).topSourceType, await P.fileTree('t1')], ['petri', before]);
  const w = await ok('set_design_properties', { project: 't1', top_source_type: 'cpp', preferred_language: 'verilog' });
  assert.equal(w.text.split('\n').pop(), 'Top-Level Source Type: C++ Function (HLS).');
  assert.deepEqual([(await P.readProject('t1')).topSourceType, (await P.readProject('t1')).preferredLanguage], ['cpp', 'verilog']);
  await ok('new_project', { name: 't2', kind: 'design' });
  await ok('set_design_properties', { project: 't2', top_source_type: 'circuit' });
  assert.equal((await P.readProject('t2')).topSourceType, 'circuit');
  await fails('set_design_properties', { project: 't2', top_source_type: 'c' }, DRAWN);
  // (made a design project with it; made an FPGA project, an HDL type then allowed)
  await ok('new_project', { name: 't3' });
  const d = await ok('set_design_properties', { project: 't3', kind: 'design', top_source_type: 'fsm' });
  assert.deepEqual([d.text.split('\n').pop(), (await P.readProject('t3')).kind, (await P.readProject('t3')).topSourceType], ['Top-Level Source Type: Finite State Machine (FSM).', 'design', 'fsm']);
  await fails('set_design_properties', { project: 't3', kind: 'design', top_source_type: 'hdl' }, 'top_source_type hdl: a design and simulation project\'s top is a drawing (sch, fsm, asm, tt, petri, circuit)');
  await ok('set_design_properties', { project: 't3', kind: 'fpga', top_source_type: 'hdl' });
  assert.deepEqual([(await P.readProject('t3')).kind, (await P.readProject('t3')).topSourceType], [undefined, 'hdl']);
  await fails('set_design_properties', { project: 't1', top_source_type: 'vhdl' }, 'top_source_type: one of hdl, sch, fsm, asm, tt, petri, circuit, c, cpp');
});

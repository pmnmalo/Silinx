// New Project's Top-Level Source Type (#4105) through the MCP server's new_project (#4121), core/top-source.js's files
// (its move checked in test/top-source.test.js): each type's project as the wizard makes it
// (its silinx.json, its top document and HDL module, the top 'top'), its check and its refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { TOP_TYPES } from '../core/top-types.js';
import { topSourceFiles } from '../core/top-source.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-new-project-top-'); });
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
const read = (pj, rel) => fs.readFileSync(`${P.projectDir(pj)}/${rel}`, 'utf8');

test('new_project top_source_type: each type\'s project as the wizard makes it, its HDL in the language, its check clean', async () => {
  for (const t of TOP_TYPES) {
    for (const lang of ['vhdl', 'verilog']) {
      const name = `T_${t.id}_${lang}`;
      const r = await ok('new_project', { name, board: 'basys2', top_source_type: t.id, language: lang });
      const pj = await P.readProject(name);
      const files = await topSourceFiles(t.id, lang);
      // its silinx.json: the type, the language, the top 'top' (none: an HDL project's)
      assert.deepEqual([pj.topSourceType, pj.preferredLanguage, pj.top], [t.id, lang, files ? 'top' : '']);
      assert.deepEqual([r.data.topSourceType, r.data.preferredLanguage, r.data.top, r.data.topFile], [t.id, lang, files ? 'top' : null, t.file ?? null]);
      assert.equal(r.text.split(' It is untrusted')[0], files ? `Project '${name}' made: basys2 (xc3s250ecp132-4). It starts with ${t.file} (the top module 'top'). Write its sources with write_file.`
        : `Empty project '${name}' made: basys2 (xc3s250ecp132-4). Write its sources with write_file, then set_top.`);
      // its files the wizard's, its HDL module a design source
      for (const f of files?.files || []) assert.equal(read(name, f.path), f.text, `${name} ${f.path}`);
      const hdl = files?.files[1]?.path;
      if (hdl) assert.ok(pj.files.some(f => f.path === hdl && f.role === 'design'), JSON.stringify(pj.files));
      if (!files) assert.deepEqual(pj.files, []);
    }
  }
  // a diagram's top checked: no error; no warning, but the new truth table's inputs, its f all 0 yet
  const unused = ['a', 'b', 'c'].map(x => `Input <${x}> is never used.`);
  for (const [name, warnings] of [['T_sch_vhdl', []], ['T_fsm_verilog', []], ['T_asm_vhdl', []], ['T_tt_verilog', unused], ['T_tt_vhdl', unused]]) {
    const c = await ok('check_syntax', { project: name });
    assert.deepEqual([c.data.errors, c.data.warnings.map(w => w.message)], [[], warnings], `${name}: ${c.text}`);
  }
});

test('new_project top_source_type in a design and simulation project: a drawing\'s, VHDL its Preferred Language; the refusals', async () => {
  const r = await ok('new_project', { name: 'D_fsm', kind: 'design', top_source_type: 'fsm', language: 'verilog' });
  const pj = await P.readProject('D_fsm');
  assert.deepEqual([pj.kind, pj.topSourceType, pj.preferredLanguage, pj.top], ['design', 'fsm', 'vhdl', 'top']);
  assert.equal(r.text, 'Design and simulation project \'D_fsm\' made (no FPGA). It starts with src/top.fsm.json (the top module \'top\'). Add its drawings with new_source.');
  assert.equal(read('D_fsm', 'src/top.fsm.json'), (await topSourceFiles('fsm', 'verilog')).files[0].text);
  // the language alone: the Preferred Language saved, no top made
  await ok('new_project', { name: 'L_only', language: 'verilog' });
  assert.deepEqual([(await P.readProject('L_only')).preferredLanguage, (await P.readProject('L_only')).topSourceType, (await P.readProject('L_only')).top], ['verilog', undefined, '']);
  // without either: as before, nothing of the flow saved
  const plain = await ok('new_project', { name: 'Plain' });
  assert.deepEqual([(await P.readProject('Plain')).preferredLanguage, (await P.readProject('Plain')).topSourceType, 'topFile' in plain.data], [undefined, undefined, false]);
  // refused, nothing made
  await fails('new_project', { name: 'D_c', kind: 'design', top_source_type: 'c' }, 'top_source_type c: a design and simulation project\'s top is a drawing (sch, fsm, asm, tt, petri, circuit)');
  await fails('new_project', { name: 'D_hdl', kind: 'design', top_source_type: 'hdl' }, 'top_source_type hdl: a design and simulation project\'s top is a drawing (sch, fsm, asm, tt, petri, circuit)');
  await fails('new_project', { name: 'X_bad', top_source_type: 'vhdl' }, 'top_source_type: one of hdl, sch, fsm, asm, tt, petri, circuit, c, cpp');
  await fails('new_project', { name: 'X_lang', language: 'c' }, 'language: one of vhdl, verilog');
  for (const n of ['D_c', 'D_hdl', 'X_bad', 'X_lang']) assert.equal(fs.existsSync(P.projectDir(n)), false, n);
});

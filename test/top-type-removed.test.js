// The Top-Level Source Type removed (#5786): a project saved before with one (`topSourceType`: HDL's, a drawing's, a
// System's) opens as it was otherwise, the field dropped when it is read (core/project-json.js) and when it is written
// (core/project-defaults.js projectJsonText, both stores'); a System project of before is still a System project, by its
// kind or profile; the MCP's tools no longer take it; New Project's code no longer names it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';
import { parseDescription } from '../core/project-json.js';
import { projectJsonText } from '../core/project-defaults.js';
import { modeOf } from '../core/project-mode.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-top-type-removed-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}

// a project folder written as a Silinx of before wrote it (its silinx.json with the field)
function old(name, pj) {
  const dir = path.join(process.env.SILINX_WORKSPACE, name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name, version: 1, files: [], ...pj }, null, 2) + '\n');
  return path.join(dir, 'silinx.json');
}

test('#5786 read and written: the field dropped, the rest kept', () => {
  assert.deepEqual(parseDescription('{"name":"a","top":"t","topSourceType":"sch"}', { migrate: false }), { name: 'a', top: 't' });
  assert.deepEqual(parseDescription('﻿{"name":"a","topSourceType":"system","kind":"system"}', { migrate: false }), { name: 'a', kind: 'system' });
  assert.deepEqual(parseDescription('{"name":"a","version":2,"topSourceType":"sch"}'), { name: 'a', version: 2 });
  assert.deepEqual([parseDescription('[1]'), parseDescription('3')], [[1], 3]);
  assert.equal(projectJsonText('a', { name: 'a', version: 2, top: 't', topSourceType: 'fsm', fileTree: [] }), '{\n  "name": "a",\n  "version": 2,\n  "top": "t"\n}\n');
});

test('#5786 a project of before opens: an FPGA project with a schematic\'s type, a System one with System\'s; the field gone after a save', async () => {
  const f1 = old('oldfpga', { board: 'basys2', top: 'top', topSourceType: 'sch', preferredLanguage: 'vhdl' });
  const f2 = old('oldsys', { kind: 'system', board: null, top: '', topSourceType: 'system' });
  fs.writeFileSync(path.join(process.env.SILINX_WORKSPACE, 'oldsys', 'oldsys.sys.json'), JSON.stringify({ format: 'silinx-system', version: 2, name: 'oldsys', nodes: [], links: [] }, null, 2) + '\n');
  const a = await P.readProject('oldfpga'), b = await P.readProject('oldsys');
  assert.deepEqual([a.board, a.top, a.preferredLanguage, 'topSourceType' in a, modeOf(a)], ['basys2', 'top', 'vhdl', false, 'board']);
  assert.deepEqual([b.profile, 'topSourceType' in b, modeOf(b)], ['system', false, 'system']);   // (its kind as its profile, #5907)
  // (the MCP: as it was)
  const info = await call('project_info', { project: 'oldsys' });
  assert.deepEqual([info.isError, info.data.mode], [false, 'system']);
  // (saved: the field gone from the file)
  await P.updateProject('oldfpga', pj => ({ ...pj, simTop: '' }));
  await P.updateProject('oldsys', pj => pj);
  for (const f of [f1, f2]) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /topSourceType/, f);
  assert.equal(JSON.parse(fs.readFileSync(f1, 'utf8')).top, 'top');
});

test('#5786 no code names it any more: the field, the argument, the label, the module', () => {
  const files = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) walk(r); else if (/\.(js|mjs)$/.test(e.name)) files.push(r); } };
  for (const d of ['core', 'server', 'web/js']) walk(d);
  const said = files.filter(f => /topSourceType|top_source_type|TOP_TYPES|top-types\.js|top-source\.js|'Top-Level Source Type:'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  // (but where it is dropped from a project of before; ISE's .xise property, computed from the top's file, is ISE's name)
  assert.deepEqual(said.sort(), ['core/project-defaults.js', 'core/project-json.js']);
  assert.equal(fs.existsSync(path.join(ROOT, 'core/top-types.js')) || fs.existsSync(path.join(ROOT, 'core/top-source.js')), false);
});

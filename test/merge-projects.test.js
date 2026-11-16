// Merge Contribution… on the server's projects (#4206: core/merge-apply.js on server/merge-projects.js) and through the
// MCP's tools (server/mcp-merge.js), on the traffic example: a teacher's project given out (Export as a copy), a
// student's copy imported, both changed (a state diagram's different objects, a Verilog file there, a VHDL file here)
// and the student's work exported back; the merge three-way through the ancestor the copy carries, then through the
// project's own snapshot (a contribution that carries none), two-way with neither; the merged state diagram's HDL made
// again and simulated against its model in VHDL (its file) and in Verilog; the project untrusted (madeBy 'merge'); Undo
// Merge putting it back byte for byte, refused once the project changed; the conflicts chosen through the MCP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

let tmp;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-merge-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries } = await import('../server/project-zip.js');
const { mergeStorage } = await import('../server/merge-projects.js');
const { applyMerge, previewMerge, undoMerge, mergeLines } = await import('../core/merge-apply.js');
const { contributionOf } = await import('../core/project-merge.js');
const { gateZip } = await import('../core/import-gate.js');
const { readZip, createZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const { handle } = await import('../server/mcp.js');
const FSM = 'src/traffic.fsm.json';
const S = mergeStorage(P);
const file = (name, rel) => fs.readFileSync(path.join(P.projectDir(name), rel), 'utf8');
const put = (name, rel, text) => fs.writeFileSync(path.join(P.projectDir(name), rel), text);
const fsm = (name, fn) => { const m = JSON.parse(file(name, FSM)); fn(m); put(name, FSM, `${JSON.stringify(m, null, 2)}\n`); };
const contribution = async (zip) => contributionOf(await gateZip(zip, NODE_CODEC));
const tree = async (name) => Object.fromEntries(await Promise.all((await P.fileTree(name)).map(async (f) => [f, file(name, f)])));
let rpc = 0;
const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } })).result; return { text: r.content[0].text, data: r.structuredContent, isError: r.isError }; };

// the teacher's project, the student's copy and the student's work given back (a zip)
let back, made = null;
const setup = () => (made ||= (async () => {
  await P.createProject({ name: 'teacher', template: 'traffic' });
  const copy = (await exportProjectZip(P, 'teacher', 'silinx', { copy: true })).zip;
  await importProjectEntries(P, 'ana', await gateZip(copy, NODE_CODEC), (m) => new Error(m));
  // ana: a state and its transition, the seven-segment decoder (Verilog)
  fsm('ana', (m) => { m.states.push({ id: 's8', name: 'S0', x: 900, y: 600, outputs: {} }); m.transitions.push({ id: 't9', from: 's8', to: 's1', cond: 'done', outputs: {} }); });
  put('ana', 'src/sevenseg.v', `${file('ana', 'src/sevenseg.v')}// ana\n`);
  back = (await exportProjectZip(P, 'ana', 'silinx', { copy: true })).zip;
  fs.writeFileSync(path.join(tmp, 'exchange', 'ana.zip'), back);
  // the teacher meanwhile: another state moved, the timer (VHDL)
  fsm('teacher', (m) => { m.states[0].x += 40; });
  put('teacher', 'src/timer.vhd', `${file('teacher', 'src/timer.vhd')}-- teacher\n`);
})());

test('three-way through the ancestor the copy carries: both sides\' work kept, the state diagram merged and its HDL made again, simulating as its model; untrusted', async () => {
  await setup();
  const before = await tree('teacher');
  const p = await previewMerge(S, 'teacher', await contribution(back));
  assert.equal(p.source, 'carried');
  assert.deepEqual([p.warnings, p.left], [[], []]);
  const r = await applyMerge(S, 'teacher', await contribution(back));
  assert.deepEqual([r.written, r.removed, r.taken, r.regenerated, r.untrusted], [['src/sevenseg.v', FSM], [], ['src/sevenseg.v', FSM], ['src/traffic.vhd'], true]);
  assert.deepEqual(mergeLines('teacher', 'ana.zip', r), [
    "Merged ana.zip into 'teacher' (three-way, through the ancestor the contribution carries): 2 file(s) written, 1 HDL file(s) made again from their drawings.",
    'Project "teacher" had a contribution merged into it (Merge Contribution): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.',
  ]);
  const m = JSON.parse(file('teacher', FSM));
  assert.ok(m.states.some((x) => x.id === 's8') && m.transitions.some((x) => x.id === 't9'));
  assert.equal(m.states[0].x, JSON.parse(before[FSM]).states[0].x);
  assert.match(file('teacher', 'src/timer.vhd'), /-- teacher\n$/);
  assert.match(file('teacher', 'src/sevenseg.v'), /\/\/ ana\n$/);
  const pj = await P.readProject('teacher');
  assert.deepEqual([pj.trusted, pj.madeBy], [false, 'merge']);
  const fm = normalizeFsm(m);
  const vectors = randomVectors(fm, 80, 4);
  assert.deepEqual(runHdl(file('teacher', 'src/traffic.vhd'), 'vhdl', fm, vectors), runModel(fm, vectors));
  assert.deepEqual(runHdl(generateFsm(fm, 'verilog').code, 'verilog', fm, vectors), runModel(fm, vectors));
  // Undo Merge: the project as it was, byte for byte (still untrusted: the user trusts it)
  assert.deepEqual(await undoMerge(S, 'teacher'), { restored: ['src/sevenseg.v', FSM, 'src/traffic.vhd'], removed: [] });
  assert.deepEqual(await tree('teacher'), before);
  assert.equal((await P.readProject('teacher')).trusted, false);
  await assert.rejects(undoMerge(S, 'teacher'), { status: 404, message: "project 'teacher': no merge to undo" });
});

test('a contribution that carries no ancestor: the project\'s own snapshot; neither (another project, or no origin): two-way, said', async () => {
  await setup();
  const entries = (await readZip(back, NODE_CODEC)).filter((e) => e.path !== 'silinx.base.json');
  const bare = await contribution(await createZip(entries, NODE_CODEC));
  assert.equal((await previewMerge(S, 'teacher', bare)).source, 'kept');
  const other = { ...bare, json: { ...bare.json, origin: { ...bare.json.origin, id: crypto.randomUUID() } } };
  const p = await previewMerge(S, 'teacher', other);
  assert.deepEqual([p.source, p.warnings], [null, ['the contribution is a copy of another project (its origin is not this project): a two-way merge, each file that differs is a choice']]);
  assert.deepEqual(p.left.map((x) => x.path).sort(), ['src/sevenseg.v', 'src/timer.vhd', FSM]);
  const { origin, ...none } = bare.json;   // eslint-disable-line no-unused-vars
  assert.equal((await previewMerge(S, 'teacher', { ...bare, json: none })).warnings[0], 'the contribution names no origin (a copy made before Silinx recorded it, or no copy of this project): a two-way merge, each file that differs is a choice');
});

test('Undo Merge refused once the project changed since the merge', async () => {
  await setup();
  await applyMerge(S, 'teacher', await contribution(back));
  put('teacher', 'src/top.vhd', `${file('teacher', 'src/top.vhd')}-- later\n`);
  await assert.rejects(undoMerge(S, 'teacher'), { status: 409, message: "project 'teacher' changed since the merge: Undo Merge would lose those changes (it is not undone)" });
});

test('the MCP: merge_preview lists the conflicts, merge_contribution refuses with one left and merges once chosen, undo_merge; their results untrusted', async () => {
  await P.createProject({ name: 'base2', template: 'traffic' });
  fs.writeFileSync(path.join(tmp, 'exchange', 'base2.zip'), (await exportProjectZip(P, 'base2', 'silinx', { copy: true })).zip);
  assert.equal((await call('import_project', { name: 'bea', from: 'base2.zip' })).isError, false);
  fsm('bea', (m) => { m.transitions[0].cond = 'night and req'; });
  fsm('base2', (m) => { m.transitions[0].cond = 'night or req'; });
  assert.equal((await call('export_project', { project: 'bea', kind: 'silinx', path: 'bea.zip' })).isError, false);
  const p = await call('merge_preview', { project: 'base2', from: 'bea.zip' });
  assert.equal(p.isError, false, p.text);
  assert.match(p.text, /^Merge of bea\.zip into 'base2': three-way, 1 file\(s\) differ, 1 conflict\(s\) to choose\.\n {2}src\/traffic\.fsm\.json: changed on both sides: choose \(transitions\/t1: mine changed \(cond\), theirs changed \(cond\)\)$/);
  assert.ok(p.data.untrusted.note);
  assert.deepEqual(p.data.left, [{ path: FSM, id: 'transitions/t1' }]);
  const refused = await call('merge_contribution', { project: 'base2', from: 'bea.zip' });
  assert.deepEqual([refused.isError, refused.text], [true, 'merge_contribution: not every conflict is resolved: src/traffic.fsm.json transitions/t1']);
  const before = await tree('base2');
  const r = await call('merge_contribution', { project: 'base2', from: 'bea.zip', resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual([r.data.madeUntrusted, !!r.data.untrusted.note], [true, true]);
  assert.equal(JSON.parse(file('base2', FSM)).transitions[0].cond, 'night and req');
  const u = await call('undo_merge', { project: 'base2' });
  assert.equal(u.text, "Undid the last merge of 'base2': 2 file(s) put back, 0 removed.");
  assert.deepEqual(await tree('base2'), before);
  // (no contribution outside the exchange folder; an ISE project's zip refused)
  assert.match((await call('merge_preview', { project: 'base2', from: '/etc' })).text, /^merge_preview: from: '\/etc' is outside the exchange folder/);
  fs.writeFileSync(path.join(tmp, 'exchange', 'ise.zip'), (await exportProjectZip(P, 'base2', 'xilinx')).zip);
  assert.equal((await call('merge_preview', { project: 'base2', from: 'ise.zip' })).text, 'merge_preview: the contribution is a Xilinx ISE project: only a Silinx project (its .zip or its folder) is merged');
});

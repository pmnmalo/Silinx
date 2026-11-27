// The MCP server's project kind (#4103, after #3780): new_project and set_design_properties take kind (fpga, design; new_project's
// system refused until it can be made, #5041), as
// New Project's and Design Properties' Project Kind; design_only its deprecated alias; the same checks and messages as
// the interface's (test/ui/design-only.test.js): a design project made and back, refused with HDL of its own or a board.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-project-kind-');
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
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
const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const FLOW = name => `the project '${name}' is a design and simulation project (no FPGA): choose a board in Design Properties to implement, emulate or program it`;

/** A design project with the traffic example's state diagram as its top. */
async function designProject(name) {
  await ok('new_project', { name, design_only: true });
  await ok('write_file', { project: name, path: 'src/traffic.fsm.json', text: FSM });
  await ok('set_top', { project: name, top: 'traffic' });
}


test('new_project profile: logic, fpga (its default); kind and design_only its deprecated aliases; refused with a board, or with both', async () => {
  assert.deepEqual((await ok('new_project', { name: 'k1', profile: 'logic' })).data.kind, 'design');
  assert.equal((await P.readProject('k1')).profile, 'logic');   // (written as its profile, #5907)
  assert.equal((await P.readProject((await ok('new_project', { name: 'k2', profile: 'fpga' })).data.project)).profile, 'fpga');
  assert.equal((await P.readProject((await ok('new_project', { name: 'k3', design_only: true })).data.project)).profile, 'logic');
  await fails('new_project', { name: 'k4', profile: 'logic', board: 'basys2' }, 'a Digital Logic project (profile logic) has no board: give profile logic or a board, not both');
  await fails('new_project', { name: 'k5', profile: 'logic', design_only: true }, 'give profile, not design_only too (design_only is profile\'s deprecated alias)');
  await fails('new_project', { name: 'k6', kind: 'none' }, 'kind: one of fpga, design, system');
  await fails('new_project', { name: 'k7', profile: 'none' }, 'profile: one of logic, fpga, embedded, system');
  // (kind, its name of before #5440: design the Digital Logic profile, said)
  const k8 = await ok('new_project', { name: 'k8', kind: 'design' });
  assert.equal((await P.readProject('k8')).profile, 'logic');
  assert.ok(k8.text.split('\n').includes('WARNING: kind is deprecated (#5440): give profile (design is profile logic, fpga and system the same).'), k8.text);
});

test('#4702 #5440 new_project profile system or embedded: an empty System project, its System document, no board; refused with a board; its description says the profiles', async () => {
  const r = await call('new_project', { name: 'c1', profile: 'system' });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /^Empty System project 'c1' made: its System c1\.sys\.json \(no node yet\)\. Write its modules with write_file, its firmware \(\.hex, \.elf\), then edit_system\./);
  const pj = await P.readProject('c1');
  assert.deepEqual([pj.kind, pj.profile, pj.board, pj.constraints, pj.top], [undefined, 'system', null, null, '']);   // (its profile, #5440)
  const sys = await call('check_system', { project: 'c1', file: 'c1.sys.json' });
  assert.equal(sys.text.split('\n')[0], 'System c1: 0 nodes, 0 links');
  await fails('new_project', { name: 'c2', profile: 'system', board: 'basys2' }, 'a System project (profile system or embedded) has no board nor top document: its System (edit_system) names each FPGA node\'s board');
  assert.ok(!(await P.listProjects()).some(p => p.name === 'c2'), 'no project made');
  const tools = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} })).result.tools;
  const np = tools.find(t => t.name === 'new_project');
  assert.deepEqual(np.inputSchema.properties.profile.enum, ['logic', 'fpga', 'embedded', 'system']);
  // (Embedded / SoC: a System project of that profile, its System document made)
  const e = await ok('new_project', { name: 'e1', profile: 'embedded' });
  assert.deepEqual([e.data.profile, (await P.readProject('e1')).profile, fs.existsSync(path.join(P.projectDir('e1'), 'e1.sys.json'))], ['embedded', 'embedded', true]);
  // (the profiles in few words, finer than the modes, #5754: the MCP's size limits, #4752, #5097)
  assert.equal(np.inputSchema.properties.profile.description, 'Its profile, finer than its mode: logic (Digital Logic: drawings, no board, no HDL), fpga (FPGA: the default), embedded (Embedded / SoC: FPGA and MCU nodes), system (System: and terminals).');
  assert.match(np.description, / mode circuit \(profile logic, Digital Logic\): /);
});

test('set_design_properties kind design: a design project made, as Design Properties\' Project Kind; again, or with a board, refused', async () => {
  await ok('new_project', { name: 's1' });
  await ok('write_file', { project: 's1', path: 'src/traffic.fsm.json', text: FSM });
  const r = await ok('set_design_properties', { project: 's1', profile: 'logic' });
  assert.match(r.text, /^s1: a design and simulation project now \(no FPGA\): no board, no constraints/);
  assert.deepEqual([(await P.readProject('s1')).profile, (await P.readProject('s1')).board], ['logic', null]);
  await fails('set_design_properties', { project: 's1', profile: 'logic' }, 'the project \'s1\' is a design and simulation project already');
  await ok('new_project', { name: 's2' });
  await fails('set_design_properties', { project: 's2', profile: 'logic', board: 'basys2' }, 'kind: a design and simulation project has no board');
  await fails('set_design_properties', { project: 's2', profile: 'logic', design_only: true }, 'give profile, not design_only too (design_only is profile\'s deprecated alias)');
  // (an HDL source of its own: refused, the interface's message)
  await ok('write_file', { project: 's2', path: 'src/top.v', text: 'module top(input a, output b);\n  assign b = a;\nendmodule\n' });
  await fails('set_design_properties', { project: 's2', profile: 'logic' }, 'the project \'s2\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/top.v)');
  assert.equal((await P.readProject('s2')).profile, 'fpga');
});

test('set_design_properties kind fpga: a design project an FPGA project, no board (its device the default) or with one; an FPGA project already one', async () => {
  await ok('new_project', { name: 'f1', profile: 'logic' });
  const r = await ok('set_design_properties', { project: 'f1', profile: 'fpga' });
  assert.match(r.text, /f1: an FPGA project now: its HDL and its implementation shown\./);
  const pj = await P.readProject('f1');
  assert.deepEqual([pj.kind, pj.profile, pj.board, pj.device.part, pj.constraints], [undefined, 'fpga', null, 'xc3s250e', 'constraints/top.ucf']);
  await fails('set_design_properties', { project: 'f1', profile: 'fpga' }, 'the project \'f1\' is an FPGA project already');
  await ok('new_project', { name: 'f2', profile: 'logic' });
  await ok('set_design_properties', { project: 'f2', profile: 'fpga', board: 'nexys2' });
  assert.deepEqual([(await P.readProject('f2')).profile, (await P.readProject('f2')).board], ['fpga', 'nexys2']);
  // (design_only false: kind fpga's deprecated alias)
  await ok('new_project', { name: 'f3', profile: 'logic' });
  await ok('set_design_properties', { project: 'f3', design_only: false });
  assert.equal((await P.readProject('f3')).kind, undefined);
  // (a design project given nothing that makes it an FPGA project: the flow's message, as before)
  await ok('new_project', { name: 'f4', profile: 'logic' });
  await fails('set_design_properties', { project: 'f4', synth_tool: 'silinx' }, FLOW('f4'));
  await fails('set_design_properties', { project: 'f4', kind: 'both' }, 'kind: one of fpga, design');
});

test('#5440 set_design_properties profile: an FPGA project widened to Embedded / SoC, nothing converted; a System narrowed refused, its node named; alone', async () => {
  await ok('new_project_from_example', { name: 'w1', example: 'blinky' });
  const before = await P.readProject('w1');
  const r = await ok('set_design_properties', { project: 'w1', profile: 'embedded' });
  assert.equal(r.text, 'w1: Embedded / SoC now: its System may have design, circuit, fpga, mcu nodes (nothing converted, nothing deleted).');
  const pj = await P.readProject('w1');
  assert.deepEqual([pj.profile, pj.kind, pj.board, pj.top, pj.constraints], ['embedded', undefined, before.board, before.top, before.constraints]);
  await fails('set_design_properties', { project: 'w1', profile: 'embedded' }, 'the project \'w1\' is Embedded / SoC already');
  // (back to FPGA: its profile written as every one, #5907; no kind)
  await ok('set_design_properties', { project: 'w1', profile: 'fpga' });
  assert.deepEqual([JSON.parse(fs.readFileSync(path.join(P.projectDir('w1'), 'silinx.json'), 'utf8')).profile, fs.readFileSync(path.join(P.projectDir('w1'), 'silinx.json'), 'utf8').includes('"kind"')], ['fpga', false]);
  // a System example: its System its top, an MCU node
  await ok('new_project_from_example', { name: 'w2', example: 'uart-avr' });
  await fails('set_design_properties', { project: 'w2', profile: 'fpga' }, 'the project \'w2\' cannot be FPGA: its node uno (mcu) is not allowed (FPGA allows design, circuit, fpga)');
  await ok('set_design_properties', { project: 'w2', profile: 'embedded' });
  assert.equal((await P.readProject('w2')).profile, 'embedded');
  await fails('set_design_properties', { project: 'w2', profile: 'system', board: 'basys2' }, 'profile system: give it alone (a System\'s nodes name their boards)');
});

test('#5754 new_project mode: circuit, board, system, each its profile and its kind as New Project\'s cards; a finer profile of the mode; another refused; project_info and list_projects say each mode', async () => {
  const tools = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} })).result.tools;
  const np = tools.find(t => t.name === 'new_project');
  assert.deepEqual(np.inputSchema.properties.mode, { type: 'string', enum: ['circuit', 'board', 'system'], description: 'Its mode: circuit (no board), board (one board, the default), system (devices linked).' });
  const c = await ok('new_project', { name: 'm1', mode: 'circuit' });
  assert.equal(c.text, 'Empty Digital Logic project \'m1\' made (a design and simulation project). Add its drawings with new_source, then set_top.');
  assert.deepEqual([c.data.mode, c.data.kind, (await P.readProject('m1')).profile, (await P.readProject('m1')).board], ['circuit', 'design', 'logic', null]);
  const b = await ok('new_project', { name: 'm2', mode: 'board', board: 'nexys2' });
  assert.deepEqual([b.data.mode, (await P.readProject('m2')).kind, (await P.readProject('m2')).profile, (await P.readProject('m2')).board], ['board', undefined, 'fpga', 'nexys2']);
  const s = await ok('new_project', { name: 'm3', mode: 'system' });
  assert.deepEqual([s.data.mode, s.data.profile, (await P.readProject('m3')).profile, fs.existsSync(path.join(P.projectDir('m3'), 'm3.sys.json'))], ['system', 'system', 'system', true]);
  const e = await ok('new_project', { name: 'm4', mode: 'system', profile: 'embedded' });
  assert.deepEqual([e.data.mode, (await P.readProject('m4')).profile], ['system', 'embedded']);
  // (refused: a profile of another mode, a mode not of the three, a board in Circuit, a System top in Board; nothing made)
  await fails('new_project', { name: 'm5', mode: 'circuit', profile: 'fpga' }, 'profile fpga (FPGA) is not of the mode circuit (Circuit: logic)');
  await fails('new_project', { name: 'm6', mode: 'fpga' }, 'mode: one of circuit, board, system');
  await fails('new_project', { name: 'm7', mode: 'circuit', board: 'basys2' }, 'a Digital Logic project (profile logic) has no board: give profile logic or a board, not both');
  await fails('new_project', { name: 'm8', mode: 'board', top_source_type: 'system' }, 'unknown top_source_type');   // (#5786)
  await fails('new_project', { name: 'm9', mode: 'system', board: 'basys2' }, 'a System project (profile system or embedded) has no board nor top document: its System (edit_system) names each FPGA node\'s board');
  const names = (await P.listProjects()).map(p => p.name);
  for (const n of ['m5', 'm6', 'm7', 'm8', 'm9']) assert.ok(!names.includes(n), `${n} not made`);
  // (each project's mode, read from what it is: its old kind, its profile; its silinx.json as it was)
  const list = (await ok('list_projects', {})).data.projects;
  assert.deepEqual(['m1', 'm2', 'm3', 'm4'].map(n => list.find(p => p.name === n).mode), ['circuit', 'board', 'system', 'system']);
  assert.deepEqual(await Promise.all(['m1', 'm2', 'm3'].map(async n => (await ok('project_info', { project: n })).data.mode)), ['circuit', 'board', 'system']);
  // (a project of before #5754: a design project's silinx.json as #3891 wrote it, read in Circuit mode, not rewritten)
  const file = path.join(P.projectDir('m1'), 'silinx.json');
  const bytes = fs.readFileSync(file, 'utf8');
  assert.equal((await ok('project_info', { project: 'm1' })).data.mode, 'circuit');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('#5757 the examples by mode: list_examples\' modes; new_project_from_example mode circuit, a Circuit example with no board; refusals', async () => {
  const l = await ok('list_examples', {});
  const modes = Object.fromEntries(l.data.examples.map(e => [e.name, e.modes]));
  assert.deepEqual([modes.gates, modes.breadboard, modes.blinky, modes['uart-avr']], [['circuit', 'board'], ['circuit', 'board'], ['board'], ['system']]);
  assert.ok(l.text.split('\n').some(x => /^gates: top gates, .*; a Circuit example too$/.test(x)), l.text);
  const r = await ok('new_project_from_example', { name: 'ce1', example: 'gates', mode: 'circuit' });
  assert.match(r.text, /^Circuit project 'ce1' made from the example gates: top gates, no board\. It is untrusted/);
  const pj = await P.readProject('ce1');
  assert.deepEqual([pj.profile, pj.board, pj.constraints, (await ok('project_info', { project: 'ce1' })).data.mode], ['logic', null, null, 'circuit']);
  assert.ok(!fs.existsSync(path.join(P.projectDir('ce1'), 'constraints')) || !fs.readdirSync(path.join(P.projectDir('ce1'), 'constraints')).length, 'its constraints file not copied');
  // (its test bench runs as the example's)
  const s = await ok('simulate', { project: 'ce1' });
  assert.deepEqual(s.data.warnings ?? [], []);
  await fails('new_project_from_example', { name: 'ce2', example: 'blinky', mode: 'circuit' }, 'blinky is not a circuit example (its modes: board)');
  await fails('new_project_from_example', { name: 'ce3', example: 'gates', mode: 'circuit', board: 'nexys2' }, 'mode circuit: a Circuit project has no board');
  await fails('new_project', { name: 'ce4', profile: 'logic', board: 'basys2' }, 'a Digital Logic project (profile logic) has no board: give profile logic or a board, not both');
});

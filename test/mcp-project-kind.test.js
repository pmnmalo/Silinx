// The MCP server's project kind (#4103, after #3780): new_project and set_design_properties take kind (fpga, design; new_project's
// codesign refused until it can be made, #5041), as
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


test('new_project kind: design, fpga (its default); design_only its deprecated alias; refused with a board, or with both', async () => {
  assert.deepEqual((await ok('new_project', { name: 'k1', kind: 'design' })).data.kind, 'design');
  assert.equal((await P.readProject('k1')).kind, 'design');
  assert.equal((await P.readProject((await ok('new_project', { name: 'k2', kind: 'fpga' })).data.project)).kind, undefined);
  assert.equal((await P.readProject((await ok('new_project', { name: 'k3', design_only: true })).data.project)).kind, 'design');
  await fails('new_project', { name: 'k4', kind: 'design', board: 'basys2' }, 'a design and simulation project has no board: give kind design or a board, not both');
  await fails('new_project', { name: 'k5', kind: 'design', design_only: true }, 'give kind, not design_only too (design_only is kind\'s deprecated alias)');
  await fails('new_project', { name: 'k6', kind: 'none' }, 'kind: one of fpga, design, codesign');
});

test('#5041 new_project kind codesign: refused with New Project\'s reason (its card not chosen yet); its description says the three kinds as the dialog', async () => {
  const { CODESIGN_NOT_YET, PROJECT_KINDS } = await import('../core/project-kind.js');
  await fails('new_project', { name: 'c1', kind: 'codesign' }, `kind codesign: ${CODESIGN_NOT_YET}`);
  assert.equal(CODESIGN_NOT_YET, 'Not available yet: a co-design project needs the System document and its editor, still being built.');
  assert.ok(!(await P.listProjects()).some(p => p.name === 'c1'), 'no project made');
  const tools = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} })).result.tools;
  const np = tools.find(t => t.name === 'new_project');
  assert.deepEqual(np.inputSchema.properties.kind.enum, ['fpga', 'design', 'codesign']);
  // (each kind's name and words, the dialog's cards')
  assert.deepEqual(PROJECT_KINDS.map(k => [k.id, k.name]), [['design', 'No FPGA'], ['fpga', 'With an FPGA'], ['codesign', 'Co-design']]);
  for (const k of PROJECT_KINDS) assert.ok(np.inputSchema.properties.kind.description.includes(`${k.id} (${k.name}: ${k.about})`), k.id);
  assert.ok(np.inputSchema.properties.kind.description.endsWith(`codesign: ${CODESIGN_NOT_YET}`));
  assert.match(np.description, /kind, as New Project's first page \(#5041\): fpga \(With an FPGA, the default\), design \(No FPGA/);
});

test('set_design_properties kind design: a design project made, as Design Properties\' Project Kind; again, or with a board, refused', async () => {
  await ok('new_project', { name: 's1' });
  await ok('write_file', { project: 's1', path: 'src/traffic.fsm.json', text: FSM });
  const r = await ok('set_design_properties', { project: 's1', kind: 'design' });
  assert.match(r.text, /^s1: a design and simulation project now \(no FPGA\): no board, no constraints/);
  assert.deepEqual([(await P.readProject('s1')).kind, (await P.readProject('s1')).board], ['design', null]);
  await fails('set_design_properties', { project: 's1', kind: 'design' }, 'the project \'s1\' is a design and simulation project already');
  await ok('new_project', { name: 's2' });
  await fails('set_design_properties', { project: 's2', kind: 'design', board: 'basys2' }, 'kind: a design and simulation project has no board');
  await fails('set_design_properties', { project: 's2', kind: 'design', design_only: true }, 'give kind, not design_only too (design_only is kind\'s deprecated alias)');
  // (an HDL source of its own: refused, the interface's message)
  await ok('write_file', { project: 's2', path: 'src/top.v', text: 'module top(input a, output b);\n  assign b = a;\nendmodule\n' });
  await fails('set_design_properties', { project: 's2', kind: 'design' }, 'the project \'s2\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/top.v)');
  assert.equal((await P.readProject('s2')).kind, undefined);
});

test('set_design_properties kind fpga: a design project an FPGA project, no board (its device the default) or with one; an FPGA project already one', async () => {
  await ok('new_project', { name: 'f1', kind: 'design' });
  const r = await ok('set_design_properties', { project: 'f1', kind: 'fpga' });
  assert.match(r.text, /f1: an FPGA project now: its HDL and its implementation shown\./);
  const pj = await P.readProject('f1');
  assert.deepEqual([pj.kind, pj.board, pj.device.part, pj.constraints], [undefined, null, 'xc3s250e', 'constraints/top.ucf']);
  await fails('set_design_properties', { project: 'f1', kind: 'fpga' }, 'the project \'f1\' is an FPGA project already');
  await ok('new_project', { name: 'f2', kind: 'design' });
  await ok('set_design_properties', { project: 'f2', kind: 'fpga', board: 'nexys2' });
  assert.deepEqual([(await P.readProject('f2')).kind, (await P.readProject('f2')).board], [undefined, 'nexys2']);
  // (design_only false: kind fpga's deprecated alias)
  await ok('new_project', { name: 'f3', kind: 'design' });
  await ok('set_design_properties', { project: 'f3', design_only: false });
  assert.equal((await P.readProject('f3')).kind, undefined);
  // (a design project given nothing that makes it an FPGA project: the flow's message, as before)
  await ok('new_project', { name: 'f4', kind: 'design' });
  await fails('set_design_properties', { project: 'f4', synth_tool: 'silinx' }, FLOW('f4'));
  await fails('set_design_properties', { project: 'f4', kind: 'both' }, 'kind: one of fpga, design');
});

// A digital circuit's part modules (#4216, core/circuit-modules.js): its generated HDL (VHDL and Verilog) holds the
// circuit's module and its ICs' (<circuit>_sn74ls47…); only the circuit is a module of the project. Every assembly of the
// wizard with its chips, and an older circuit (the half adder of a 7486 and a 7408): its header's module, its part
// modules, the project's modules without them; the HDL still compiled and elaborated with no warnings. The MCP server's
// lists: the Test Bench Wizard's module to test (the first module of the file was a part's), the Constraints Wizard's
// top, rename_module and convert_module (a part refused as no module of the project, its name still taken), the
// schematic's modules.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { circuitModuleOf, circuitPartModules, projectModulesOf } from '../core/circuit-modules.js';
import { circuitTemplate, CIRCUIT_TEMPLATES } from '../core/circuit-templates.js';
import { templateDefaults } from '../core/chart-templates.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { partDef } from '../core/circuit-parts.js';
import { halfAdder } from './circuit-helpers.mjs';
import { scratchEnv } from './server-helpers.js';

const ASSEMBLIES = CIRCUIT_TEMPLATES.filter((t) => !['boards', 'io'].includes(t.id)).map((t) => t.id);
const chipsOf = (m) => [...new Set(m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic').map((d) => `${m.name}_${d.chip.toLowerCase()}`))].sort();

test('a circuit\'s HDL: its header\'s module; its ICs\' modules its parts, not the project\'s; it compiles and elaborates with no warnings', () => {
  const circuits = [...ASSEMBLIES.map((id) => circuitTemplate(id, templateDefaults('circuit', id), { name: `c_${id}` })), halfAdder()];
  for (const m of circuits) {
    for (const lang of ['vhdl', 'verilog']) {
      const what = `${m.name} ${lang}`;
      const g = generateCircuit(m, lang), path = `src/${m.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
      assert.equal(circuitModuleOf(g.code), m.name, what);
      const src = [{ path, text: g.code }];
      const lib = compile(src);
      // (every module of the file: the circuit's and its ICs')
      assert.deepEqual([...lib.modules.values()].map((x) => x.name.toLowerCase()).sort(), [m.name.toLowerCase(), ...chipsOf(m)].sort(), what);
      assert.deepEqual([...circuitPartModules(lib, src)].sort(), chipsOf(m), what);
      assert.deepEqual(projectModulesOf(lib, src).map((x) => x.name), [m.name], what);
      const d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${what}: no warnings`);
    }
  }
});

test('not a circuit\'s HDL: no part modules (a module by hand beside a circuit, one that names the generator later)', () => {
  const c = generateCircuit(halfAdder(), 'vhdl').code;
  const hand = 'entity top is\nend top;\narchitecture rtl of top is\nbegin\nend rtl;\n';
  const fake = '-- a copy of\n-- Generator   : Silinx circuit editor\nentity half_adder_sn74ls86 is\nend half_adder_sn74ls86;\narchitecture rtl of half_adder_sn74ls86 is\nbegin\nend rtl;\n';
  assert.equal(circuitModuleOf(hand), null);
  assert.equal(circuitModuleOf(fake), null);
  assert.equal(circuitModuleOf(''), null);
  const src = [{ path: 'src/half_adder.vhd', text: c }, { path: 'src/top.vhd', text: hand }];
  assert.deepEqual(projectModulesOf(compile(src), src).map((m) => m.name).sort(), ['half_adder', 'top']);
  assert.deepEqual([...circuitPartModules(compile([src[1]]), [src[1]])], []);
  assert.deepEqual([...circuitPartModules(null, src)], []);
});

let tmp;
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const P = await import('../server/projects.js');
const read = (f) => fs.readFileSync(`${P.projectDir('p')}/${f}`, 'utf8');
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };

before(async () => {
  tmp = await scratchEnv('silinx-circuit-modules-');
  await ok('new_project', { name: 'p', board: 'basys2' });
  await ok('new_source', { project: 'p', type: 'circuit', name: 'disp', template: 'seg7' });
});

test('the MCP server: a circuit\'s ICs no modules of the project (the wizards\' module, rename_module, convert_module, the schematic\'s modules)', async () => {
  const info = await ok('project_info', { project: 'p' });
  assert.deepEqual([info.data.files.map((f) => f.path), info.data.roots ?? info.data.hierarchy], [['src/disp.vhd'], { implementation: ['disp'], simulation: ['disp'] }]);
  // the Test Bench Wizard's module to test: the circuit (its file's first module is the 7447's)
  const tb = await ok('test_bench_wizard', { project: 'p' });
  assert.match(read(tb.data.path), /\bdisp\b/);
  assert.doesNotMatch(read(tb.data.path), /sn74ls47/);
  assert.equal(tb.data.path, 'sim/tb_disp.vhd');
  await fails('test_bench_wizard', { project: 'p', module: 'disp_sn74ls47', name: 'tb_x' }, "no design module 'disp_sn74ls47' in the project");
  // rename_module and convert_module: a part is no module of the project; its name taken all the same
  await fails('rename_module', { project: 'p', module: 'disp_sn74ls47', to: 'dec' }, "no module 'disp_sn74ls47' in the project's HDL files (a drawing with no HDL file: write_file its name)");
  await fails('convert_module', { project: 'p', module: 'disp_sn74ls47', to: 'schematic' }, "no module 'disp_sn74ls47' in the project's HDL files");
  await fails('rename_module', { project: 'p', module: 'tb_disp', to: 'disp_sn74ls47' }, "A module named 'disp_sn74ls47' already exists.");
  // the schematic's modules (its palette): the circuit, not its ICs
  const { projectModules } = await import('../server/drawing-sync.js');
  const mods = Object.keys(await projectModules(P, 'p')).map((n) => n.toLowerCase());
  assert.ok(mods.includes('disp'), mods.join());
  assert.deepEqual(mods.filter((n) => n.includes('sn74')), []);
});

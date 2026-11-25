// The MCP server on the Intel (Altera) boards (#5376, #2674: what the interface does): list_devices marks the experimental
// families and their boards, new_project and set_design_properties make the constraints a QSF and say no flow runs them yet,
// new_source and constraints_wizard write QSF, check_constraints checks it, and the processes are refused with the
// interface's message; every result's text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-intel-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const NO_FLOW = 'the 5CEBA4 (Cyclone V, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (the Silinx toolchain\'s flow and Quartus Prime come next)';

test('list_devices: the six DE boards and the MAX 10, Cyclone IV E and Cyclone V, marked experimental', async () => {
  const all = await ok('list_devices');
  const mark = ' [experimental: no implementation flow yet]';
  for (const line of ['de10-lite: Terasic DE10-Lite (10m50daf484c7g)', 'de0-cv: Terasic DE0-CV (5ceba4f23c7)', 'de1-soc: Terasic DE1-SoC (5csema5f31c6)',
    'de10-nano: Terasic DE10-Nano (5cseba6u23i7)', 'de0-nano: Terasic DE0-Nano (ep4ce22f17c6)', 'de2-115: Terasic DE2-115 (ep4ce115f29c7)']) assert.ok(all.text.includes(`\n  ${line}${mark}\n`), line);
  assert.match(all.text, /\n {2}MAX 10 \(max10\) \[experimental: no implementation flow yet\]:\n {4}10m50da: f484 c7g\n/);
  assert.match(all.text, /\n {2}Cyclone IV E \(cyclone4e\) \[experimental: no implementation flow yet\]:\n {4}ep4ce22: f17 c6\n {4}ep4ce115: f29 c7\n/);
  assert.match(all.text, /\n {2}Cyclone V \(cyclone5\) \[experimental: no implementation flow yet\]:\n {4}5ceba4: f23 c7\n {4}5csema5: f31 c6\n {4}5cseba6: u23 i7(\n|$)/);
  assert.deepEqual(all.data.boards.find(b => b.id === 'de0-cv'), { id: 'de0-cv', name: 'Terasic DE0-CV', device: '5ceba4f23c7', experimental: true, variants: [] });
  assert.deepEqual(all.data.families.filter(f => f.experimental).map(f => f.id).slice(-3), ['max10', 'cyclone4e', 'cyclone5']);
  const c5 = await ok('list_devices', { family: 'cyclone5' });
  assert.deepEqual(c5.data.families.map(f => [f.id, f.experimental, f.parts.map(p => p.part)]), [['cyclone5', true, ['5ceba4', '5csema5', '5cseba6']]]);
});

test('new_project on the DE0-CV: its constraints top.qsf with the board\'s pins; the processes refused with the interface\'s message', async () => {
  const r = await ok('new_project', { name: 'c5', board: 'de0-cv' });
  assert.match(r.text, /^Empty project 'c5' made: de0-cv \(5ceba4f23c7\)\. /);
  const pj = await P.readProject('c5');
  assert.deepEqual([pj.constraints, pj.device], ['constraints/top.qsf', { family: 'cyclone5', part: '5ceba4', package: 'f23', speed: 'c7' }]);
  await ok('write_file', { project: 'c5', path: 'src/top.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0));\nend top;\narchitecture rtl of top is\nbegin\n  led <= sw;\nend rtl;\n' });
  await ok('add_to_project', { project: 'c5', path: 'src/top.vhd' });
  await ok('set_top', { project: 'c5', top: 'top' });
  for (const process of ['synthesize', 'implement', 'bitstream']) await fails('run_process', { project: 'c5', process }, NO_FLOW);
});

test('set_design_properties: the DE10-Lite, its pins written as a QSF, the example\'s UCF not converted, no flow yet', async () => {
  await ok('new_project_from_example', { name: 'b1', example: 'blinky' });
  const r = await ok('set_design_properties', { project: 'b1', board: 'de10-lite', update_constraints: true });
  const noFlow = 'WARNING: the 10M50DA (MAX 10, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (Quartus Prime comes next).';
  assert.equal(r.text.split('\n')[0], 'WARNING: this device\'s constraints are QSF: constraints/top.qsf is the project\'s now, constraints/top.ucf was not converted.');
  assert.match(r.text, /\nDevice set to 10M50DAF484C7G \(board de10-lite\); synthesis tool silinx; constraints\/top\.qsf written from the de10-lite's pins\.\n/);
  assert.ok(r.data.warnings.includes(noFlow), r.text);
  assert.equal(r.data.constraints, 'constraints/top.qsf');
  const qsf = fs.readFileSync(path.join(P.projectDir('b1'), 'constraints/top.qsf'), 'utf8');
  assert.match(qsf, /^# QSF for top 'top' on Terasic DE10-Lite \(10M50DAF484C7G\), generated by Silinx\n\nset_location_assignment PIN_P11 -to clk\nset_instance_assignment -name IO_STANDARD "3\.3-V LVTTL" -to clk\n/);
  assert.match(qsf, /\n# create_clock -name \{clk\} -period 20\.000 \[get_ports \{clk\}\]\n/);
  await fails('set_design_properties', { project: 'b1', synth_tool: 'xst' }, 'the 10M50DA is the Silinx toolchain\'s only: no XST');
  // a device with no board: the EP4CE22, its constraints a QSF; a speed grade it has not refused
  await ok('new_project', { name: 'n1' });
  const d = await ok('set_design_properties', { project: 'n1', part: 'ep4ce22', package: 'f17', speed: 'c6' });
  assert.equal(d.text, 'Device set to EP4CE22F17C6; synthesis tool silinx.\nWARNING: the EP4CE22 (Cyclone IV E, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (Quartus Prime comes next).');
  assert.equal((await P.readProject('n1')).constraints, 'constraints/top.qsf');
  const bad = await call('set_design_properties', { project: 'n1', part: 'ep4ce22', package: 'f17', speed: 'c8' });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /speed grade 'c8' not available for ep4ce22-f17 \(valid: c6\)/);
});

test('new_source, constraints_wizard and check_constraints on the DE1-SoC: QSF files, the QSF Wizard, its checks', async () => {
  await ok('new_project', { name: 's1', board: 'de1-soc' });
  await ok('write_file', { project: 's1', path: 'src/top.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0));\nend top;\narchitecture rtl of top is\nbegin\n  led <= sw;\nend rtl;\n' });
  await ok('add_to_project', { project: 's1', path: 'src/top.vhd' });
  await ok('set_top', { project: 's1', top: 'top' });
  const dir = P.projectDir('s1');
  const s = await ok('new_source', { project: 's1', type: 'constraints', name: 'extra' });
  assert.equal(s.text, 'Created Implementation Constraints File \'constraints/extra.qsf\'.');
  assert.match(fs.readFileSync(path.join(dir, 'constraints/extra.qsf'), 'utf8'), /^# Quartus Prime pin assignments \(QSF\) for s1\n# Target: 5CSEMA5F31C6\n/);
  const w = await ok('constraints_wizard', { project: 's1', module: 'top', name: 'c2', pins: { clk: 'PIN_AF14', 'sw<0>': 'PIN_AB12', 'sw<1>': 'PIN_AC12', 'led<0>': 'PIN_V16', 'led<1>': 'PIN_W16' } });
  assert.match(w.text, /^QSF Wizard: created constraints\/c2\.qsf for top: /);
  const c2 = fs.readFileSync(path.join(dir, 'constraints/c2.qsf'), 'utf8');
  assert.match(c2, /^# QSF generated by the Silinx QSF Wizard for 'top' \(5CSEMA5F31C6, Terasic DE1-SoC\)\n\nset_location_assignment PIN_AF14 -to clk\nset_instance_assignment -name IO_STANDARD "3\.3-V LVTTL" -to clk\n/);
  await fails('constraints_wizard', { project: 's1', module: 'top', name: 'c3', attributes: { 'led<0>': { pull: 'up' } }, pins: { 'led<0>': 'PIN_V16' } }, 'attributes: a QSF\'s are I/O Pin Planning\'s (write_file), not the wizard\'s');
  // Check Constraints: clean, then the errors and warnings of a QSF (a pin twice, a pin of no ball, another bank's voltage, a name no port)
  const clean = await ok('check_constraints', { project: 's1', file: 'constraints/c2.qsf' });
  assert.equal(clean.text, 'Started : "Check Constraints" of constraints/c2.qsf.\nProcess "Check Constraints" completed successfully');
  await ok('write_file', { project: 's1', path: 'constraints/bad.qsf', text: [
    'set_location_assignment PIN_AF14 -to clk', 'set_location_assignment PIN_AF14 -to sw[0]', 'set_instance_assignment -name IO_STANDARD "2.5 V" -to sw[0]',
    'set_location_assignment PIN_A1 -to sw[1]', 'set_instance_assignment -name IO_STANDARD "3.3-V FOO" -to led[0]', 'set_location_assignment PIN_V16 -to nope', ''].join('\n') });
  const bad = await call('check_constraints', { project: 's1', file: 'constraints/bad.qsf' });
  assert.deepEqual(bad.data.errors.map(e => [e.line, e.message]), [
    [2, 'set_location_assignment sw[0]: the pin PIN_AF14 is given to clk too (line 1)'],
    [3, 'IO_STANDARD "2.5 V" of sw[0]: the pin PIN_AF14 (clk) is in a bank at 3.3 V on the Terasic DE1-SoC (3.3-V LVTTL), not 2.5 V'],
  ]);
  assert.deepEqual(bad.data.warnings.map(e => [e.line, e.message]), [
    [4, 'set_location_assignment sw[1]: the pin PIN_A1 is on no resource of the Terasic DE1-SoC'],
    [5, 'IO_STANDARD "3.3-V FOO" of led[0]: not an I/O standard Silinx knows of the Cyclone V ("3.3-V LVTTL", "3.3-V LVCMOS", "3.0-V LVTTL", "3.0-V LVCMOS"…)'],
    [6, 'set_location_assignment nope: the top has no such port'],
    [6, '2 port bit(s) of \'top\' have no pin (set_location_assignment): led[0], led[1]'],
  ]);
  // the QSF's syntax error: Quartus's line
  await ok('write_file', { project: 's1', path: 'constraints/syn.qsf', text: 'set_location_assignment V16 -to led[0]\n' });
  const syn = await call('check_constraints', { project: 's1', file: 'constraints/syn.qsf' });
  assert.deepEqual(syn.data.errors.map(e => [e.line, e.message]), [[1, 'set_location_assignment V16: a pin is PIN_<ball> (PIN_A8, PIN_AA12)']]);
});

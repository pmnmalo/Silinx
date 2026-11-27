// Duplicate of a source or a file (#5862, core/duplicate-source.js), the interface's Duplicate… and the MCP's rename_file
// copy, on the examples: a drawing copied as a drawing (its module renamed, its HDL made for it, VHDL and Verilog, compiled
// and simulated by a copy of the test bench pointed at it), an HDL file's modules renamed, a test bench's copy still
// testing its unit, a plain file copied, the copy in the project with the original's role and never the top; the names
// (name_copy, name_copy2…, or the one given) and every refusal, nothing written then.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-duplicate-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const D = await import('../core/duplicate-source.js');
const { renameModuleInSource } = await import('../core/rename.js');
const { setSourceLanguage } = await import('../core/drawing-sync.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const read = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');
const has = (name, f) => fs.existsSync(path.join(P.projectDir(name), f));
const snapshot = async name => JSON.stringify([await P.readProject(name), await P.fileTree(name)]);

test('copySuffix: _copy, _copy2, _copy3', () => {
  assert.deepEqual([1, 2, 3].map(D.copySuffix), ['_copy', '_copy2', '_copy3']);
});

test('a drawing (an ASM chart) duplicated from its HDL file\'s row: the drawing copied, its module renamed, its HDL made for it; the next copy _copy2', async () => {
  await P.createProject({ name: 'b', template: 'blinky' });
  const before = await P.readProject('b');
  const r = await D.duplicateSource(P, 'b', 'src/speed_ctrl.vhd');
  assert.equal(r.message, 'Duplicate: src/speed_ctrl.asm.json → src/speed_ctrl_copy.asm.json; module \'speed_ctrl\' copied as \'speed_ctrl_copy\' (src/speed_ctrl_copy.vhd with it).');
  assert.deepEqual(r.hdl, ['src/speed_ctrl_copy.vhd updated from src/speed_ctrl_copy.asm.json']);
  assert.deepEqual([r.from, r.to, r.files, r.modules], ['src/speed_ctrl.asm.json', 'src/speed_ctrl_copy.asm.json', ['src/speed_ctrl_copy.vhd', 'src/speed_ctrl_copy.asm.json'], [['speed_ctrl', 'speed_ctrl_copy']]]);
  const d = JSON.parse(read('b', 'src/speed_ctrl_copy.asm.json'));
  assert.deepEqual([d.name, d.generatedFile], ['speed_ctrl_copy', 'src/speed_ctrl_copy.vhd']);
  assert.match(read('b', 'src/speed_ctrl_copy.vhd'), /^entity speed_ctrl_copy is$/m);
  assert.doesNotMatch(read('b', 'src/speed_ctrl_copy.vhd'), /\bspeed_ctrl\b/);
  // in the project, as the original, not the top; the original untouched
  const pj = await P.readProject('b');
  assert.deepEqual(pj.files.find(f => f.path === 'src/speed_ctrl_copy.vhd'), { ...before.files.find(f => f.path === 'src/speed_ctrl.vhd'), path: 'src/speed_ctrl_copy.vhd' });
  assert.deepEqual([pj.top, pj.simTop], [before.top, before.simTop]);
  assert.match(read('b', 'src/speed_ctrl.vhd'), /^entity speed_ctrl is$/m);
  // from the drawing's row: the next free name
  assert.equal((await D.duplicateSource(P, 'b', 'src/speed_ctrl.asm.json')).to, 'src/speed_ctrl_copy2.asm.json');
});

test('an HDL file: every module it declares renamed; a test bench\'s copy still tests its unit, a simulation source; a constraints file copied as it is', async () => {
  const before = await P.readProject('b');
  const v = await D.duplicateSource(P, 'b', 'src/counter.v');
  assert.equal(v.message, 'Duplicate: src/counter.v → src/counter_copy.v; module \'prescaler\' copied as \'prescaler_copy\'.');
  assert.match(read('b', 'src/counter_copy.v'), /^module prescaler_copy\b/m);
  const tb = await D.duplicateSource(P, 'b', 'sim/tb_top.vhd');
  assert.equal(tb.message, 'Duplicate: sim/tb_top.vhd → sim/tb_top_copy.vhd; module \'tb_top\' copied as \'tb_top_copy\'.');
  assert.match(read('b', 'sim/tb_top_copy.vhd'), /^ENTITY tb_top_copy IS$/m);
  assert.match(read('b', 'sim/tb_top_copy.vhd'), /uut: entity work\.top\b/);
  const pj = await P.readProject('b');
  assert.equal(pj.files.find(f => f.path === 'sim/tb_top_copy.vhd').role, 'sim');
  assert.equal(pj.simTop, before.simTop);
  const ucf = await D.duplicateSource(P, 'b', 'constraints/top.ucf');
  assert.equal(ucf.message, 'Duplicate: constraints/top.ucf → constraints/top_copy.ucf.');
  assert.equal(read('b', 'constraints/top_copy.ucf'), read('b', 'constraints/top.ucf'));
  const after = await P.readProject('b');
  assert.equal(after.constraints, 'constraints/top.ucf');
  assert.ok(!(after.excluded || []).includes('constraints/top_copy.ucf'));
});

test('the name given: a module\'s (its file named after it), a file\'s path; dry: the names, nothing written', async () => {
  const s = await snapshot('b');
  const dry = await D.duplicateSource(P, 'b', 'src/knight.vhd', { dry: true });
  assert.deepEqual([dry.to, dry.modules, dry.files], ['src/knight_copy.vhd', [['knight', 'knight_copy']], []]);
  assert.equal(await snapshot('b'), s);
  assert.equal((await D.duplicateSource(P, 'b', 'src/knight.vhd', { module: 'rider' })).message, 'Duplicate: src/knight.vhd → src/rider.vhd; module \'knight\' copied as \'rider\'.');
  assert.match(read('b', 'src/rider.vhd'), /^entity rider is$/m);
  assert.equal((await D.duplicateSource(P, 'b', 'constraints/top.ucf', { to: 'constraints/lab.ucf' })).message, 'Duplicate: constraints/top.ucf → constraints/lab.ucf.');
});

test('refusals: a name taken, an invalid or reserved name, a path taken, build/, not text, a package, another kind; nothing written', async () => {
  await P.writeFile('b', 'src/pkg.vhd', 'package util is\n  constant N : integer := 4;\nend package;\n');
  await P.writeFile('b', 'doc/board.png', 'x');
  const s = await snapshot('b');
  const refused = async (args, message) => assert.rejects(D.duplicateSource(P, 'b', ...args), { duplicate: true, message });
  await refused(['src/knight.vhd', { module: 'top' }], 'A module named \'top\' already exists.');
  await refused(['src/knight.vhd', { module: 'Top' }], 'A module named \'Top\' already exists.');
  await refused(['src/knight.vhd', { module: '2x' }], 'The module name must start with a letter and contain only letters, digits and _.');
  await refused(['src/knight.vhd', { module: 'entity' }], '\'entity\' is a reserved word of VHDL: choose another name.');
  await refused(['src/knight.vhd', { to: 'src/top.vhd', module: 'k2' }], 'src/top.vhd already exists.');
  await refused(['constraints/top.ucf', { to: 'constraints/top_copy.ucf' }], 'constraints/top_copy.ucf already exists.');
  await refused(['constraints/top.ucf', { to: 'constraints/top.xdc' }], 'The copy keeps the file\'s kind: its name ends in .ucf.');
  await refused(['constraints/top.ucf', { to: '../x.ucf' }], 'Enter a file path inside the project.');
  await refused(['build/top.bit'], 'build/top.bit is written by Silinx itself: it is not duplicated.');
  await refused(['doc/board.png'], 'doc/board.png is not a text file: it is not duplicated.');
  await refused(['src/pkg.vhd'], 'src/pkg.vhd declares the package \'util\': a copy would declare it twice.');
  await refused(['constraints/top.ucf', { module: 'x' }], 'constraints/top.ucf declares no module: only its file\'s name is chosen.');
  await refused(['src/none.vhd'], 'no file \'src/none.vhd\' in the project');
  assert.equal(await snapshot('b'), s);
});

// the drawings' copies compile and simulate, VHDL and Verilog: the test bench's copy pointed at the copy (its unit kept by
// Duplicate, renamed here), "Simulation finished OK" with no warning
async function simulates(name, tb) {
  const r = await ok('simulate', { project: name, top: tb, time_ns: 100000 });
  assert.match(r.text, /Simulation finished OK/, r.text);
  assert.doesNotMatch(r.text, /WARNING|ERROR/, r.text);
}

test('a schematic\'s copy (gates) simulates by its test bench\'s copy, in VHDL and in Verilog', async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  const r = await ok('rename_file', { project: 'g', from: 'src/gates.sch.json', copy: true });
  assert.equal(r.text, 'Duplicate: src/gates.sch.json → src/gates_copy.sch.json; module \'gates\' copied as \'gates_copy\' (src/gates_copy.vhd with it).\nsrc/gates_copy.vhd updated from src/gates_copy.sch.json');
  assert.deepEqual(r.data, { project: 'g', from: 'src/gates.sch.json', to: 'src/gates_copy.sch.json', copy: true, files: ['src/gates_copy.vhd', 'src/gates_copy.sch.json'], modules: [{ from: 'gates', to: 'gates_copy' }] });
  const tb = await ok('rename_file', { project: 'g', from: 'sim/tb_gates.vhd', to: 'sim/tb_copy.vhd', copy: true });
  assert.equal(tb.text, 'Duplicate: sim/tb_gates.vhd → sim/tb_copy.vhd; module \'tb_gates\' copied as \'tb_copy\'.');
  assert.match(read('g', 'sim/tb_copy.vhd'), /entity work\.gates\b/);
  await P.writeFile('g', 'sim/tb_copy.vhd', renameModuleInSource(read('g', 'sim/tb_copy.vhd'), 'vhdl', 'gates', 'gates_copy'));
  assert.equal((await ok('check_syntax', { project: 'g', top: 'gates_copy' })).text, 'Process "Check Syntax" of <gates_copy> completed successfully (22 signals, 21 processes).');
  await simulates('g', 'tb_copy');
  const v = await setSourceLanguage(P, 'g', 'src/gates_copy.sch.json', 'verilog');
  assert.equal(v.language, 'verilog');
  assert.ok(has('g', 'src/gates_copy.v') && !has('g', 'src/gates_copy.vhd'));
  assert.match(read('g', 'src/gates_copy.v'), /^module gates_copy\b/m);
  await simulates('g', 'tb_copy');
  // the original still the top, its test bench the project's
  assert.deepEqual([(await P.readProject('g')).top, (await P.readProject('g')).simTop], ['gates', 'tb_gates']);
});

test('a state diagram\'s and a truth table\'s copies (traffic) simulate in a copy of the top, in VHDL and in Verilog', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  await ok('rename_file', { project: 't', from: 'src/traffic.fsm.json', copy: true });
  await ok('rename_file', { project: 't', from: 'src/lamps.vhd', copy: true });
  assert.ok(has('t', 'src/lamps_copy.bool.json') && has('t', 'src/traffic_copy.fsm.json'));
  await ok('rename_file', { project: 't', from: 'src/top.vhd', copy: true });
  await ok('rename_file', { project: 't', from: 'sim/tb_traffic.vhd', copy: true });
  let top = read('t', 'src/top_copy.vhd');
  for (const [a, b] of [['traffic', 'traffic_copy'], ['lamps', 'lamps_copy']]) top = renameModuleInSource(top, 'vhdl', a, b);
  await P.writeFile('t', 'src/top_copy.vhd', top);
  await P.writeFile('t', 'sim/tb_traffic_copy.vhd', renameModuleInSource(read('t', 'sim/tb_traffic_copy.vhd'), 'vhdl', 'top', 'top_copy'));
  await simulates('t', 'tb_traffic_copy');
  for (const f of ['src/traffic_copy.fsm.json', 'src/lamps_copy.bool.json']) assert.equal((await setSourceLanguage(P, 't', f, 'verilog')).language, 'verilog');
  assert.ok(has('t', 'src/traffic_copy.v') && has('t', 'src/lamps_copy.v'));
  await simulates('t', 'tb_traffic_copy');
});

test('the copies of the other drawings (lock: a Petri net, a circuit, a truth table) made, their HDL for their new names', async () => {
  await ok('new_project_from_example', { name: 'l', example: 'lock' });
  for (const [f, m, hdl] of [['src/alarm.pn.json', 'alarm', 'src/alarm_copy.vhd'], ['src/sync.circ.json', 'sync', 'src/sync_copy.vhd'], ['src/timer.asm.json', 'timer', 'src/timer_copy.vhd'], ['src/digit_ok.bool.json', 'digit_ok', 'src/digit_ok_copy.vhd'], ['src/control.sch.json', 'control', 'src/control_copy.vhd'], ['src/lock.fsm.json', 'lock', 'src/lock_copy.vhd']]) {
    const r = await ok('rename_file', { project: 'l', from: f, copy: true });
    assert.deepEqual(r.data.modules, [{ from: m, to: `${m}_copy` }], f);
    assert.equal(JSON.parse(read('l', f.replace(m, `${m}_copy`))).generatedFile, hdl);
    assert.match(read('l', hdl), new RegExp(`^entity ${m}_copy is$`, 'mi'), hdl);
  }
  for (const m of ['alarm', 'sync', 'timer', 'digit_ok', 'control', 'lock']) assert.match((await ok('check_syntax', { project: 'l', top: `${m}_copy` })).text, new RegExp(`^Process "Check Syntax" of <${m}_copy> completed successfully \\(\\d+ signals, \\d+ process(?:es)?\\)\\.$`));
});

test('rename_file: to needed without copy; a copy\'s refusals said', async () => {
  await fails('rename_file', { project: 'g', from: 'src/gates.sch.json' }, 'to: the new path in the project');
  await fails('rename_file', { project: 'g', from: 'src/gates.sch.json', to: 'src/gates_copy.sch.json', copy: true }, 'A module named \'gates_copy\' already exists.');
  await fails('rename_file', { project: 'g', from: 'src/nothing.vhd', copy: true }, 'no file \'src/nothing.vhd\' in the project');
});

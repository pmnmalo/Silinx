// A project's list of files as Add to Project, Remove from Project and a file written change it, the file kinds by name,
// and the tops a removal leaves missing (#4733: core/project-entries.js, core/file-kinds.js; one implementation for the
// interface, the MCP server, the stores and the live share).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hdlLangOf, langOfPath, isConstraintsFile, roleOfPath, HDL_RE, C_RE } from '../core/file-kinds.js';
import { fileEntry, addToProject, addsToProject, removeFromProject, registerWritten, declares, missingTops, topRefusal } from '../core/project-entries.js';
import { editablePath } from '../core/collab-doc.js';

const FORMATS = ['ucf', 'pcf', 'lpf', 'cst', 'ccf', 'xdc'];

test('file kinds: languages, constraints of every format, test benches\' roles, C', () => {
  assert.deepEqual(['a.vhd', 'a.VHDL', 'a.v', 'a.vh', 'a.sv', 'a.ucf', 'a.c', 'a', 'a.vhd.bak'].map(hdlLangOf), ['vhdl', 'vhdl', 'verilog', 'verilog', 'verilog', null, null, null, null]);
  assert.deepEqual(['a.vhd', 'a.sv', ...FORMATS.map(f => `p.${f}`), 'notes.txt', 'x.sch.json'].map(langOfPath), ['vhdl', 'verilog', 'ucf', 'ucf', 'ucf', 'ucf', 'ucf', 'ucf', 'text', 'text']);
  assert.deepEqual([...FORMATS.map(f => `p.${f.toUpperCase()}`), 'p.ucf.txt', 'pcf'].map(isConstraintsFile), [true, true, true, true, true, true, false, false]);
  assert.deepEqual(['sim/x.vhd', 'tb/x.v', 'test/x.v', 'src/tb_x.vhd', 'src/x_tb.v', 'src/x_tb', 'src/x.vhd', 'src/tbx.vhd', 'mysim/x.vhd'].map(roleOfPath),
    ['sim', 'sim', 'sim', 'sim', 'sim', 'sim', 'design', 'design', 'design']);
  assert.deepEqual([HDL_RE.test('a.vh'), C_RE.test('a.cpp'), C_RE.test('a.hpp'), C_RE.test('a.cs')], [true, true, true, false]);
});

test('Add to Project: an HDL source listed with its role, a constraints file of every format the constraints when none; idempotent', () => {
  assert.deepEqual(fileEntry('sim/tb_a.vhd'), { path: 'sim/tb_a.vhd', lang: 'vhdl', role: 'sim' });
  assert.equal(fileEntry('a.pcf'), null);
  const pj = { files: [], excluded: ['src/a.v', 'pins.ucf'] };
  addToProject(pj, 'src/a.v');
  assert.deepEqual(pj, { files: [{ path: 'src/a.v', lang: 'verilog', role: 'design' }], excluded: ['pins.ucf'] });
  assert.equal(addsToProject(pj, 'src/a.v'), false);
  addToProject(pj, 'src/a.v');
  assert.equal(pj.files.length, 1);
  for (const f of FORMATS) {
    const p = { files: [] };
    assert.equal(addsToProject(p, `pins.${f}`), true, f);
    addToProject(p, `pins.${f}`);
    assert.deepEqual([p.constraints, p.files, p.excluded], [`pins.${f}`, [], []], f);
    assert.equal(addsToProject(p, `pins.${f}`), false, f);
    // (a project's constraints file already: kept)
    addToProject(p, 'other.xdc');
    assert.equal(p.constraints, `pins.${f}`, f);
  }
  // (a note or a drawing: only no longer excluded)
  const q = addToProject({ files: [], excluded: ['n.txt'] }, 'n.txt');
  assert.deepEqual(q, { files: [], excluded: [] });
});

test('Remove from Project: an HDL source leaves the list, another file is excluded, the constraints file leaves none', () => {
  const pj = { files: [{ path: 'a.vhd', lang: 'vhdl', role: 'design' }, { path: 'b.vhd', lang: 'vhdl', role: 'design' }], constraints: 'pins.lpf', excluded: [] };
  removeFromProject(pj, ['a.sch.json', 'a.vhd', null]);
  assert.deepEqual(pj, { files: [{ path: 'b.vhd', lang: 'vhdl', role: 'design' }], constraints: 'pins.lpf', excluded: ['a.sch.json'] });
  removeFromProject(pj, ['pins.lpf', 'a.sch.json']);
  assert.deepEqual([pj.constraints, pj.excluded], ['', ['a.sch.json', 'pins.lpf']]);
  // (and back: Add to Project undoes it)
  addToProject(pj, 'pins.lpf'); addToProject(pj, 'a.vhd');
  assert.deepEqual([pj.constraints, pj.excluded, pj.files.map(f => f.path)], ['pins.lpf', ['a.sch.json'], ['b.vhd', 'a.vhd']]);
});

test('a file written: back in the project if excluded, an HDL source listed (not build/\'s); false when nothing changes', () => {
  const pj = { files: [], excluded: ['src/x.vh', 'build/n.v'] };
  assert.equal(registerWritten(pj, 'src/x.vh'), true);
  assert.deepEqual([pj.files, pj.excluded], [[{ path: 'src/x.vh', lang: 'verilog', role: 'design' }], ['build/n.v']]);
  assert.equal(registerWritten(pj, 'src/x.vh'), false);
  assert.equal(registerWritten(pj, 'build/n.v'), true);
  assert.deepEqual([pj.files.length, pj.excluded], [1, []]);
  assert.equal(registerWritten(pj, 'build/m.v'), false);
  assert.equal(registerWritten(pj, 'pins.pcf'), false);
  assert.equal(registerWritten(pj, 'src/x_tb'), false);   // (no extension: not HDL)
  assert.equal(registerWritten({ files: [] }, 'sim/t.sv'), true);
});

test('declares: an entity or a module by its name, case-insensitive, not in a comment', () => {
  assert.equal(declares('entity Top is end;', 'top'), true);
  assert.equal(declares('module top(input a);', 'top'), true);
  assert.equal(declares('module top2(input a);', 'top'), false);
  assert.equal(declares('-- entity top is\nentity other is end;', 'top'), false);
  assert.equal(declares('// module top\n/* module top */ module x;', 'top'), false);
  assert.equal(declares('', 'top'), false);
  assert.equal(declares('entity x is end;', ''), false);
});

test('missingTops: kept while the project has it; else the one root left, none with a warning, or none at all', () => {
  const roots = { false: ['b'], true: [] };
  const r = missingTops({ top: 'a', simTop: 'tb' }, { has: (m, sim) => sim, roots: sim => roots[sim] });
  assert.deepEqual(r, { set: { top: 'b' }, messages: [{ level: 'info', text: 'The top-level module \'a\' is no longer in the project: the top is now \'b\' (another one: Set as Top Module).' }] });
  const w = missingTops({ top: 'a', simTop: 'tb' }, { has: () => false, roots: sim => (sim ? [] : ['b', 'c']) }, { another: 'set_top', set: 'set_top' });
  assert.deepEqual(w, { set: { top: '', simTop: '' }, messages: [{ level: 'warn', text: 'The top-level module \'a\' is no longer in the project: set the top module (set_top).' },
    { level: 'info', text: 'The top-level simulation module \'tb\' is no longer in the project, nor any other module.' }] });
  assert.deepEqual(missingTops({ top: '' }, { has: () => false, roots: () => ['x'] }), { set: {}, messages: [] });
});

test('the live share: an editor may edit every family\'s constraints file', () => {
  for (const f of FORMATS) assert.equal(editablePath(`src/pins.${f}`), true, f);
  assert.equal(editablePath('src/a.sch.json'), false);
});

test('topRefusal: a module of the view is set, even with errors; another name refused, the view named', () => {
  assert.equal(topRefusal('a', false, () => true), null);
  assert.equal(topRefusal('nothere', false, () => false), 'no entity or module \'nothere\' in the project\'s design sources');
  assert.equal(topRefusal('tb', true, () => false), 'no entity or module \'tb\' in the project\'s simulation sources');
});

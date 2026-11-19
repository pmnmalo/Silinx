// The files the implementation and the Board Emulator read beside the HDL (#4591, core/flow-files.js): the project's
// constraints (any family's format), then the memory images in natural order; none in build/, none that is not in the
// project folder, none in a design and simulation project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSTRAINTS_FILE, MEMORY_FILE, flowFiles } from '../core/flow-files.js';

const pj = (constraints, extra = {}) => ({ name: 'p', top: 'top', constraints, files: [], ...extra });

test('#4591 flowFiles: the constraints of every family\'s format, first', () => {
  for (const ext of ['ucf', 'pcf', 'lpf', 'cst', 'ccf', 'xdc']) {
    const c = `constraints/top.${ext}`;
    assert.deepEqual(flowFiles(pj(c), ['src/top.v', c, 'sim/tb.v']), [{ path: c, kind: 'constraints' }], ext);
    assert.ok(CONSTRAINTS_FILE.test(c), ext);
  }
});

test('#4591 flowFiles: the memory images after the constraints, in natural order; not build/\'s, not other data', () => {
  const tree = ['src/rom_10.mem', 'constraints/top.ucf', 'src/rom_2.mem', 'src/init.coe', 'data/font.HEX', 'build/x.mem', 'notes.txt', 'src/top.vhd', 'data.dat'];
  assert.deepEqual(flowFiles(pj('constraints/top.ucf'), tree), [
    { path: 'constraints/top.ucf', kind: 'constraints' },
    { path: 'data/font.HEX', kind: 'memory' },
    { path: 'src/init.coe', kind: 'memory' },
    { path: 'src/rom_2.mem', kind: 'memory' },
    { path: 'src/rom_10.mem', kind: 'memory' },
  ]);
  assert.ok(MEMORY_FILE.test('a.mem') && MEMORY_FILE.test('a.hex') && MEMORY_FILE.test('a.coe') && !MEMORY_FILE.test('a.txt'));
});

test('#4591 flowFiles: only the project\'s own constraints file, and only when it exists', () => {
  // another constraints file of the folder is not the project's: the flow does not read it
  assert.deepEqual(flowFiles(pj('constraints/top.ucf'), ['constraints/top.ucf', 'constraints/old.ucf']), [{ path: 'constraints/top.ucf', kind: 'constraints' }]);
  // a new project's path, its file not written yet
  assert.deepEqual(flowFiles(pj('constraints/top.ucf'), ['src/top.v']), []);
  assert.deepEqual(flowFiles(pj(null), ['constraints/top.ucf']), []);
  assert.deepEqual(flowFiles(pj(''), []), []);
});

test('#4591 flowFiles: none in a design and simulation project, none without a project', () => {
  assert.deepEqual(flowFiles(pj(null, { kind: 'design' }), ['src/a.mem', 'constraints/top.ucf']), []);
  assert.deepEqual(flowFiles(null, ['constraints/top.ucf']), []);
  assert.deepEqual(flowFiles(undefined), []);
  // (the file tree left out: none)
  assert.deepEqual(flowFiles(pj('constraints/top.ucf')), []);
});

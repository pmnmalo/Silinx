// A project's mode (#5754, roadmap #5753: core/project-mode.js): the three modes over the profiles; every project of before
// read in its mode with no change (no kind, kind design, kind system, a written profile); the examples' modes; a new
// project's profile per mode, a finer one of the mode accepted, any other refused; System off in a release.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, modeById, modeOf, modeOn, profileMode, newProjectProfile } from '../core/project-mode.js';
import { PROFILES, profileOf, withProfile } from '../core/project-profile.js';
import { SYSTEM_EXAMPLES, createRefusal } from '../core/project-kind.js';
import { processorBoardOf } from '../core/processor-board.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';

setBuildChannel('dev');
after(() => setBuildChannel('dev'));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('#5754 the modes: Circuit, Board, System, covering every profile once, narrowest first; each a kind New Project makes', () => {
  assert.deepEqual(MODES.map(m => [m.id, m.label, m.profiles, m.profile, m.kind]), [
    ['circuit', 'Circuit', ['logic'], 'logic', 'design'],
    ['board', 'Board', ['fpga'], 'fpga', 'fpga'],
    ['system', 'System', ['embedded', 'system'], 'system', 'system'],
  ]);
  assert.deepEqual(MODES.flatMap(m => m.profiles), PROFILES.map(p => p.id));
  for (const m of MODES) assert.ok(m.profiles.includes(m.profile), m.id);
  // (each mode's kind is one New Project and the stores accept: core/project-kind.js createRefusal)
  for (const m of MODES) assert.equal(createRefusal(m.kind), null, m.id);
  // (Circuit's card says nothing of FPGA or HDL, #5133)
  assert.doesNotMatch(modeById('circuit').about, /FPGA|HDL/);
  assert.equal(modeById('none'), null);
});

test('#5754 a project of before read in its mode, its silinx.json untouched', () => {
  const cases = [
    [{ name: 'a' }, 'board'],                                       // an FPGA project: no kind
    [{ name: 'a', board: 'basys2' }, 'board'],
    [{ name: 'a', kind: 'design', board: null }, 'circuit'],         // a design and simulation project (#3891)
    [{ name: 'a', kind: 'system' }, 'system'],                       // a System project of before #5440
    [{ name: 'a', profile: 'system' }, 'system'],
    [{ name: 'a', profile: 'embedded' }, 'system'],                  // Embedded / SoC: a System's profile
    [{ name: 'a', profile: 'fpga' }, 'board'],
    [{ name: 'a', profile: 'nonsense' }, 'board'],                   // (an unknown profile: its kind's, as profileOf)
    [null, 'board'],
  ];
  for (const [pj, mode] of cases) {
    const before = JSON.stringify(pj);
    assert.equal(modeOf(pj), mode, before);
    assert.equal(JSON.stringify(pj), before, 'not changed');
  }
  // (each profile written as #5440 writes it: its mode's)
  for (const p of PROFILES) assert.equal(modeOf(withProfile({ name: 'a' }, p.id)), profileMode(p.id), p.id);
  assert.deepEqual(PROFILES.map(p => profileMode(p.id)), ['circuit', 'board', 'system', 'system']);
});

test('#5754 the examples and the test designs: a System example in System mode, every other one Board', () => {
  for (const dir of ['examples', 'test-designs']) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const n of fs.readdirSync(base)) {
      const f = path.join(base, n, 'silinx.json');
      if (!fs.existsSync(f)) continue;
      const pj = JSON.parse(fs.readFileSync(f, 'utf8'));
      // (a processor board's example, #5874: a Board project of that board)
      const want = processorBoardOf(pj) ? 'board' : SYSTEM_EXAMPLES.includes(n) || profileOf(pj) === 'system' || profileOf(pj) === 'embedded' ? 'system' : profileOf(pj) === 'logic' ? 'circuit' : 'board';
      assert.equal(modeOf(pj), want, `${dir}/${n}`);
    }
  }
  assert.equal(modeOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'gates', 'silinx.json'), 'utf8'))), 'board');
  for (const n of SYSTEM_EXAMPLES) assert.equal(modeOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', n, 'silinx.json'), 'utf8'))), 'system', n);
});

test('#5754 a new project\'s profile: the mode\'s, or a finer one of it; another mode\'s refused, named', () => {
  assert.deepEqual(MODES.map(m => newProjectProfile(m.id)), [{ profile: 'logic' }, { profile: 'fpga' }, { profile: 'system' }]);
  assert.deepEqual(newProjectProfile('system', 'embedded'), { profile: 'embedded' });
  assert.deepEqual(newProjectProfile('board', 'fpga'), { profile: 'fpga' });
  assert.deepEqual(newProjectProfile('circuit', 'fpga'), { error: 'profile fpga (FPGA) is not of the mode circuit (Circuit: logic)' });
  assert.deepEqual(newProjectProfile('board', 'embedded'), { error: 'profile embedded (Embedded / SoC) is not of the mode board (Board: fpga)' });
  assert.deepEqual(newProjectProfile('system', 'logic'), { error: 'profile logic (Digital Logic) is not of the mode system (System: embedded, system)' });
  assert.deepEqual(newProjectProfile('board', 'x'), { error: 'profile x is not of the mode board (Board: fpga)' });
  assert.deepEqual(newProjectProfile('fpga'), { error: 'no mode \'fpga\' (the modes: circuit, board, system)' });
});

test('#5754 #5202 System off in a release: its mode not offered, a new System project refused with the release\'s message', () => {
  assert.deepEqual(MODES.map(m => modeOn(m.id)), [true, true, true]);
  setBuildChannel('release');
  try {
    assert.deepEqual(MODES.map(m => modeOn(m.id)), [true, true, false]);
    assert.deepEqual(newProjectProfile('system'), { error: SYSTEMS_OFF });
    assert.deepEqual(newProjectProfile('board'), { profile: 'fpga' });
    // (a System project of before still read in its mode)
    assert.equal(modeOf({ name: 'a', profile: 'system' }), 'system');
  } finally { setBuildChannel('dev'); }
  assert.equal(modeOn('none'), false);
});

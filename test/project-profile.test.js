// A project's profile (#5440, roadmap #5416's phase 4: core/project-profile.js, core/profile-change.js): the profiles and
// the node kinds each allows; a project's profile read from silinx.json (a description of before: its kind); written as
// its profile whichever it is, never a kind (#5907); every widening (nothing converted) and every narrowing (refused while a node of the
// project's System would not be allowed, named; a System as the top first replaced by a module; a design project's own
// rule kept); the Systems' profiles off in a release.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, profileOf, withProfile, profileRefusal, offeredProfiles, profileOn, narrows, nodeKindRefusal, profileChangedText, systemRuleProfile } from '../core/project-profile.js';
import { changeProfile } from '../core/profile-change.js';
import { isDesignOnly, isSystemProject } from '../core/project-kind.js';
import { setBuildChannel, SYSTEMS_OFF } from '../core/build-channel.js';
import { newSystem, writeSystem } from '../core/system-doc.js';
import { newProjectJson, projectJsonText } from '../core/project-defaults.js';

setBuildChannel('dev');
after(() => setBuildChannel('dev'));
const IDS = ['logic', 'fpga', 'embedded', 'system'];
const FPGA = { name: 'p', board: 'basys2', device: { part: 'xc3s250e' }, top: 'blink', constraints: 'constraints/top.ucf', files: [{ path: 'src/blink.vhd', role: 'design' }] };
const LOGIC = { name: 'd', kind: 'design', board: null, constraints: null, top: 'adder', files: [{ path: 'src/adder.sch.json', role: 'design' }] };
// a System project, its System document with nodes of the kinds given
const sysProject = (profile, kinds) => {
  const sys = { ...newSystem('s'), nodes: kinds.map((k, i) => ({ id: `${k}${i}`, kind: k, ...(k === 'fpga' ? { module: 'top', board: 'basys2' } : {}), interfaces: [] })) };
  return [{ name: 's', profile, board: null, top: '', files: [] }, { files: ['s.sys.json'], texts: { 's.sys.json': writeSystem(sys) } }];
};

test('#5440 the profiles: each the node kinds it allows, each containing the one before', () => {
  assert.deepEqual(PROFILES.map(p => [p.id, p.label]), [['logic', 'Digital Logic'], ['fpga', 'FPGA'], ['embedded', 'Embedded / SoC'], ['system', 'System']]);
  for (let i = 1; i < PROFILES.length; i++) assert.ok(PROFILES[i - 1].nodes.every(k => PROFILES[i].nodes.includes(k)), PROFILES[i].id);
  assert.deepEqual(PROFILES.map(p => p.nodes.length), [2, 3, 4, 6]);
  assert.deepEqual(IDS.flatMap(a => IDS.filter(b => narrows(a, b)).map(b => `${a}>${b}`)), ['fpga>logic', 'embedded>logic', 'embedded>fpga', 'system>logic', 'system>fpga', 'system>embedded']);
});

test('#5440 a project\'s profile read from today\'s silinx.json; written only when changed, an FPGA or design project\'s as before', () => {
  assert.deepEqual([profileOf({}), profileOf({ kind: 'design' }), profileOf({ kind: 'system' }), profileOf({ profile: 'embedded' }), profileOf({ kind: 'codesign' }), profileOf({ profile: 'x' }), profileOf(null)],
    ['fpga', 'logic', 'system', 'embedded', 'fpga', 'fpga', 'fpga']);
  assert.deepEqual([isDesignOnly({ kind: 'design' }), isSystemProject({ profile: 'embedded' }), isSystemProject({ kind: 'system' }), isSystemProject({ profile: 'fpga' })], [true, true, true, false]);
  // (written as kept, #5907: its profile whichever it is, never a kind; and back: the same bytes)
  assert.deepEqual([withProfile(FPGA, 'logic').profile, 'kind' in withProfile(LOGIC, 'logic'), withProfile(FPGA, 'embedded').profile, withProfile(LOGIC, 'fpga').profile], ['logic', false, 'embedded', 'fpga']);
  // (an FPGA project back from any profile; a design project kept a design project: its fields in their places)
  for (const to of IDS) assert.equal(projectJsonText('p', withProfile(withProfile(FPGA, to), 'fpga')), projectJsonText('p', FPGA), to);
  assert.equal(projectJsonText('d', withProfile(LOGIC, 'logic')), projectJsonText('d', LOGIC));
  // (a new project's: its profile, #5907; no kind)
  assert.deepEqual(['design', 'logic', 'embedded', 'system', undefined].map(k => newProjectJson('n', { kind: k })).map(j => [j.profile, 'kind' in j, j.version]),
    [['logic', false, 2], ['logic', false, 2], ['embedded', false, 2], ['system', false, 2], ['fpga', false, 2]]);
});

test('#5440 widening converts nothing: FPGA to Embedded / SoC or System; Digital Logic to FPGA with its board', () => {
  for (const to of ['embedded', 'system']) {
    const r = changeProfile(FPGA, to);
    assert.deepEqual(r.project, { ...FPGA, profile: to }, to);
  }
  assert.deepEqual(changeProfile({ ...FPGA, profile: 'embedded' }, 'system').project, { ...FPGA, profile: 'system' });
  const f = changeProfile(LOGIC, 'fpga', { fpga: { board: 'nexys2', device: { part: 'xc3s500e' } } }).project;
  assert.deepEqual([f.kind, f.profile, f.board, f.device.part, f.constraints, f.top], [undefined, 'fpga', 'nexys2', 'xc3s500e', 'constraints/top.ucf', 'adder']);
  const s = changeProfile(LOGIC, 'system').project;
  assert.deepEqual([s.kind, s.profile, s.top, s.files], [undefined, 'system', 'adder', LOGIC.files]);
  // (the same profile: the project as it is)
  assert.equal(changeProfile(FPGA, 'fpga').project, FPGA);
});

test('#5440 narrowing: refused while a node would not be allowed, the node named; a System as the top first a module\'s', () => {
  const [emb, ctx] = sysProject('system', ['fpga', 'mcu', 'terminal']);
  assert.equal(changeProfile(emb, 'embedded', ctx).error, 'the project \'s\' cannot be Embedded / SoC: its node terminal2 (terminal) is not allowed (Embedded / SoC allows design, circuit, fpga, mcu)');
  assert.equal(changeProfile(emb, 'fpga', ctx).error, 'the project \'s\' cannot be FPGA: its nodes mcu1 (mcu), terminal2 (terminal) are not allowed (FPGA allows design, circuit, fpga)');
  assert.equal(changeProfile(emb, 'logic', ctx).error, 'the project \'s\' cannot be Digital Logic: its nodes fpga0 (fpga), mcu1 (mcu), terminal2 (terminal) are not allowed (Digital Logic allows design, circuit)');
  // (its nodes all allowed: narrowed, nothing converted; to FPGA, its System its top: a module set as the top first)
  const [two, ctx2] = sysProject('system', ['fpga', 'mcu']);
  assert.deepEqual(changeProfile(two, 'embedded', ctx2).project, { ...two, profile: 'embedded' });
  const [one, ctx1] = sysProject('embedded', ['fpga']);
  assert.equal(changeProfile(one, 'fpga', ctx1).error, 'the project \'s\' cannot be FPGA: its top is its System (Set as Top Module on one of its modules first)');
  const m = changeProfile({ ...one, top: 'top' }, 'fpga', ctx1).project;
  assert.deepEqual([m.kind, m.profile, m.top], [undefined, 'fpga', 'top']);
  // (a module its top, the System document no longer its top: its nodes not those of the System it had)
  const [many, ctxm] = sysProject('system', ['fpga', 'mcu', 'terminal']);
  assert.equal(changeProfile({ ...many, top: 'top' }, 'fpga', ctxm).project.top, 'top');
});

test('#5440 narrowing to Digital Logic: a design project\'s rule kept (its own HDL or C refused), else its board left', () => {
  assert.equal(changeProfile(FPGA, 'logic').error, 'the project \'p\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/blink.vhd)');
  const d = changeProfile(FPGA, 'logic', { generated: ['src/blink.vhd'] }).project;
  assert.deepEqual([d.kind, d.profile, d.board, d.constraints, d.top], [undefined, 'logic', null, null, 'blink']);
  const s = changeProfile({ ...FPGA, profile: 'system' }, 'logic', { generated: ['src/blink.vhd'] }).project;
  assert.deepEqual([s.kind, s.profile, s.board], [undefined, 'logic', null]);
});

test('#5440 the profiles in a release: Digital Logic and FPGA only; the Systems\' refused with their message; no such profile', () => {
  assert.equal(profileRefusal('p', 'robot'), 'no profile \'robot\' (the profiles: logic, fpga, embedded, system)');
  assert.deepEqual(offeredProfiles().map(p => p.id), IDS);
  setBuildChannel('release');
  try {
    assert.deepEqual(offeredProfiles().map(p => p.id), ['logic', 'fpga']);
    assert.deepEqual(IDS.map(profileOn), [true, true, false, false]);
    for (const to of ['embedded', 'system']) assert.equal(changeProfile(FPGA, to).error, SYSTEMS_OFF);
    assert.equal(changeProfile(LOGIC, 'fpga', { fpga: { board: 'basys2' } }).error, undefined);
  } finally { setBuildChannel('dev'); }
});

test('#5910 the System profile allows the MQTT broker; a node kind a profile does not allow, refused with its message', () => {
  assert.deepEqual(PROFILES.at(-1).nodes, ['design', 'circuit', 'fpga', 'mcu', 'terminal', 'broker']);
  assert.equal(profileChangedText('s', 'system'), 's: System now: its System may have design, circuit, fpga, mcu, terminal, broker nodes (nothing converted, nothing deleted).');
  assert.deepEqual(['design', 'circuit', 'fpga', 'mcu', 'terminal', 'broker'].map(k => nodeKindRefusal('system', k)), [null, null, null, null, null, null]);
  assert.equal(nodeKindRefusal('embedded', 'terminal'), 'an Embedded / SoC project\'s System has no terminal node (Embedded / SoC allows design, circuit, fpga, mcu: Design Properties\' Project Kind changes it)');
  assert.equal(nodeKindRefusal('embedded', 'broker'), 'an Embedded / SoC project\'s System has no broker node (Embedded / SoC allows design, circuit, fpga, mcu: Design Properties\' Project Kind changes it)');
  assert.equal(nodeKindRefusal('fpga', 'mcu'), 'an FPGA project\'s System has no mcu node (FPGA allows design, circuit, fpga: Design Properties\' Project Kind changes it)');
  assert.equal(nodeKindRefusal('logic', 'fpga'), 'a Digital Logic project\'s System has no fpga node (Digital Logic allows design, circuit: Design Properties\' Project Kind changes it)');
  assert.equal(nodeKindRefusal('robot', 'fpga'), null);
  // (a System with a broker: System still; narrowed, the broker named as any node the profile does not allow)
  const [b, ctx] = sysProject('system', ['fpga', 'mcu', 'broker']);
  assert.equal(changeProfile(b, 'embedded', ctx).error, 'the project \'s\' cannot be Embedded / SoC: its node broker2 (broker) is not allowed (Embedded / SoC allows design, circuit, fpga, mcu)');
  assert.deepEqual(changeProfile(b, 'system', ctx), { project: b });
  // (the profile a System document keeps to: a System project's, an Embedded / SoC one's; a Digital Logic or an FPGA
  // project's System document is not its System: none)
  assert.deepEqual([{ profile: 'system' }, { profile: 'embedded' }, { kind: 'system' }, FPGA, LOGIC].map(systemRuleProfile), ['system', 'embedded', 'system', null, null]);
});

// Merge Contribution…'s merge (#4206, core/project-merge.js) on the examples: every example merged with itself (three-
// way and two-way: nothing to do, no conflict), and with known changes, the cases a group meets: a project split by
// module (VHDL and Verilog files), two people changing one HDL file (a conflict per hunk, or whole; apart, merged by its
// lines, #4214), a file renamed on one side and changed on the other (#4214), one state diagram (its objects
// merged, both sides' new states kept; one object both changed, a conflict of its own), silinx.json on both sides (its
// files' list by path, a field each side changed), a copy that is old (the project's later changes kept), a file the
// contribution removed, a drawing's generated HDL (made again, never a conflict); with no ancestor, a two-way merge.
// And a contribution read from the import gate's entries (its root folder, its ancestor, an ISE project refused).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compareProjects, contributionOf, mergeDescription, mergeProjects, openConflicts, textsOf } from '../core/project-merge.js';
import { giveCopy } from '../core/project-rev.js';
import { gateEntries } from '../core/import-gate.js';
import { EXAMPLE_ORDER } from '../core/examples.js';

const ROOT = path.join(import.meta.dirname, '..');
const clone = (o) => structuredClone(o);
function example(name) {
  const root = path.join(ROOT, 'examples', name);
  const walk = (rel = '') => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.posix.join(rel, e.name)) : [path.posix.join(rel, e.name)]));
  return { json: JSON.parse(fs.readFileSync(path.join(root, 'silinx.json'), 'utf8')), files: Object.fromEntries(walk().filter((p) => p !== 'silinx.json').map((p) => [p, fs.readFileSync(path.join(root, p), 'utf8')])) };
}
// the project, its copy's ancestor, and two sides changed from it
async function sides(name, editMine = () => {}, editTheirs = () => {}) {
  const base = example(name);
  const { snapshot } = await giveCopy(base.json, base.files);
  const mine = clone(base), theirs = clone(base);
  editMine(mine); editTheirs(theirs);
  return { ancestor: snapshot, mine, theirs };
}
const states = (cmp) => Object.fromEntries(cmp.files.filter((f) => f.state !== 'same').map((f) => [f.path, f.state]));
const json = (o, indent = 2) => `${JSON.stringify(o, null, indent)}\n`;

test('every example merged with itself, three-way and two-way: every file the same, no conflict, nothing written', async () => {
  assert.ok(EXAMPLE_ORDER.length >= 11);
  for (const ex of EXAMPLE_ORDER) {
    const s = await sides(ex);
    for (const ancestor of [s.ancestor, null]) {
      const cmp = compareProjects({ ancestor, mine: s.mine, theirs: s.theirs });
      assert.deepEqual([states(cmp), cmp.project.conflicts, openConflicts(cmp), cmp.threeWay], [{}, [], [], !!ancestor], ex);
      const m = await mergeProjects(cmp);
      assert.deepEqual([m.write, m.remove, m.taken, m.regenerate], [{}, [], [], []], ex);
      assert.deepEqual(m.json, mergeDescription(null, s.mine.json, s.mine.json).json, ex);
    }
  }
});

test('a project split by module: each one\'s files taken or kept (VHDL and Verilog), a file added there and its entry in the files\' list', async () => {
  const v = 'module extra(input a, output y); assign y = ~a; endmodule\n';
  const s = await sides('traffic',
    (m) => { m.files['src/sevenseg.v'] += '// mine\n'; m.files['src/mine.vhd'] = '-- mine\n'; m.json.files.push({ path: 'src/mine.vhd', lang: 'vhdl', role: 'design' }); },
    (t) => { t.files['src/timer.vhd'] += '-- theirs\n'; t.files['src/extra.v'] = v; t.json.files.push({ path: 'src/extra.v', lang: 'verilog', role: 'design' }); });
  const cmp = compareProjects(s);
  assert.deepEqual(states(cmp), { 'src/extra.v': 'added', 'src/mine.vhd': 'mine', 'src/sevenseg.v': 'mine', 'src/timer.vhd': 'theirs' });
  assert.deepEqual(openConflicts(cmp), []);
  const m = await mergeProjects(cmp);
  assert.deepEqual(m.write, { 'src/extra.v': v, 'src/timer.vhd': s.theirs.files['src/timer.vhd'] });
  assert.deepEqual(m.taken, ['src/extra.v', 'src/timer.vhd', 'silinx.json']);
  assert.deepEqual(m.json.files.map((f) => f.path), [...s.ancestor.json.files.map((f) => f.path), 'src/mine.vhd', 'src/extra.v']);
});

test('two people change one HDL file: the same lines a conflict per hunk (Mine, Theirs, Both, a text) or of the whole file; unresolved, nothing merged', async () => {
  const s = await sides('traffic', (m) => { m.files['src/timer.vhd'] += '-- mine\n'; }, (t) => { t.files['src/timer.vhd'] += '-- theirs\n'; });
  const cmp = compareProjects(s);
  const T = s.ancestor.files['src/timer.vhd'], n = T.split('\n').length;
  assert.deepEqual(states(cmp), { 'src/timer.vhd': 'conflict' });
  assert.deepEqual(cmp.files.find((f) => f.path === 'src/timer.vhd').hunks, [{ id: 'h1', base: [], mine: ['-- mine'], theirs: ['-- theirs'], at: { base: n, mine: n, theirs: n } }]);
  assert.deepEqual(openConflicts(cmp), [{ path: 'src/timer.vhd' }]);
  await assert.rejects(mergeProjects(cmp), { status: 400, message: 'not every conflict is resolved: src/timer.vhd' });
  assert.deepEqual(openConflicts(cmp, { 'src/timer.vhd': {} }), [{ path: 'src/timer.vhd', id: 'h1' }]);
  await assert.rejects(mergeProjects(cmp, { 'src/timer.vhd': { h1: 'base' } }), { status: 400, message: 'not every conflict is resolved: src/timer.vhd h1' });
  assert.deepEqual((await mergeProjects(cmp, { 'src/timer.vhd': 'mine' })).write, {});
  assert.deepEqual((await mergeProjects(cmp, { 'src/timer.vhd': 'theirs' })).write, { 'src/timer.vhd': s.theirs.files['src/timer.vhd'] });
  assert.deepEqual((await mergeProjects(cmp, { 'src/timer.vhd': { h1: 'mine' } })).write, {});
  const both = await mergeProjects(cmp, { 'src/timer.vhd': { h1: 'both' } });
  assert.deepEqual([both.write, both.taken], [{ 'src/timer.vhd': `${T}-- mine\n-- theirs\n` }, ['src/timer.vhd']]);
  assert.deepEqual((await mergeProjects(cmp, { 'src/timer.vhd': { h1: { text: '-- ours' } } })).write, { 'src/timer.vhd': `${T}-- ours\n` });
  // two-way: the same hunk, a conflict per hunk too
  const two = compareProjects({ ...s, ancestor: null });
  assert.deepEqual(two.files.find((f) => f.path === 'src/timer.vhd').hunks.map((h) => [h.mine, h.theirs]), [[['-- mine'], ['-- theirs']]]);
  assert.deepEqual((await mergeProjects(two, { 'src/timer.vhd': { h1: 'both' } })).write, { 'src/timer.vhd': `${T}-- mine\n-- theirs\n` });
});

test('#4214 two people change one HDL file apart: merged by its lines, no conflict (VHDL and Verilog), the merge checked and elaborated', async () => {
  const s = await sides('traffic',
    (m) => { m.files['src/timer.vhd'] = `-- mine\n${m.files['src/timer.vhd']}`; m.files['src/sevenseg.v'] = m.files['src/sevenseg.v'].replace("4'd7:  seg = 7'b1111000;", "4'd7:  seg = 7'b1011000;"); },
    (t) => { t.files['src/timer.vhd'] = t.files['src/timer.vhd'].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;'); t.files['src/sevenseg.v'] += '// theirs\n'; });
  const cmp = compareProjects(s);
  assert.deepEqual(states(cmp), { 'src/sevenseg.v': 'merged', 'src/timer.vhd': 'merged' });
  assert.deepEqual(openConflicts(cmp), []);
  const m = await mergeProjects(cmp);
  assert.deepEqual(m.write, {
    'src/sevenseg.v': `${s.mine.files['src/sevenseg.v']}// theirs\n`,
    'src/timer.vhd': s.mine.files['src/timer.vhd'].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;'),
  });
  assert.deepEqual(m.taken, ['src/sevenseg.v', 'src/timer.vhd']);
  const { compile, elaborate } = await import('../core/compile.js');
  for (const [f, top] of [['src/sevenseg.v', 'sevenseg'], ['src/timer.vhd', 'timer']]) {
    const lib = compile([{ path: f, text: m.write[f] }]);
    const d = elaborate(lib, top);
    assert.deepEqual([...lib.errors, ...d.diags].map((x) => `${x.severity}: ${x.message}`), [], f);
  }
});

test('#4214 a file renamed on one side and changed on the other: merged as a rename, the old one removed; either side', async () => {
  const V = 'src/timer.vhd';
  const s = await sides('traffic', (m) => { m.files[V] = `-- mine\n${m.files[V]}`; }, (t) => { t.files['rtl/timer.vhd'] = t.files[V].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;'); delete t.files[V]; });
  const cmp = compareProjects(s);
  assert.deepEqual(states(cmp), { 'rtl/timer.vhd': 'merged', [V]: 'renamed' });
  assert.deepEqual(cmp.files.filter((f) => f.rename || f.renamedTo).map((f) => [f.path, f.rename ?? f.renamedTo]), [['rtl/timer.vhd', { from: V, side: 'theirs' }], [V, 'rtl/timer.vhd']]);
  assert.deepEqual(textsOf(cmp, cmp.files.find((f) => f.path === 'rtl/timer.vhd')), { base: s.ancestor.files[V], mine: s.mine.files[V], theirs: s.theirs.files['rtl/timer.vhd'] });
  const m = await mergeProjects(cmp);
  assert.deepEqual([m.write, m.remove], [{ 'rtl/timer.vhd': s.mine.files[V].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;') }, [V]]);
  // renamed here, changed there: there's change merged into the file here; nothing removed (it is gone here already)
  const r = await sides('traffic', (m) => { m.files['hdl/timer.vhd'] = `-- mine\n${m.files[V]}`; delete m.files[V]; }, (t) => { t.files[V] = t.files[V].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;'); });
  const c2 = compareProjects(r);
  assert.deepEqual(states(c2), { 'hdl/timer.vhd': 'merged', [V]: 'renamed' });
  const m2 = await mergeProjects(c2);
  assert.deepEqual([m2.write, m2.remove], [{ 'hdl/timer.vhd': r.mine.files['hdl/timer.vhd'].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;') }, []]);
  // renamed and the same lines changed: a conflict per hunk at the new path
  const c = await sides('traffic', (m) => { m.files[V] = m.files[V].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 8;'); }, (t) => { t.files['rtl/timer.vhd'] = t.files[V].replace('CARS_S   : integer := 5;', 'CARS_S   : integer := 6;'); delete t.files[V]; });
  const c3 = compareProjects(c);
  assert.deepEqual(states(c3), { 'rtl/timer.vhd': 'conflict', [V]: 'renamed' });
  assert.deepEqual(openConflicts(c3, { 'rtl/timer.vhd': {} }), [{ path: 'rtl/timer.vhd', id: 'h1' }]);
  const m3 = await mergeProjects(c3, { 'rtl/timer.vhd': { h1: 'mine' } });
  assert.deepEqual([m3.write, m3.remove], [{ 'rtl/timer.vhd': c.mine.files[V] }, [V]]);
});

test('one state diagram on both sides: different objects merged (both sides\' new states kept), its HDL file made again; the same object a conflict of its own', async () => {
  const F = 'src/traffic.fsm.json';
  const edit = (side, x) => (p) => {
    const d = JSON.parse(p.files[F]);
    d.states.push({ id: 's8', name: 'S0', x, y: 600, outputs: {} });
    d.transitions.push({ id: 't9', from: 's8', to: 's1', cond: 'done', outputs: {} });
    if (side === 'mine') d.states[0].x += 20; else d.transitions[0].cond = 'night or req';
    p.files[F] = json(d);
    p.files['src/traffic.vhd'] = `-- made from ${side}'s drawing\n`;
  };
  const s = await sides('traffic', edit('mine', 700), edit('theirs', 900));
  const cmp = compareProjects(s);
  assert.deepEqual(states(cmp), { [F]: 'merged', 'src/traffic.vhd': 'generated' });
  const m = await mergeProjects(cmp);
  const d = JSON.parse(m.write[F]);
  assert.deepEqual(d.states.filter((x) => /^S\d$/.test(x.name)).map((x) => [x.id, x.name, x.x]), [['s8', 'S0', 700], ['s9', 'S1', 900]]);
  assert.equal(d.transitions[0].cond, 'night or req');
  assert.deepEqual([m.regenerate, m.write['src/traffic.vhd']], [[F], undefined]);
  // the same object both changed: its own conflict, chosen per object
  const s2 = await sides('traffic', (p) => { const x = JSON.parse(p.files[F]); x.transitions[0].cond = 'night and req'; p.files[F] = json(x); }, (p) => { const x = JSON.parse(p.files[F]); x.transitions[0].cond = 'night or req'; p.files[F] = json(x); });
  const c2 = compareProjects(s2);
  assert.deepEqual(c2.files.find((f) => f.path === F).conflicts, [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }]);
  assert.deepEqual(openConflicts(c2), [{ path: F, id: 'transitions/t1' }]);
  assert.equal(JSON.parse((await mergeProjects(c2, { [F]: { 'transitions/t1': 'theirs' } })).write[F]).transitions[0].cond, 'night or req');
  assert.deepEqual((await mergeProjects(c2, { [F]: 'mine' })).write, {});
});

test('silinx.json on both sides: its files\' list by path, a field one side changed taken, one both changed a conflict; the board\'s', async () => {
  const s = await sides('traffic', (m) => { m.json.board = 'nexys2'; m.json.impl.optLevel = 2; }, (t) => { t.json.board = 'basys2-100'; t.json.simTop = 'tb_other'; t.json.impl.optMode = 'Area'; });
  const cmp = compareProjects(s);
  assert.deepEqual(cmp.project.conflicts, [{ field: 'board', mine: 'nexys2', theirs: 'basys2-100' }]);
  assert.deepEqual(openConflicts(cmp), [{ path: 'silinx.json', field: 'board' }]);
  const m = await mergeProjects(cmp, { 'silinx.json': { board: 'theirs' } });
  assert.deepEqual([m.json.board, m.json.simTop, m.json.impl.optLevel, m.json.impl.optMode, m.taken], ['basys2-100', 'tb_other', 2, 'Area', ['silinx.json']]);
  // (never the contribution's id, origin or trust)
  const t = await sides('traffic', () => {}, (x) => { Object.assign(x.json, { id: crypto.randomUUID(), origin: { id: 'a' }, trusted: true, madeBy: 'editor' }); });
  assert.deepEqual([(await mergeProjects(compareProjects(t))).taken, compareProjects(t).project.conflicts], [[], []]);
});

test('an old copy: the project\'s changes since kept, the copy\'s taken; a file it removed, removed with its entry', async () => {
  const base = example('stopwatch');
  const { snapshot } = await giveCopy(base.json, base.files);
  const mine = clone(base), theirs = clone(base);
  const [a, b] = Object.keys(base.files).filter((p) => /\.(vhd|v)$/.test(p) && p.startsWith('src/'));
  mine.files[a] += '-- the teacher\'s fix, after the copy\n';
  theirs.files[b] += '-- the student\'s work\n';
  const listed = base.json.files.find((f) => f.path.startsWith('sim/'));
  delete theirs.files[listed.path];
  theirs.json.files = theirs.json.files.filter((f) => f !== theirs.json.files.find((x) => x.path === listed.path));
  const cmp = compareProjects({ ancestor: snapshot, mine, theirs });
  assert.deepEqual(states(cmp), { [a]: 'mine', [b]: 'theirs', [listed.path]: 'removed' });
  const m = await mergeProjects(cmp);
  assert.deepEqual([Object.keys(m.write), m.remove], [[b], [listed.path]]);
  assert.ok(!m.json.files.some((f) => f.path === listed.path));
  // the same copy, two-way: the teacher's fix and the student's work both a choice; the removed file kept
  const two = compareProjects({ ancestor: null, mine, theirs });
  assert.deepEqual(states(two), { [a]: 'conflict', [b]: 'conflict', [listed.path]: 'mine' });
});

test('contributionOf: a zip\'s project in its root folder, its ancestor apart, build/ and hidden files out; an ISE project, or none, refused', async () => {
  const E = (p, t) => ({ path: p, data: new TextEncoder().encode(t) });
  const c = contributionOf(gateEntries([E('ana/silinx.json', '{"name":"x"}'), E('ana/src/a.vhd', '-- a\n'), E('ana/silinx.base.json', '{}'), E('ana/build/top.bit', 'b'), E('other/b.vhd', 'b')]));
  assert.deepEqual([c.json, c.files, c.ancestorText], [{ name: 'x' }, { 'src/a.vhd': '-- a\n' }, '{}']);
  assert.throws(() => contributionOf(gateEntries([E('p.xise', '<x/>'), E('a.vhd', '')])), { message: 'the contribution is a Xilinx ISE project: only a Silinx project (its .zip or its folder) is merged' });
  assert.throws(() => contributionOf(gateEntries([E('a.vhd', '')])), { message: 'the contribution has no silinx.json: it is no Silinx project' });
  assert.throws(() => contributionOf(gateEntries([E('silinx.json', '[1]')])), { message: 'the contribution\'s silinx.json is not a project\'s description' });
  // (its description's paths that are no project's: dropped, said)
  const bad = contributionOf(gateEntries([E('silinx.json', JSON.stringify({ files: [{ path: 'src/a.vhd' }, { path: '../../etc/passwd' }, { path: '.git/config' }, 'junk'], constraints: '/etc/x.ucf', excluded: ['build/x', 'ok.txt'] })), E('src/a.vhd', '')]));
  assert.deepEqual([bad.json.files, 'constraints' in bad.json, bad.json.excluded], [[{ path: 'src/a.vhd' }], false, ['ok.txt']]);
  assert.deepEqual(bad.skipped, ['silinx.json: "../../etc/passwd"', 'silinx.json: ".git/config"', 'silinx.json: "junk"', 'silinx.json: constraints "/etc/x.ucf"', 'silinx.json: excluded "build/x"']);
});

// A pull's conflicts through GitHub's API sorted out (#4214, core/git-rest-merge.js), its functions on their own
// (#4777): the text files changed on both sides merged by their lines, their conflicts left to the choices; a file
// removed on one side, a binary file and a drawing's HDL left out of the text merge; a drawing merged by its objects;
// a file renamed on one side and changed on the other found by its lines, on GitHub and here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mergeConflicts, pullRenames } from '../core/git-rest-merge.js';

const ROOT = path.join(import.meta.dirname, '..');
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
const lines = (...l) => l.map(x => `${x}\n`).join('');
const each = async (list, fn) => Promise.all(list.map(fn));

// the pull's state as core/git-rest.js gives it: the last pull's blobs (m.paths[p].remote), GitHub's head's
// (head.blobs[p].sha), a blob's text by its sha (none: null)
function pull({ base = {}, theirs = {} }) {
  const blobs = {}, m = { paths: {} }, head = { blobs: {} };
  for (const [p, t] of Object.entries(base)) { blobs[`b:${p}`] = t; m.paths[p] = { remote: `b:${p}` }; }
  for (const [p, t] of Object.entries(theirs)) { if (t === null) continue; blobs[`t:${p}`] = t; head.blobs[p] = { sha: `t:${p}` }; }
  return { m, head, blobText: async sha => (sha == null ? null : blobs[sha] ?? null) };
}

const ENTITY = (name, extra = '') => lines(`library ieee;${extra}`, `use ieee.std_logic_1164.all;`, `entity ${name} is`, `  port (a, b : in std_logic;`,
  `        y : out std_logic);`, `end ${name};`, `architecture rtl of ${name} is`, `begin`, `  y <= a and b;`, `end rtl;`);

test('mergeConflicts: text files merged by their lines; a conflict waits for its choice, a bad choice is none; removed and binary files left', async () => {
  const base = { 'src/a.vhd': lines('l1', 'l2', 'l3'), 'src/b.vhd': lines('l1', 'l2', 'l3'), 'src/c.dat': 'x\0y', 'src/d.vhd': lines('d') };
  const theirs = { 'src/a.vhd': lines('l1', 'l2', 'L3'), 'src/b.vhd': lines('l1', 'theirs', 'l3'), 'src/c.dat': 'x\0z', 'src/d.vhd': lines('d2') };
  const mine = { 'src/a.vhd': lines('L1', 'l2', 'l3'), 'src/b.vhd': lines('l1', 'mine', 'l3'), 'src/c.dat': 'x\0w' };
  const { m, head, blobText } = pull({ base, theirs });
  const conflicts = Object.keys(base);
  const r = await mergeConflicts({ blobText, each }, m, head, mine, conflicts);
  assert.deepEqual(r.drawings, []);
  assert.deepEqual(r.pending, []);
  assert.deepEqual(r.generated, []);
  assert.deepEqual(r.texts.map(t => t.path), ['src/a.vhd', 'src/b.vhd']);
  assert.equal(r.texts[0].m.text, lines('L1', 'l2', 'L3'));
  assert.deepEqual(r.texts[0].m.conflicts, []);
  assert.equal(r.texts[1].m.text, null);
  assert.deepEqual(r.waiting, [{ path: 'src/b.vhd', base: base['src/b.vhd'], mine: mine['src/b.vhd'], theirs: theirs['src/b.vhd'],
    hunks: [{ kind: 'conflict', id: 'h1', base: ['l2'], mine: ['mine'], theirs: ['theirs'], at: { base: 2, mine: 2, theirs: 2 } }] }]);
  assert.deepEqual(r.left, ['src/c.dat', 'src/d.vhd'], 'a file with a NUL; one removed here');
  // (a choice per hunk: none waits; a choice that is none still waits)
  const chosen = await mergeConflicts({ blobText, each }, m, head, mine, conflicts, { 'src/b.vhd': { h1: 'theirs' } });
  assert.deepEqual(chosen.waiting, []);
  const own = await mergeConflicts({ blobText, each }, m, head, mine, conflicts, { 'src/b.vhd': { h1: { text: 'own\n' } } });
  assert.deepEqual(own.waiting, []);
  for (const bad of ['nope', { text: 1 }, { text: 'x', more: 1 }, ['mine']]) {
    const w = await mergeConflicts({ blobText, each }, m, head, mine, conflicts, { 'src/b.vhd': { h1: bad } });
    assert.deepEqual(w.waiting.map(x => x.path), ['src/b.vhd'], JSON.stringify(bad));
  }
});

test('mergeConflicts: a file added on both sides (no base) merged two ways, each difference a conflict; the same text none', async () => {
  const { m, head, blobText } = pull({ theirs: { 'src/n.v': lines('module n;', 'endmodule'), 'src/s.v': lines('same') } });
  const r = await mergeConflicts({ blobText, each }, m, head, { 'src/n.v': lines('module n2;', 'endmodule'), 'src/s.v': lines('same') }, ['src/n.v', 'src/s.v']);
  assert.deepEqual(r.waiting.map(w => [w.path, w.base, w.hunks.length]), [['src/n.v', null, 1]]);
  assert.equal(r.texts.find(t => t.path === 'src/s.v').m.text, lines('same'));
  assert.deepEqual(r.left, []);
});

test('mergeConflicts: a drawing merged by its objects, pending until each conflict is chosen; its HDL file not merged as a text', async () => {
  const p = 'src/traffic.fsm.json', hdl = 'src/traffic.vhd';
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'traffic', p), 'utf8'));
  assert.equal(model.generatedFile, hdl);
  const mineD = structuredClone(model), theirsD = structuredClone(model);
  mineD.states[0].x += 60;
  theirsD.states[0].comment = 'theirs';
  theirsD.states[2].x += 10;
  const { m, head, blobText } = pull({ base: { [p]: json(model), [hdl]: lines('-- base') }, theirs: { [p]: json(theirsD), [hdl]: lines('-- theirs') } });
  const mine = { [p]: json(mineD), [hdl]: lines('-- mine') };
  const r = await mergeConflicts({ blobText, each }, m, head, mine, [p, hdl]);
  assert.deepEqual(r.drawings.map(d => [d.path, d.kind, d.conflicts.map(c => [c.id, c.mine, c.theirs])]), [[p, 'fsm', [['states/s1', 'moved', 'changed (comment)']]]]);
  assert.deepEqual(r.drawings[0].v, { base: json(model), mine: json(mineD), theirs: json(theirsD) });
  assert.deepEqual(r.pending.map(c => c.path), [p]);
  assert.deepEqual(r.generated, [hdl], 'made again from the merged drawing');
  assert.deepEqual([r.texts, r.waiting, r.left], [[], [], []]);
  for (const side of ['mine', 'theirs']) assert.deepEqual((await mergeConflicts({ blobText, each }, m, head, mine, [p, hdl], { [p]: { 'states/s1': side } })).pending, [], side);
  assert.deepEqual((await mergeConflicts({ blobText, each }, m, head, mine, [p, hdl], { [p]: { 'states/s1': 'both' } })).pending.length, 1, 'a drawing\'s choice is mine or theirs');
  // (a drawing removed on one side, or one that is not JSON: left as a file's conflict)
  const gone = await mergeConflicts({ blobText, each }, m, head, { [hdl]: lines('-- mine') }, [p]);
  assert.deepEqual([gone.drawings, gone.left], [[], [p]]);
  const broken = await mergeConflicts({ blobText, each }, m, head, { [p]: '{ not json' }, [p]);
  assert.deepEqual([broken.drawings, broken.left], [[], [p]]);
});

test('pullRenames: a file GitHub renamed and changed here found by its lines, its change merged into the renamed file', async () => {
  const base = ENTITY('gate'), there = ENTITY('gate', ' -- renamed there'), here = ENTITY('gate').replace('a and b', 'a or b');
  const { m, head, blobText } = pull({ base: { 'src/gate.vhd': base, 'src/keep.vhd': lines('k') }, theirs: { 'src/and_gate.vhd': there, 'src/keep.vhd': lines('k') } });
  const mine = { 'src/gate.vhd': here, 'src/keep.vhd': lines('k') };
  const args = { paths: m.paths, blobs: head.blobs, mine, conflicts: ['src/gate.vhd'], take: ['src/and_gate.vhd'],
    base: p => blobText(m.paths[p]?.remote), theirs: p => blobText(head.blobs[p]?.sha) };
  const renamed = await pullRenames(args);
  assert.deepEqual(renamed, [{ path: 'src/and_gate.vhd', from: 'src/gate.vhd', side: 'theirs', v: { base, mine: here, theirs: there } }]);
  const r = await mergeConflicts({ blobText, each }, m, head, mine, [], {}, renamed);
  assert.deepEqual(r.waiting, []);
  assert.equal(r.texts[0].path, 'src/and_gate.vhd');
  assert.equal(r.texts[0].m.text, ENTITY('gate', ' -- renamed there').replace('a and b', 'a or b'), 'both changes');
  // (a file added there that is not like it, or of another kind, is no rename)
  assert.deepEqual(await pullRenames({ ...args, take: ['src/other.vhd'], blobs: { 'src/other.vhd': { sha: 'x' } }, theirs: async () => lines('entirely', 'different') }), []);
  assert.deepEqual(await pullRenames({ ...args, take: ['src/and_gate.v'], blobs: { 'src/and_gate.v': { sha: 't:src/and_gate.vhd' } } }), []);
  assert.deepEqual(await pullRenames({ ...args, conflicts: [], take: [] }), []);
});

test('pullRenames: a file renamed here and changed on GitHub found too (side mine, GitHub\'s version of the old name); drawings never', async () => {
  const base = ENTITY('gate'), there = ENTITY('gate').replace('a and b', 'a xor b'), here = ENTITY('gate', ' -- renamed here');
  const fsm = json({ states: [], transitions: [] });
  const { m, head, blobText } = pull({ base: { 'src/gate.vhd': base, 'src/m.fsm.json': fsm }, theirs: { 'src/gate.vhd': there, 'src/m.fsm.json': fsm } });
  const mine = { 'src/xor_gate.vhd': here, 'src/n.fsm.json': fsm };
  const renamed = await pullRenames({ paths: m.paths, blobs: head.blobs, mine, conflicts: ['src/gate.vhd', 'src/m.fsm.json'], take: [],
    base: p => blobText(m.paths[p]?.remote), theirs: p => blobText(head.blobs[p]?.sha) });
  assert.deepEqual(renamed, [{ path: 'src/xor_gate.vhd', from: 'src/gate.vhd', side: 'mine', v: { base, mine: here, theirs: there } }]);
  const r = await mergeConflicts({ blobText, each }, m, head, mine, [], {}, renamed);
  assert.equal(r.texts[0].m.text, ENTITY('gate', ' -- renamed here').replace('a and b', 'a xor b'));
});

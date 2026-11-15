// A copy of a project followed, kept once following ends (#4198, core/collab-keep.js): what it holds (the project's
// description marked untrusted, its text files as shared, its drawings edited live as merged, an editor's change not
// delivered included), a room whose project has not arrived, the copy's free name, and whether a follower's page holds
// work saved nowhere (the keep or close decision's input: edited, kept, ended or the connection lost).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectDoc, publishProject, editFile } from '../core/collab-doc.js';
import { putDrawing } from '../core/collab-model.js';
import { followedCopy, copyName, unsavedFollow } from '../core/collab-keep.js';
import { isTrusted } from '../core/trust.js';
import { normalizeFsm } from '../core/fsm.js';

const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/ctl.fsm.json' }], device: { part: 'xc3s250e' } };
const FSM = normalizeFsm({ name: 'ctl', states: [{ id: 's0', name: 'IDLE', x: 0, y: 0, outputs: {} }], transitions: [], initial: 's0', inputs: [], outputs: [] });

function room() {
  const doc = projectDoc();
  publishProject(doc, { project: { ...PROJECT, fileTree: ['src/top.vhd', 'src/ctl.fsm.json', 'notes.txt'] }, files: { 'src/top.vhd': 'entity top is end;\n', 'src/ctl.fsm.json': JSON.stringify(FSM, null, 2), 'notes.txt': 'hello\n' }, owner: 'Ana' });
  return doc;
}

test('the copy: silinx.json first and untrusted, every file as the room has it', () => {
  const c = followedCopy(room());
  assert.equal(c.name, 'traffic');
  assert.equal(c.owner, 'Ana');
  assert.deepEqual(c.entries.map(e => e.path), ['silinx.json', 'notes.txt', 'src/ctl.fsm.json', 'src/top.vhd']);
  const pj = JSON.parse(c.entries[0].data);
  assert.equal(isTrusted(pj), false);
  assert.equal(pj.fileTree, undefined);
  assert.deepEqual([pj.name, pj.top, pj.device], ['traffic', 'top', { part: 'xc3s250e' }]);
  assert.equal(c.entries.find(e => e.path === 'notes.txt').data, 'hello\n');
});

test('an editor\'s changes not delivered yet are in it: a text file\'s edit, a drawing edited live as merged', () => {
  const doc = room();
  editFile(doc, 'src/top.vhd', 'entity top is port (a : in bit); end;\n');
  putDrawing(doc, 'src/ctl.fsm.json', { ...FSM, states: [{ ...FSM.states[0], name: 'WAIT' }] });
  const c = followedCopy(doc);
  assert.equal(c.entries.find(e => e.path === 'src/top.vhd').data, 'entity top is port (a : in bit); end;\n');
  assert.equal(JSON.parse(c.entries.find(e => e.path === 'src/ctl.fsm.json').data).states[0].name, 'WAIT');
});

test('a room whose project has not arrived: no copy', () => {
  assert.throws(() => followedCopy(projectDoc()), /the shared project has not arrived/);
});

test('the copy\'s name: the project\'s own when free, else the first free suffix, the case ignored', () => {
  assert.equal(copyName('traffic', []), 'traffic');
  assert.equal(copyName('traffic', ['gates', 'Traffic']), 'traffic_2');
  assert.equal(copyName('traffic', ['traffic', 'traffic_2']), 'traffic_3');
});

test('work saved nowhere: changed, not kept, and reaching nobody (ended, or the connection lost)', () => {
  const cases = [
    [{ edited: true, closed: true }, true],                     // Stop Following, or the owner stopped: an editor's changes
    [{ edited: true, closed: false, connected: false }, true],  // the connection lost meanwhile
    [{ edited: true, closed: false, connected: true }, false],  // following: the owner has them
    [{ edited: true, closed: true, kept: true }, false],        // a copy kept
    [{ edited: false, closed: true }, false],                   // a viewer, who changed nothing
    [{}, false],
  ];
  for (const [s, want] of cases) assert.equal(unsavedFollow(s), want, JSON.stringify(s));
});

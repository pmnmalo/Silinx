// A shared project's versions through its document (core/collab-versions.js, #5742): the owner's list as a follower reads
// it (checked: what is not a version's row left out, LIST_MAX at most); an editor's request (a save, a restore) reaching
// the owner once, what is not a request ignored, a change of the owner's parts by another participant given back to the
// owner (fix); the owner's answer (its line for everyone, its result for the editor who asked); a failed request said.
// Two documents kept in step as the room keeps them (each one's updates applied to the other, remote).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { publishVersions, docVersions, putRequest, requestOf, watchRequests, handleRequest, putDone, doneOf, watchDone } from '../core/collab-versions.js';

function pair() {
  const owner = new Y.Doc(), editor = new Y.Doc();
  owner.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(editor, u, 'remote'); });
  editor.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(owner, u, 'remote'); });
  return { owner, editor };
}
const row = (id, extra = {}) => ({ id, at: '2026-11-26T10:00:00.000Z', reason: 'manual', label: `v${id}`, author: 'Ana', files: 3, changed: { added: ['src/a.vhd'], changed: [], removed: [] }, ...extra });

test('the owner\'s list as a follower reads it: rows checked, what is not one left out, 50 at most', () => {
  const { owner, editor } = pair();
  assert.deepEqual(docVersions(editor), []);
  publishVersions(owner, [row('3', { reason: 'restore', of: '1' }), row('2'), row('1')]);
  assert.deepEqual(docVersions(editor).map(v => [v.id, v.reason, v.of ?? null, v.label]), [['3', 'restore', '1', 'v3'], ['2', 'manual', null, 'v2'], ['1', 'manual', null, 'v1']]);
  // (written by anyone: what is no row, a path outside the project, out)
  owner.getMap('versions').set('list', JSON.stringify([row('4', { changed: { added: ['../x', 'src/b.vhd'] } }), { id: 'x' }, row('5', { reason: 'evil' }), 'junk']));
  assert.deepEqual(docVersions(editor).map(v => [v.id, v.changed.added]), [['4', ['src/b.vhd']]]);
  owner.getMap('versions').set('list', '{');
  assert.deepEqual(docVersions(editor), []);
  publishVersions(owner, Array.from({ length: 80 }, (_, i) => row(String(80 - i))));
  assert.equal(docVersions(editor).length, 50);
  // (the owner's only: a list another participant wrote is none)
  assert.equal(docVersions(editor, { owner: owner.clientID }).length, 50);
  editor.getMap('versions').set('list', JSON.stringify([row('9')]));
  assert.deepEqual(docVersions(owner, { owner: owner.clientID }), []);
  assert.deepEqual(docVersions(owner).map(v => v.id), ['9']);
});

test('an editor\'s request reaches the owner once; what is not one is ignored; the owner\'s parts changed by another given back', () => {
  const { owner, editor } = pair();
  const got = [];
  let fixed = 0;
  const off = watchRequests(owner, r => got.push(r), { fix: () => { fixed++; } });
  putRequest(editor, { nonce: 'n1', kind: 'restore', by: 'Rui', id: '2', path: 'src/a.vhd' });
  putRequest(editor, { nonce: 'n2', kind: 'save', by: 'Rui\u0007', label: 'before\nthe lab' });
  assert.deepEqual(got, [{ nonce: 'n1', kind: 'restore', by: 'Rui', id: '2', path: 'src/a.vhd' }, { nonce: 'n2', kind: 'save', by: 'Rui', label: 'before the lab' }]);
  // (the same request again: once)
  editor.getMap('versions').set('request', JSON.stringify({ nonce: 'n2', kind: 'save', by: 'Rui' }));
  // not requests: a path outside the project, a version that is no number, another kind, no nonce
  for (const bad of [{ nonce: 'n3', kind: 'restore', by: 'R', id: '2', path: '../etc' }, { nonce: 'n4', kind: 'restore', by: 'R', id: 'x' }, { nonce: 'n5', kind: 'delete' }, { kind: 'save' }]) {
    editor.getMap('versions').set('request', JSON.stringify(bad));
    assert.equal(requestOf(bad), null);
  }
  assert.throws(() => putRequest(editor, { nonce: 'n6', kind: 'restore', id: 'x' }), /not a request of the versions/);
  assert.equal(got.length, 2);
  assert.equal(fixed, 0);
  // (the list or the answer written by an editor: the owner's again)
  editor.getMap('versions').set('list', '[]');
  assert.equal(fixed, 1);
  // (the owner's own writes: not requests)
  owner.getMap('versions').set('request', JSON.stringify({ nonce: 'n7', kind: 'save', by: 'Ana' }));
  assert.equal(got.length, 2);
  off();
});

test('the owner\'s answer: its line for everyone, its result for the editor; the request cleared; a failure said', async () => {
  const { owner, editor } = pair();
  const seen = [];
  watchDone(editor, d => seen.push(d));
  const ops = {
    save: async (label, author) => ({ version: { id: '7', label, author }, saved: true }),
    restore: async (id, path, author) => ({ written: [path || 'src/a.vhd'], removed: [], json: false, version: { id: '9', of: id, author }, before: { id: '8' } }),
  };
  const r = putRequest(editor, { nonce: 'a1', kind: 'restore', by: 'Rui', id: '2', path: null });
  const done = await handleRequest(requestOf(r), ops);
  putDone(owner, done);
  assert.equal(owner.getMap('versions').has('request'), false);
  assert.deepEqual(seen.map(d => [d.nonce, d.ok, d.line]), [['a1', true, 'Rui restored the project as version 2 had it: 1 file(s) written, 0 removed; the project before it kept as version 8.']]);
  assert.equal(doneOf(editor).result.version.id, '9');
  const s = await handleRequest({ nonce: 'a2', kind: 'save', by: 'Rui', label: 'mine' }, ops);
  assert.equal(s.line, 'Rui saved version 7: mine.');
  const one = await handleRequest({ nonce: 'a3', kind: 'restore', by: 'Rui', id: '2', path: 'src/b.vhd' }, ops);
  assert.equal(one.line, 'Rui restored src/b.vhd as version 2 had it: 1 file(s) written, 0 removed; the project before it kept as version 8.');
  const same = await handleRequest({ nonce: 'a4', kind: 'restore', by: 'Rui', id: '2', path: null }, { ...ops, restore: async () => ({ written: [], removed: [], json: false, version: null, before: null }) });
  assert.equal(same.line, 'Rui: the project is as version 2 has it already: nothing restored.');
  const err = await handleRequest({ nonce: 'a5', kind: 'restore', by: 'Rui', id: '99', path: null }, { ...ops, restore: async () => { throw new Error("no version 99 of 'P'"); } });
  assert.deepEqual([err.ok, err.line], [false, "Rui: Restore Version: no version 99 of 'P'"]);
  // (an answer that is not one: none)
  owner.getMap('versions').set('done', '{"nonce":1}');
  assert.equal(doneOf(editor), null);
  // (an answer forged by another participant: not the owner's, not said)
  const said = [];
  watchDone(owner, d => said.push(d.line), { owner: () => owner.clientID });
  editor.getMap('versions').set('done', JSON.stringify({ nonce: 'f', kind: 'restore', by: 'Ana', ok: true, line: 'Ana restored nothing' }));
  assert.deepEqual(said, []);
  assert.equal(doneOf(owner, { owner: owner.clientID }), null);
  // (the owner not known yet: nothing said)
  const none = [];
  watchDone(editor, d => none.push(d), { owner: () => null });
  putDone(owner, done);
  assert.deepEqual([none, said.length], [[], 1]);
});

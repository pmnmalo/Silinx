// What an editor of a shared project does to its files and its description (#4418, core/collab-files.js): a file
// created, deleted, renamed, the description set, the MCP's source changes, at the editor's; at the owner's, each change
// the document received written through a store (applyEdits): through the import gate, the project untrusted before
// the first write, a file of the folder that is not shared never overwritten, a change of a generated HDL file undone,
// a deletion after the writes, the description's owner fields kept (editorDescription).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { projectDoc, publishProject, docFile, docProject, watchDoc, FILE_MAX } from '../core/collab-doc.js';
import { createFile, deleteFile, renameFile, setDescription, sourceChange, editorDescription, applyEdits, textEditable, editQueue, OWNER_FIELDS } from '../core/collab-files.js';

const PROJECT = { name: 'traffic', version: 1, id: 'p-1', top: 'top', trusted: false, madeBy: 'editor', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], constraints: 'src/top.ucf', device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/top.ucf': 'NET "clk" LOC = "B8";\n', 'src/top.fsm.json': '{"states":[],"generatedFile":"src/top_fsm.vhd"}\n', 'src/top_fsm.vhd': '-- generated\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
// an editor's copy of the owner's document, its changes sent to the owner's as a room does
function pair() {
  const owner = owned(), editor = new Y.Doc();
  Y.applyUpdate(editor, Y.encodeStateAsUpdate(owner), 'remote');
  editor.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(owner, u, 'remote'); });
  return { owner, editor };
}
// the owner's disk, as a store
function disk({ json = { ...PROJECT, trusted: undefined, madeBy: undefined }, files = { ...FILES, 'notes/big.txt': 'x'.repeat(10) } } = {}) {
  const calls = [];
  const d = { json: structuredClone(json), files: { ...files } };
  for (const k of Object.keys(d.json)) if (d.json[k] === undefined) delete d.json[k];
  return {
    d, calls,
    store: {
      read: async () => ({ json: structuredClone(d.json), fileTree: Object.keys(d.files).sort() }),
      write: async (p, t) => { calls.push(['write', p]); d.files[p] = t; },
      remove: async p => { calls.push(['remove', p]); delete d.files[p]; },
      saveJson: async j => { calls.push(['saveJson']); d.json = structuredClone(j); },
      untrust: async () => { calls.push(['untrust']); if (d.json.trusted !== false) Object.assign(d.json, { trusted: false, madeBy: 'editor' }); },
    },
  };
}
// the changes the owner's document received next (watchDoc's)
const nextChange = doc => new Promise(resolve => { const off = watchDoc(doc, ev => { off(); resolve(ev); }); });

test('#4418 createFile, deleteFile, renameFile, setDescription: into the document; their errors', () => {
  const doc = owned();
  createFile(doc, 'src/new.vhd', 'entity n is end;\n');
  assert.equal(docFile(doc, 'src/new.vhd'), 'entity n is end;\n');
  assert.throws(() => createFile(doc, 'src/new.vhd', 'x'), /^Error: src\/new\.vhd: a file of the project already$/);
  assert.throws(() => createFile(doc, '../x.vhd', 'x'), /^Error: \.\.\/x\.vhd: not a path of the project's files$/);
  assert.throws(() => createFile(doc, 'build/x.vhd', 'x'), /not a path of the project's files/);
  assert.throws(() => createFile(doc, 'silinx.json', '{}'), /not a path of the project's files/);
  assert.throws(() => createFile(doc, 'src/huge.vhd', 'x'.repeat(FILE_MAX + 1)), /^Error: src\/huge\.vhd: too large to share \(1 MB at most\)$/);
  renameFile(doc, 'src/new.vhd', 'src/renamed.vhd');
  assert.deepEqual([docFile(doc, 'src/new.vhd'), docFile(doc, 'src/renamed.vhd')], [null, 'entity n is end;\n']);
  assert.throws(() => renameFile(doc, 'src/new.vhd', 'src/x.vhd'), /^Error: src\/new\.vhd: not a file of the project$/);
  assert.throws(() => renameFile(doc, 'src/renamed.vhd', 'src/top.vhd'), /^Error: src\/top\.vhd: a file of the project already$/);
  assert.throws(() => renameFile(doc, 'src/renamed.vhd', '/etc/x'), /not a path of the project's files/);
  deleteFile(doc, 'src/renamed.vhd');
  assert.equal(docFile(doc, 'src/renamed.vhd'), null);
  assert.throws(() => deleteFile(doc, 'src/renamed.vhd'), /^Error: src\/renamed\.vhd: not a file of the project$/);
  setDescription(doc, { ...PROJECT, top: 'other', fileTree: ['x'] });
  assert.equal(docProject(doc).project.top, 'other');
  assert.equal(docProject(doc).project.fileTree, undefined, 'its fileTree left out');
});

test('#4418 sourceChange (the MCP\'s): add (a new file, or one of the room\'s), remove (the file kept), delete, rename; their words and errors', () => {
  const doc = owned();
  const pj = () => docProject(doc).project;
  assert.equal(sourceChange(doc, { action: 'add', path: 'sim/tb_top.vhd', text: 'entity tb is end;\n' }), 'sim/tb_top.vhd added to the project (vhdl, sim).');
  assert.deepEqual(pj().files.at(-1), { path: 'sim/tb_top.vhd', lang: 'vhdl', role: 'sim' });
  assert.equal(sourceChange(doc, { action: 'add', path: 'src/c.v', text: 'module c; endmodule\n' }), 'src/c.v added to the project (verilog, design).');
  assert.equal(sourceChange(doc, { action: 'add', path: 'doc/notes.md', text: '# notes\n' }), 'doc/notes.md added to the project.');
  assert.equal(pj().files.some(f => f.path === 'doc/notes.md'), false, 'no source entry for a file that is no HDL');
  // removed: out of the project, the file kept; added back (the file of the room's)
  assert.equal(sourceChange(doc, { action: 'remove', path: 'src/c.v' }), 'Removed src/c.v from the project (the file is kept in the project folder).');
  assert.equal(pj().files.some(f => f.path === 'src/c.v'), false);
  assert.equal(docFile(doc, 'src/c.v'), 'module c; endmodule\n');
  assert.equal(sourceChange(doc, { action: 'add', path: 'src/c.v' }), 'src/c.v added to the project (verilog, design).');
  // a file in no entry removed: excluded (as Remove from Project does); added back: not excluded
  sourceChange(doc, { action: 'remove', path: 'doc/notes.md' });
  assert.deepEqual(pj().excluded, ['doc/notes.md']);
  sourceChange(doc, { action: 'add', path: 'doc/notes.md' });
  assert.deepEqual(pj().excluded, []);
  // the constraints file: removed, its field emptied; renamed, followed
  assert.equal(sourceChange(doc, { action: 'rename', path: 'src/top.ucf', to: 'src/board.ucf' }), 'src/top.ucf renamed src/board.ucf.');
  assert.equal(pj().constraints, 'src/board.ucf');
  assert.equal(sourceChange(doc, { action: 'rename', path: 'src/c.v', to: 'src/d.v' }), 'src/c.v renamed src/d.v.');
  assert.deepEqual(pj().files.find(f => f.path === 'src/d.v'), { path: 'src/d.v', lang: 'verilog', role: 'design' });
  assert.equal(docFile(doc, 'src/c.v'), null);
  assert.equal(sourceChange(doc, { action: 'delete', path: 'src/d.v' }), 'src/d.v deleted.');
  assert.deepEqual([docFile(doc, 'src/d.v'), pj().files.some(f => f.path === 'src/d.v')], [null, false]);
  sourceChange(doc, { action: 'remove', path: 'src/board.ucf' });
  assert.equal(pj().constraints, '');
  assert.throws(() => sourceChange(doc, { action: 'add', path: 'src/none.vhd' }), /^Error: src\/none\.vhd: not a file of the project \(text: a new file's\)$/);
  assert.throws(() => sourceChange(doc, { action: 'remove', path: 'src/none.vhd' }), /^Error: src\/none\.vhd: not a file of the project$/);
  assert.throws(() => sourceChange(doc, { action: 'rename', path: 'src/top.vhd' }), /^Error: to: the file's new path$/);
  assert.throws(() => sourceChange(doc, { action: 'move', path: 'src/top.vhd' }), /^Error: action: add, remove, delete or rename$/);
  assert.throws(() => sourceChange(projectDoc(), { action: 'add', path: 'a.vhd', text: '' }), /^Error: the shared project has not arrived yet$/);
});

test('#4418 editorDescription: an editor\'s silinx.json, its id, name, origin, trust and version the owner\'s, its paths only the project\'s files\'; not one: null', () => {
  const owner = { name: 'traffic', version: 1, id: 'p-1', origin: { from: 'x' }, top: 'top', files: [] };
  const theirs = { name: 'stolen', version: 9, id: 'p-2', trusted: true, madeBy: 'mcp', top: 'blink', fileTree: ['a'],
    files: [{ path: 'src/a.vhd', lang: 'vhdl' }, { path: '../etc/passwd' }, { path: 'build/x.vhd' }, null, 'src/b.vhd'],
    constraints: '/etc/x.ucf', excluded: ['doc/a.md', '.git/config'], impl: { optMode: 'Area' } };
  assert.deepEqual(editorDescription(owner, JSON.stringify(theirs)), {
    name: 'traffic', version: 1, id: 'p-1', origin: { from: 'x' }, top: 'blink',
    files: [{ path: 'src/a.vhd', lang: 'vhdl' }], constraints: '', excluded: ['doc/a.md'], impl: { optMode: 'Area' },
  });
  // (the owner's trust kept: an untrusted project stays so)
  assert.deepEqual(editorDescription({ name: 'n', trusted: false, madeBy: 'editor' }, '{"trusted":true}'), { name: 'n', trusted: false, madeBy: 'editor' });
  assert.deepEqual(editorDescription({ name: 'n' }, '{"files":"x","excluded":3}'), { name: 'n', files: [], excluded: [] });
  for (const t of ['', 'null', '[]', '"x"', '{']) assert.equal(editorDescription({ name: 'n' }, t), null, t);
  assert.deepEqual(OWNER_FIELDS, ['id', 'name', 'origin', 'trusted', 'madeBy', 'version']);
});

test('#4418 textEditable: a text file no drawing generates, a drawing of no structure yet; not a generated HDL file', () => {
  const doc = owned();
  assert.equal(textEditable(doc, 'src/top.vhd'), true);
  assert.equal(textEditable(doc, 'src/top_fsm.vhd', new Set(['src/top_fsm.vhd'])), false);
  assert.equal(textEditable(doc, 'src/top.fsm.json'), false, 'a drawing edited live: its structure');
  assert.equal(textEditable(doc, 'src/new.fsm.json'), true, 'a drawing just created: its text');
  assert.equal(textEditable(doc, 'doc/a.pdf'), false);
});

test('#4418 applyEdits: an editor\'s new file written through the gate, the project untrusted first; renamed: the new file, then the old one removed; deleted; the description taken', async () => {
  const { owner, editor } = pair();
  const { d, calls, store } = disk();
  let ev = nextChange(owner);
  createFile(editor, 'src/blink.vhd', 'entity blink is end;\r\n');
  let r = await applyEdits(owner, await ev, store);
  assert.deepEqual(r, { written: ['src/blink.vhd'], removed: [], project: false, undone: [], refused: false });
  assert.deepEqual(calls.splice(0), [['untrust'], ['write', 'src/blink.vhd']]);
  assert.equal(typeof d.files['src/blink.vhd'], 'string');
  assert.deepEqual([d.json.trusted, d.json.madeBy], [false, 'editor']);
  // renamed (one change): the new file first, the old one after
  ev = nextChange(owner);
  renameFile(editor, 'src/top.vhd', 'src/main.vhd');
  r = await applyEdits(owner, await ev, store);
  assert.deepEqual([r.written, r.removed], [['src/main.vhd'], ['src/top.vhd']]);
  assert.deepEqual(calls.splice(0), [['untrust'], ['write', 'src/main.vhd'], ['remove', 'src/top.vhd']]);
  assert.equal(d.files['src/main.vhd'], FILES['src/top.vhd']);
  // deleted
  ev = nextChange(owner);
  deleteFile(editor, 'src/blink.vhd');
  r = await applyEdits(owner, await ev, store);
  assert.deepEqual([r.written, r.removed, r.undone], [[], ['src/blink.vhd'], []]);
  assert.deepEqual(calls.splice(0), [['remove', 'src/blink.vhd']]);
  assert.equal('src/blink.vhd' in d.files, false);
  // the description: its fields taken, the owner's id, name, version and trust kept
  ev = nextChange(owner);
  setDescription(editor, { ...PROJECT, name: 'stolen', id: 'p-9', trusted: true, madeBy: null, top: 'main', files: [{ path: 'src/main.vhd', lang: 'vhdl', role: 'design' }] });
  r = await applyEdits(owner, await ev, store);
  assert.equal(r.project, true);
  assert.deepEqual(calls.splice(0), [['untrust'], ['saveJson']]);
  assert.deepEqual([d.json.name, d.json.id, d.json.version, d.json.trusted, d.json.madeBy, d.json.top], ['traffic', 'p-1', 1, false, 'editor', 'main']);
  assert.deepEqual(d.json.files, [{ path: 'src/main.vhd', lang: 'vhdl', role: 'design' }]);
  // the same description again: nothing written
  ev = nextChange(owner);
  setDescription(editor, { ...PROJECT, name: 'x', top: 'main', files: [{ path: 'src/main.vhd', lang: 'vhdl', role: 'design' }], extra: undefined });
  r = await applyEdits(owner, { ...await ev, project: true }, store);
  assert.equal(r.project, false);
  assert.deepEqual(calls, []);
});

test('#4418 applyEdits: what is not taken: a new file over one of the folder that is not shared, a generated HDL file\'s text, a description that is none (undone); what the gate refuses (refused, said, nothing written, still trusted)', async () => {
  const { owner, editor } = pair();
  const { d, calls, store } = disk();
  const warned = [];
  const warn = t => warned.push(t);
  let ev = nextChange(owner);
  createFile(editor, 'notes/big.txt', 'mine\n');
  let r = await applyEdits(owner, await ev, store, { warn });
  assert.deepEqual([r.written, r.undone, r.refused], [[], ['notes/big.txt'], false]);
  assert.equal(d.files['notes/big.txt'], 'x'.repeat(10), 'the file not shared kept');
  ev = nextChange(owner);
  editor.getMap('files').get('src/top_fsm.vhd').insert(0, '-- mine\n');
  r = await applyEdits(owner, await ev, store, { warn, generated: new Set(['src/top_fsm.vhd']) });
  assert.deepEqual(r.undone, ['src/top_fsm.vhd']);
  ev = nextChange(owner);
  editor.getMap('project').set('json', '[1]');
  r = await applyEdits(owner, await ev, store, { warn });
  assert.deepEqual(r.undone, ['silinx.json']);
  // the gate: a NUL byte, an HTML page in an HDL file's name
  ev = nextChange(owner);
  editor.transact(() => { createFile(editor, 'src/zero.vhd', 'a\0b'); createFile(editor, 'src/page.vhd', '<!DOCTYPE html><html></html>'); });
  r = await applyEdits(owner, await ev, store, { warn });
  assert.deepEqual([r.written, r.refused], [[], true]);
  assert.deepEqual(warned, ['src/page.vhd: an editor\'s change not written: a web page (HTML), not the file its name says', 'src/zero.vhd: an editor\'s change not written: binary content (a NUL byte) in a text file']);
  assert.deepEqual(calls, [], 'nothing written, the project not untrusted');
  assert.equal(d.json.trusted, undefined);
  // a rename whose new file the gate refuses: the old file kept (its deletion undone)
  const nul = nextChange(owner);
  editor.getMap('files').get('src/top.vhd').insert(0, '\0');   // (its text, as the owner's document has it, refused)
  await nul;
  warned.length = 0;
  ev = nextChange(owner);
  renameFile(editor, 'src/top.vhd', 'src/main.vhd');
  r = await applyEdits(owner, await ev, store, { warn });
  assert.deepEqual([r.refused, r.removed, r.undone], [true, [], ['src/top.vhd']]);
  assert.equal(d.files['src/top.vhd'], FILES['src/top.vhd'], 'the old file kept');
});

test('#4418 applyEdits: a store that fails: said, refused; a file deleted that the owner has not: nothing', async () => {
  const { owner, editor } = pair();
  const { store } = disk();
  const warned = [];
  let ev = nextChange(owner);
  createFile(editor, 'src/n.vhd', 'entity n is end;\n');
  let r = await applyEdits(owner, await ev, { ...store, write: async () => { throw new Error('disk full'); } }, { warn: t => warned.push(t) });
  assert.deepEqual([r.written, r.refused, warned], [[], true, ['src/n.vhd: an editor\'s change not written: disk full']]);
  r = await applyEdits(owner, { changes: [{ path: 'src/gone.vhd', kind: 'deleted' }], project: false }, store);
  assert.deepEqual(r.removed, []);
});

test('#4418 editQueue: each change applied after the one before; published again once none waits (a deletion still waiting never put back); again() after them; a failed apply publishes', async () => {
  const log = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = editQueue(async (ev) => { log.push(`apply ${ev}`); if (ev === 1) await gate; return ev !== 3; }, async () => { log.push('publish'); });
  q.push(1); q.push(2);
  q.again();
  assert.equal(q.busy(), true);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log, ['apply 1'], 'the second waits for the first');
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log, ['apply 1', 'apply 2', 'publish'], 'published once, after both');
  assert.equal(q.busy(), false);
  q.push(3);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log.slice(3), ['apply 3'], 'nothing to publish');
  q.again();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log.slice(4), ['publish'], 'again(), idle: now');
  const q2 = editQueue(async () => { throw new Error('x'); }, async () => { log.push('published'); });
  q2.push(1);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(log.at(-1), 'published');
});

// The project history (web/js/history.js: Undo / Redo of the project's commands) on an in-memory
// backend: a command's writes, deletions, renames and settings undone and redone as one step; nested
// commands; the documents' saves and the build folder left out; files changed since: asked first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../web/js/history.js';

function backend() {
  const files = new Map([['src/a.vhd', 'A'], ['src/b.v', 'B'], ['lib/x.vhd', 'X'], ['lib/y.vhd', 'Y']]);
  let pj = { name: 'P', top: 'a', files: ['src/a.vhd', 'src/b.v'] };
  const api = {
    readFile: async (n, p) => { if (!files.has(p)) throw new Error('not found'); return files.get(p); },
    writeFile: async (n, p, t) => { files.set(p, t); },
    deleteFile: async (n, p) => { for (const k of [...files.keys()]) if (k === p || k.startsWith(`${p}/`)) files.delete(k); pj.files = pj.files.filter(f => f !== p); },
    renameFile: async (n, from, to) => {
      for (const k of [...files.keys()]) if (k === from || k.startsWith(`${from}/`)) { files.set(to + k.slice(from.length), files.get(k)); files.delete(k); }
      pj.files = pj.files.map(f => (f === from ? to : f));
    },
    saveProject: async (n, p) => { pj = structuredClone(p); return pj; },
    project: async () => ({ ...structuredClone(pj), fileTree: [...files.keys()] }),
  };
  return { api, files, pj: () => pj };
}
function setup(extra = {}) {
  const b = backend();
  const log = [];
  const h = createHistory(b.api, {
    project: () => 'P', files: () => [...b.files.keys()],
    flush: async () => {}, restored: async (e, paths) => log.push([e.label, paths.sort()]), ...extra,
  });
  return { ...b, h, log };
}

test('a command\'s writes, deletion and settings: one Undo step, then Redo', async () => {
  const { api, files, pj, h, log } = setup();
  await h.run('Rename…', async () => {
    await api.writeFile('P', 'src/a.vhd', 'A2');
    await api.writeFile('P', 'src/new.vhd', 'N');
    await api.deleteFile('P', 'src/b.v');
    await api.saveProject('P', { ...pj(), top: 'new' });
  });
  assert.equal(h.undoLabel(), 'Rename');
  assert.ok(h.canUndo() && !h.canRedo());
  await h.undo();
  assert.deepEqual(Object.fromEntries(files), { 'src/a.vhd': 'A', 'src/b.v': 'B', 'lib/x.vhd': 'X', 'lib/y.vhd': 'Y' });
  assert.deepEqual(pj(), { name: 'P', top: 'a', files: ['src/a.vhd', 'src/b.v'] });
  assert.deepEqual(log, [['Rename', ['src/a.vhd', 'src/b.v', 'src/new.vhd']]]);
  assert.equal(h.redoLabel(), 'Rename');
  await h.redo();
  assert.equal(files.get('src/a.vhd'), 'A2');
  assert.equal(files.get('src/new.vhd'), 'N');
  assert.equal(files.has('src/b.v'), false);
  assert.equal(pj().top, 'new');
});

test('a folder renamed or deleted (its files), and the settings the backend changes with it', async () => {
  const { api, files, pj, h } = setup();
  await h.run('Rename Folder', () => api.renameFile('P', 'lib', 'rtl'));
  assert.deepEqual([...files.keys()].sort(), ['rtl/x.vhd', 'rtl/y.vhd', 'src/a.vhd', 'src/b.v']);
  await h.undo();
  assert.deepEqual([...files.keys()].sort(), ['lib/x.vhd', 'lib/y.vhd', 'src/a.vhd', 'src/b.v']);
  // deleteFile also unregisters the file (the server does): the settings come back too
  await h.run('Delete', () => api.deleteFile('P', 'src/b.v'));
  assert.deepEqual(pj().files, ['src/a.vhd']);
  await h.undo();
  assert.deepEqual(pj().files, ['src/a.vhd', 'src/b.v']);
  assert.equal(files.get('src/b.v'), 'B');
});

test('nested commands make one step; no change, no step; a new command clears Redo; the build folder and the documents\' saves are left out', async () => {
  const { api, files, h } = setup();
  await h.run('Outer', async () => { await api.writeFile('P', 'src/a.vhd', '1'); await h.run('Inner', () => api.writeFile('P', 'src/b.v', '2')); });
  assert.equal(h.undoLabel(), 'Outer');
  await h.run('Nothing', async () => {});
  assert.equal(h.undoLabel(), 'Outer');
  await h.undo();
  assert.deepEqual([files.get('src/a.vhd'), files.get('src/b.v')], ['A', 'B']);
  assert.ok(h.canRedo());
  await h.run('Build', async () => { await api.writeFile('P', 'build/top.bit', 'bits'); await h.unrecorded(() => api.writeFile('P', 'src/a.vhd', 'typed')); });
  assert.equal(h.undoLabel(), null, 'nothing recorded');
  assert.ok(h.canRedo(), 'and Redo kept');
  await h.run('Edit', () => api.writeFile('P', 'src/b.v', '3'));
  assert.ok(!h.canRedo());
  await h.undo();
  assert.equal(files.get('src/a.vhd'), 'typed', 'the document\'s save is not undone');
});

test('an Undo clicked while the command is still running waits for it; files changed since: asked first', async () => {
  let release;
  const asked = [];
  let answer = false;
  const { api, files, h } = setup({ before: async (changed) => { asked.push(changed); return answer; } });
  const running = h.run('Slow', async () => { await api.writeFile('P', 'src/a.vhd', 'S'); await new Promise(r => { release = r; }); });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(h.undoLabel(), 'Slow', 'shown as soon as it runs');
  const undone = h.undo();
  release();
  await running;
  assert.equal((await undone).label, 'Slow');
  assert.equal(files.get('src/a.vhd'), 'A');
  // changed since the Redo would apply: refused when the user says no, done when yes
  await files.set('src/a.vhd', 'edited elsewhere');
  assert.equal(await h.redo(), null);
  assert.deepEqual(asked, [['src/a.vhd']]);
  assert.equal(files.get('src/a.vhd'), 'edited elsewhere');
  answer = true;
  assert.equal((await h.redo()).label, 'Slow');
  assert.equal(files.get('src/a.vhd'), 'S');
});

test('another project: the history starts again', async () => {
  let name = 'P';
  const b = backend();
  const h = createHistory(b.api, { project: () => name, files: () => [...b.files.keys()] });
  await h.run('Edit', () => b.api.writeFile('P', 'src/a.vhd', 'x'));
  assert.ok(h.canUndo());
  name = 'Q';
  assert.ok(!h.canUndo(), 'not the open project\'s');
  await h.run('Other', async () => {});
  name = 'P';
  assert.ok(!h.canUndo(), 'cleared when another project ran a command');
});

test('a command run while an Undo is still writing: the stacks stay right (the Undo does not take the new command\'s step)', async () => {
  let release = null;
  const b = backend();
  const h = createHistory(b.api, {
    project: () => 'P', files: () => [...b.files.keys()],
    restored: async () => { if (release === null) await new Promise(r => { release = r; }); },
  });
  assert.equal(h.busy(), false);
  await h.run('First', () => b.api.writeFile('P', 'src/a.vhd', '1'));
  const undoing = h.undo();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(h.busy(), true, 'the Undo is writing');
  assert.equal(h.redoLabel(), 'First', 'already on the redo stack');
  await h.run('Second', () => b.api.writeFile('P', 'src/b.v', '2'));
  release();
  assert.equal((await undoing).label, 'First');
  assert.equal(h.undoLabel(), 'Second');
  assert.equal(h.redoLabel(), null, 'the new command cleared Redo');
  await h.undo();
  assert.equal(b.files.get('src/b.v'), 'B');
  assert.equal(b.files.get('src/a.vhd'), 'A');
});

test('#4817 settled: nothing running nor finishing; an Undo while a command that changed nothing finishes undoes nothing', async () => {
  let slow = null;
  const b = backend();
  const project = b.api.project;
  b.api.project = async (...a) => { if (slow) await slow; return project(...a); };
  const h = createHistory(b.api, { project: () => 'P', files: () => [...b.files.keys()] });
  assert.equal(h.settled(), true);
  await h.run('Design Properties', () => b.api.saveProject('P', { ...b.pj(), top: 'b' }));
  assert.equal(h.settled(), true);
  await new Promise(r => setTimeout(r, 5));   // (another millisecond: a step is known by its time)
  // a dialog cancelled: a command that changes nothing, its end (the settings read again) slow
  let go;
  slow = new Promise(r => { go = r; });
  const cancelled = h.run('Design Properties', () => {});
  await new Promise(r => setTimeout(r, 10));
  assert.equal(h.settled(), false, 'finishing');
  const swallowed = h.undo();
  go();
  await cancelled;
  assert.equal(await swallowed, null, 'waited for the cancelled one, which changed nothing');
  assert.equal(b.pj().top, 'b');
  assert.equal(h.settled(), true);
  // settled: the Undo undoes the last step
  slow = null;
  assert.equal((await h.undo()).label, 'Design Properties');
  assert.equal(b.pj().top, 'a');
});

test('#5263 a command started while the one before finishes: an Undo clicked during it waits for it and undoes it', async () => {
  let slow = null;
  const b = backend();
  const project = b.api.project;
  b.api.project = async (...a) => { if (slow) await slow; return project(...a); };
  // (the settings as a command starts: the page's, at once, as web/js/app.js gives them)
  const h = createHistory(b.api, { project: () => 'P', files: () => [...b.files.keys()], settings: () => JSON.stringify(b.pj()) });
  // New Source: its end (the settings read again) slow
  let go;
  slow = new Promise(r => { go = r; });
  const first = h.run('New Source', () => b.api.writeFile('P', 'src/new.vhd', 'N'));
  await new Promise(r => setTimeout(r, 5));
  // Remove from Project started meanwhile (its dialog open), ended once New Source has
  let confirm;
  const asked = new Promise(r => { confirm = r; });
  const second = h.run('Remove from Project', async () => { await asked; await b.api.saveProject('P', { ...b.pj(), files: ['src/a.vhd'] }); });
  slow = null;
  go();
  await first;
  assert.equal(h.undoLabel(), 'Remove from Project');
  assert.equal(h.settled(), false, 'the removal still running');
  // Undo clicked as the dialog closes: it waits for the removal and undoes it, not nothing
  const undone = h.undo();
  confirm();
  await second;
  assert.equal((await undone)?.label, 'Remove from Project');
  assert.deepEqual(b.pj().files, ['src/a.vhd', 'src/b.v']);
  assert.equal(h.undoLabel(), 'New Source');
  assert.equal(h.settled(), true);
});

// (#5739) a project shared live with editors: the step merged into the project as it is now, through the api as it is
// then (a shared project's: into the shared document), the others' later changes kept; an overlap refused, said
test('a shared project: Undo / Redo revert the command\'s own changes only, the others\' later ones kept; an overlap refused', async () => {
  const { mergeStep } = await import('../core/history-merge.js');
  const said = [], regenerated = [];
  const { api, files, pj, h, log } = setup({ shared: () => true, merge: mergeStep, conflict: (e, side, c) => said.push([e.label, side, c.map(x => x.path)]), regenerate: async p => regenerated.push(...p) });
  files.set('src/a.vhd', 'one\ntwo\nthree\n');
  await h.run('Rename…', async () => {
    await api.writeFile('P', 'src/a.vhd', 'ONE\ntwo\nthree\n');
    await api.saveProject('P', { ...pj(), top: 'new' });
  });
  // what another participant writes meanwhile (the shared project's api: replaced while it is shared)
  const shared = api.writeFile;
  const through = [];
  api.writeFile = async (n, p, t) => { through.push(p); return shared(n, p, t); };
  files.set('src/a.vhd', 'ONE\ntwo\nthree, an editor\'s\n');
  await h.undo();
  assert.equal(files.get('src/a.vhd'), 'one\ntwo\nthree, an editor\'s\n');
  assert.equal(pj().top, 'a');
  assert.deepEqual([through, log, said, regenerated], [['src/a.vhd'], [['Rename', ['src/a.vhd']]], [], []]);
  await h.redo();
  assert.equal(files.get('src/a.vhd'), 'ONE\ntwo\nthree, an editor\'s\n');
  assert.equal(pj().top, 'new');
  // the same line changed since: refused, nothing written, the step still the one to undo
  files.set('src/a.vhd', 'ONE, an editor\'s\ntwo\nthree, an editor\'s\n');
  assert.equal(await h.undo(), null);
  assert.deepEqual(said, [['Rename', 'before', ['src/a.vhd']]]);
  assert.equal(files.get('src/a.vhd'), 'ONE, an editor\'s\ntwo\nthree, an editor\'s\n');
  assert.equal(pj().top, 'new');
  assert.ok(h.canUndo() && !h.canRedo());
  assert.equal(h.undoLabel(), 'Rename');
});

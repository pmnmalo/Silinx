// An Undo / Redo of a project's command merged into the project as it is now (core/history-merge.js, #5739): in a
// project shared live with editors, only the command's own changes are reverted (or made again), the others' later
// changes stay; where they overlap, nothing is written and the conflicts are said. On the traffic example: a text file
// by its lines, a file the command created or deleted, a renamed file's later changes carried back, a drawing by its
// objects, silinx.json by its fields; the result compared with the text an independent edit gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mergeStep, conflictsLine } from '../core/history-merge.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'traffic');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PJ = JSON.parse(read('silinx.json'));
const T = 'src/timer.vhd', F = 'src/traffic.fsm.json';
const TIMER = read(T);
const lines = t => t.split('\n');
// the text with its line i (0-based) replaced
const withLine = (t, i, s) => { const l = lines(t); l[i] = s; return l.join('\n'); };
const json = o => `${JSON.stringify(o, null, 2)}\n`;
const fsm = (edit = () => {}) => { const d = JSON.parse(read(F)); edit(d); return json(d); };
// a step of web/js/history.js: its files' texts before and after, its settings' (unchanged: null)
const step = (files, settings = null) => ({ label: 'Change', files: Object.entries(files).map(([p, [before, after]]) => ({ path: p, before, after })), settings: settings && { before: JSON.stringify(settings[0]), after: JSON.stringify(settings[1]) } });

test('a text file: the command\'s line reverted, another participant\'s later line kept; Redo makes it again', async () => {
  const after = withLine(TIMER, 0, '-- renamed by the command');
  const s = step({ [T]: [TIMER, after] });
  const now = withLine(after, 10, '-- an editor\'s line');
  const m = await mergeStep(s, 'before', { json: PJ, files: { [T]: now } });
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.write, { [T]: withLine(TIMER, 10, '-- an editor\'s line') });
  assert.deepEqual([m.remove, m.json, m.regenerate], [[], null, []]);
  // Redo: from the project the Undo left, the command's line again, the editor's still there
  const r = await mergeStep(s, 'after', { json: PJ, files: { [T]: m.write[T] } });
  assert.deepEqual(r.write, { [T]: now });
  // nobody changed it since: the plain Undo
  assert.deepEqual((await mergeStep(s, 'before', { json: PJ, files: { [T]: after } })).write, { [T]: TIMER });
});

test('a text file: a later change of the same lines is a conflict, nothing written', async () => {
  const after = withLine(TIMER, 0, '-- renamed by the command');
  const m = await mergeStep(step({ [T]: [TIMER, after] }), 'before', { json: PJ, files: { [T]: withLine(after, 0, '-- an editor changed it again') } });
  assert.deepEqual([m.write, m.remove, m.json], [{}, [], null]);
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].path, T);
  assert.equal(conflictsLine(m.conflicts), T);
});

test('a file the command created: removed by its Undo when nobody changed it, a conflict when someone did; one it deleted: back', async () => {
  const N = 'src/new.vhd', text = '-- new\nentity x is end;\n';
  const s = step({ [N]: [null, text] });
  assert.deepEqual(await mergeStep(s, 'before', { json: PJ, files: { [N]: text } }), { write: {}, remove: [N], json: null, regenerate: [], conflicts: [] });
  const c = await mergeStep(s, 'before', { json: PJ, files: { [N]: `${text}-- an editor's line\n` } });
  assert.deepEqual([c.remove, c.conflicts.map(x => x.path)], [[], [N]]);
  // already gone (another participant deleted it): nothing to do
  assert.deepEqual((await mergeStep(s, 'before', { json: PJ, files: { [N]: null } })).remove, []);
  const d = await mergeStep(step({ [T]: [TIMER, null] }), 'before', { json: PJ, files: { [T]: null } });
  assert.deepEqual([d.write, d.conflicts], [{ [T]: TIMER }, []]);
});

test('a renamed file: its Undo carries the changes made since to its old path', async () => {
  const R = 'src/clock_timer.vhd';
  const s = step({ [T]: [TIMER, null], [R]: [null, TIMER] });
  const edited = withLine(TIMER, 10, '-- an editor\'s line');
  const m = await mergeStep(s, 'before', { json: PJ, files: { [T]: null, [R]: edited } });
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual([m.write, m.remove], [{ [T]: edited }, [R]]);
});

test('a drawing: the command\'s object reverted, another object changed since kept; the same object a conflict', async () => {
  const after = fsm(d => { d.states[0].x += 40; });
  const s = step({ [F]: [read(F), after] });
  const now = fsm(d => { d.states[0].x += 40; d.transitions[0].cond = 'night or req'; });
  const m = await mergeStep(s, 'before', { json: PJ, files: { [F]: now } });
  assert.deepEqual(m.conflicts, []);
  const d = JSON.parse(m.write[F]);
  assert.equal(d.states[0].x, JSON.parse(read(F)).states[0].x);
  assert.equal(d.transitions[0].cond, 'night or req');
  assert.deepEqual(m.regenerate, [F]);
  const c = await mergeStep(s, 'before', { json: PJ, files: { [F]: fsm(d => { d.states[0].x += 90; }) } });
  assert.deepEqual([c.write, c.conflicts], [{}, [{ path: F, id: `states/${JSON.parse(read(F)).states[0].id}` }]]);
});

test('silinx.json: the command\'s field reverted, a field changed since kept (and the project\'s own name, id, trust); the same field a conflict', async () => {
  const before = { ...PJ }, after = { ...PJ, top: 'traffic' };
  const s = step({}, [before, after]);
  const now = { ...after, board: 'nexys2', id: 'p1', trusted: false };
  const m = await mergeStep(s, 'before', { json: now, files: {} });
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.json, { ...PJ, board: 'nexys2', id: 'p1', trusted: false });
  const c = await mergeStep(s, 'before', { json: { ...after, top: 'lamps' }, files: {} });
  assert.deepEqual([c.json, c.conflicts], [null, [{ path: 'silinx.json', field: 'top' }]]);
  assert.equal(conflictsLine(c.conflicts), 'silinx.json (top)');
  // unchanged since: the field back, nothing else
  assert.deepEqual((await mergeStep(s, 'before', { json: after, files: {} })).json, before);
});

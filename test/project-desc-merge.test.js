// A project's description changed by the page and meanwhile by someone else (#4726, core/project-desc-merge.js): the
// page's change merged into the current one, three ways: a field, a plain object's key, a file by its path, a name of
// a list; both changing one thing, the page's wins; what the server only sends (fileTree) left out; and against an
// independent reference (a brute-force rule per path of the description) on random changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDescription } from '../core/project-desc-merge.js';

const f = (path, role = 'design') => ({ path, lang: 'vhdl', role });
const BASE = {
  name: 'p', device: 'xc3s100e-cp132', top: 'a', simTop: null, files: [f('src/a.vhd'), f('src/b.vhd')],
  excluded: ['old/x.vhd'], sourceLanguage: { 'src/a.sch': 'vhdl' }, processProps: { synth: { effort: 'normal' } },
};
const clone = o => structuredClone(o);

test('a file the MCP registered meanwhile is kept when the page sets the top', () => {
  const mine = { ...clone(BASE), top: 'b' };
  const theirs = { ...clone(BASE), files: [...BASE.files, f('src/new.vhd')] };
  const out = mergeDescription(BASE, mine, theirs);
  assert.equal(out.top, 'b');
  assert.deepEqual(out.files.map(e => e.path), ['src/a.vhd', 'src/b.vhd', 'src/new.vhd']);
});

test('files: added or removed on either side, a role changed on one, both kept; theirs\' order, then the page\'s new ones', () => {
  const mine = { ...clone(BASE), files: [f('src/a.vhd', 'sim'), f('src/mine.vhd')] };   // b removed, a's role changed, mine added
  const theirs = { ...clone(BASE), files: [f('src/theirs.vhd'), f('src/b.vhd'), f('src/a.vhd')] };   // theirs added, reordered
  assert.deepEqual(mergeDescription(BASE, mine, theirs).files, [f('src/theirs.vhd'), f('src/a.vhd', 'sim'), f('src/mine.vhd')]);
  // removed meanwhile, untouched by the page: gone
  assert.deepEqual(mergeDescription(BASE, clone(BASE), { ...clone(BASE), files: [f('src/b.vhd')] }).files, [f('src/b.vhd')]);
  // removed meanwhile, changed by the page: the page's kept
  assert.deepEqual(mergeDescription(BASE, { ...clone(BASE), files: [f('src/a.vhd', 'sim'), f('src/b.vhd')] }, { ...clone(BASE), files: [f('src/b.vhd')] }).files,
    [f('src/b.vhd'), f('src/a.vhd', 'sim')]);
});

test('excluded, a list of names: name by name', () => {
  const mine = { ...clone(BASE), excluded: ['old/x.vhd', 'src/b.vhd'] };   // Remove from Project
  const theirs = { ...clone(BASE), excluded: [] };   // the MCP wrote old/x.vhd again: back in the project
  assert.deepEqual(mergeDescription(BASE, mine, theirs).excluded, ['src/b.vhd']);
});

test('a plain object key by key, nested; a field both changed: the page\'s; a field removed by one side', () => {
  const mine = { ...clone(BASE), sourceLanguage: { 'src/a.sch': 'verilog' }, processProps: { synth: { effort: 'high' } }, device: 'xc3s250e-cp132' };
  const theirs = { ...clone(BASE), sourceLanguage: { 'src/a.sch': 'vhdl', 'src/c.fsm': 'vhdl' }, processProps: { synth: { effort: 'normal', keep: true } }, device: 'xc3s500e-fg320' };
  const out = mergeDescription(BASE, mine, theirs);
  assert.deepEqual(out.sourceLanguage, { 'src/a.sch': 'verilog', 'src/c.fsm': 'vhdl' });
  assert.deepEqual(out.processProps, { synth: { effort: 'high', keep: true } });
  assert.equal(out.device, 'xc3s250e-cp132');
  // a field the page removed: gone; one they removed and the page left: gone; one they added: kept
  const m2 = clone(BASE); delete m2.simTop;
  const t2 = { ...clone(BASE), board: 'basys2' }; delete t2.processProps;
  const o2 = mergeDescription(BASE, m2, t2);
  assert.ok(!('simTop' in o2) && !('processProps' in o2));
  assert.equal(o2.board, 'basys2');
});

test('nothing changed by the page: theirs as it is; nothing changed meanwhile: the page\'s; fileTree left out', () => {
  const theirs = { ...clone(BASE), top: 'b', files: [f('src/z.vhd')] };
  assert.deepEqual(mergeDescription(BASE, { ...clone(BASE), fileTree: [] }, theirs), theirs);
  const mine = { ...clone(BASE), top: 'b', fileTree: [{ path: 'src' }] };
  const out = mergeDescription({ ...BASE, fileTree: [] }, mine, clone(BASE));
  assert.ok(!('fileTree' in out));
  assert.deepEqual(out, { ...clone(BASE), top: 'b' });
  // no base at all (a page that never read it): its own fields over theirs
  assert.equal(mergeDescription(undefined, { top: 'b' }, clone(BASE)).top, 'b');
});

// an independent reference: every leaf path of the three (files by path, names by name), decided one by one
function leaves(pj, pre = '', out = new Map()) {
  for (const [k, v] of Object.entries(pj)) {
    if (k === 'files') for (const e of v) out.set(`files[${e.path}]`, JSON.stringify(e));
    else if (k === 'excluded') for (const e of v) out.set(`excluded[${e}]`, '1');
    else if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, `${pre}${k}.`, out);
    else out.set(pre + k, JSON.stringify(v));
  }
  return out;
}
function reference(base, mine, theirs) {
  const b = leaves(base), m = leaves(mine), t = leaves(theirs), out = new Map();
  for (const k of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
    const v = m.get(k) === b.get(k) ? t.get(k) : m.get(k);
    if (v !== undefined) out.set(k, v);
  }
  return out;
}
const sorted = m => [...m].sort((a, b) => a[0].localeCompare(b[0]));

test('random changes on both sides: the same leaves as the reference', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const change = pj => {
    const o = clone(pj);
    for (let i = rnd(4); i >= 0; i--) {
      switch (rnd(6)) {
        case 0: o.top = ['a', 'b', 'c'][rnd(3)]; break;
        case 1: o.files.push(f(`src/n${rnd(5)}.vhd`)); o.files = [...new Map(o.files.map(e => [e.path, e])).values()]; break;
        case 2: o.files.splice(rnd(o.files.length + 1), 1); break;
        case 3: if (o.files.length) o.files[rnd(o.files.length)] = { ...o.files[0], role: 'sim' }; o.files = [...new Map(o.files.map(e => [e.path, e])).values()]; break;
        case 4: o.excluded = rnd(2) ? [...new Set([...o.excluded, `x${rnd(3)}`])] : o.excluded.slice(1); break;
        default: o.processProps.synth[['effort', 'keep'][rnd(2)]] = rnd(3);
      }
    }
    return o;
  };
  for (let n = 0; n < 300; n++) {
    const mine = change(BASE), theirs = change(BASE);
    assert.deepEqual(sorted(leaves(mergeDescription(BASE, mine, theirs))), sorted(reference(BASE, mine, theirs)), `case ${n}`);
  }
});

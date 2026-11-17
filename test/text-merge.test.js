// A text file's three-way merge by lines (#4214, core/text-merge.js): diff3's cases (a change on one side, changes on
// both sides apart, overlapping, identical, at the end of the file, CRLF line ends, no ancestor), the conflicts'
// resolutions (Mine, Theirs, Both, a text of the user's), a rename found, and every HDL file of the repository's
// designs merged with itself (nothing changed, no conflict). The clean merges are checked against git merge-file's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mergeText, resolveText, textConflicts, checkTextChoice, similarity, findRenames } from '../core/text-merge.js';

const ROOT = path.join(import.meta.dirname, '..');
const L = (...l) => `${l.join('\n')}\n`;
const BASE = L('library ieee;', 'use ieee.std_logic_1164.all;', '', 'entity t is', '  port (a, b : in std_logic;', '        y : out std_logic);', 'end t;', '',
  'architecture rtl of t is', 'begin', '  y <= a and b;', 'end rtl;');
const edit = (text, i, ...lines) => { const l = text.split('\n'); l.splice(i, 1, ...lines); return l.join('\n'); };

// git merge-file's result (an independent reference): { text, conflicts } — null when git is not there
const GIT = spawnSync('git', ['--version']).status === 0;
function gitMerge(base, mine, theirs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-merge-'));
  try {
    for (const [f, t] of [['mine', mine], ['base', base], ['theirs', theirs]]) fs.writeFileSync(path.join(dir, f), t);
    const r = spawnSync('git', ['merge-file', '-p', 'mine', 'base', 'theirs'], { cwd: dir, encoding: 'utf8' });
    return { text: r.stdout, conflicts: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function clean(base, mine, theirs, expected) {
  const m = mergeText(base, mine, theirs);
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.text, expected);
  if (GIT) assert.deepEqual(gitMerge(base, mine, theirs), { text: expected, conflicts: 0 }, 'git merge-file merges it alike');
  return m;
}

test('a change on one side only is taken from that side', () => {
  const mine = edit(BASE, 10, '  y <= a or b;');
  const m = clean(BASE, mine, BASE, mine);
  assert.deepEqual(m.hunks.map(h => h.kind), ['same', 'mine', 'same']);
  assert.deepEqual(m.hunks[1], { kind: 'mine', base: ['  y <= a and b;'], mine: ['  y <= a or b;'], theirs: ['  y <= a and b;'], at: { base: 11, mine: 11, theirs: 11 } });
  clean(BASE, BASE, mine, mine);
  clean(BASE, BASE, BASE, BASE);
});

test('changes on both sides apart are both taken', () => {
  const mine = edit(BASE, 0, '-- mine: a comment', 'library ieee;');
  const theirs = edit(BASE, 10, '  y <= a xor b;');
  const m = clean(BASE, mine, theirs, edit(mine, 11, '  y <= a xor b;'));
  assert.deepEqual(m.hunks.map(h => h.kind), ['mine', 'same', 'theirs', 'same']);
  // a line removed here, one added there
  clean(BASE, edit(BASE, 2), edit(BASE, 9, 'begin', '  -- theirs'), edit(edit(BASE, 9, 'begin', '  -- theirs'), 2));
});

test('changes that overlap are a conflict, resolved by Mine, Theirs, Both or a text', () => {
  const mine = edit(BASE, 10, '  y <= a or b;'), theirs = edit(BASE, 10, '  y <= a xor b;');
  const m = mergeText(BASE, mine, theirs);
  assert.deepEqual(m.conflicts, ['h1']);
  assert.equal(m.text, null, 'no text while a conflict is left (never conflict markers)');
  assert.deepEqual(m.hunks[1], { kind: 'conflict', id: 'h1', base: ['  y <= a and b;'], mine: ['  y <= a or b;'], theirs: ['  y <= a xor b;'], at: { base: 11, mine: 11, theirs: 11 } });
  assert.equal(resolveText(m, { h1: 'mine' }), mine);
  assert.equal(resolveText(m, { h1: 'theirs' }), theirs);
  assert.equal(resolveText(m, { h1: 'both' }), edit(BASE, 10, '  y <= a or b;', '  y <= a xor b;'));
  assert.equal(resolveText(m, { h1: { text: '  y <= not (a and b);\n' } }), edit(BASE, 10, '  y <= not (a and b);'));
  assert.equal(resolveText(m, { h1: { text: '' } }), edit(BASE, 10), 'a text of no line removes the hunk');
  assert.throws(() => resolveText(m, {}), { message: 'not every conflict is resolved: h1', status: 400, left: ['h1'] });
  assert.throws(() => resolveText(m, { h1: 'base' }), { left: ['h1'] });
  if (GIT) assert.equal(gitMerge(BASE, mine, theirs).conflicts, 1, 'git merge-file finds it too');
  // (changes that touch: git's merge has them a conflict too)
  const t = mergeText(BASE, edit(BASE, 10, '  y <= a or b;'), edit(BASE, 11, 'end architecture;'));
  assert.deepEqual(t.conflicts, ['h1']);
  assert.deepEqual(t.hunks[1].base, ['  y <= a and b;', 'end rtl;']);
  assert.deepEqual(t.hunks[1].mine, ['  y <= a or b;', 'end rtl;']);
  assert.deepEqual(t.hunks[1].theirs, ['  y <= a and b;', 'end architecture;']);
  // two conflicts, numbered in order
  const two = mergeText(BASE, edit(edit(BASE, 10, 'x1'), 3, 'entity u is'), edit(edit(BASE, 10, 'x2'), 3, 'entity v is'));
  assert.deepEqual(two.conflicts, ['h1', 'h2']);
  assert.deepEqual(two.hunks.filter(h => h.id).map(h => h.at.mine), [4, 11]);
});

test('the same change on both sides is taken once', () => {
  const both = edit(BASE, 10, '  y <= a or b;');
  const m = clean(BASE, both, both, both);
  assert.deepEqual(m.hunks.map(h => h.kind), ['same', 'both', 'same']);
  // the same lines added on both sides, and more apart
  clean(BASE, edit(both, 0, '-- header', 'library ieee;'), both, edit(both, 0, '-- header', 'library ieee;'));
});

test('at the end of the file: lines added on both sides conflict; one side\'s taken; the final newline merged', () => {
  const mine = `${BASE}-- mine\n`, theirs = `${BASE}-- theirs\n`;
  const m = mergeText(BASE, mine, theirs);
  assert.deepEqual(m.hunks.at(-1), { kind: 'conflict', id: 'h1', base: [], mine: ['-- mine'], theirs: ['-- theirs'], at: { base: 13, mine: 13, theirs: 13 } });
  assert.equal(resolveText(m, { h1: 'both' }), `${BASE}-- mine\n-- theirs\n`);
  clean(BASE, mine, BASE, mine);
  // the final newline taken off on one side, a line changed on the other
  const noFinal = BASE.slice(0, -1), theirs2 = edit(BASE, 0, '-- theirs', 'library ieee;');
  clean(BASE, noFinal, theirs2, theirs2.slice(0, -1));
  // the last line removed here, the first changed there
  clean(BASE, L(...BASE.split('\n').slice(0, -2)), theirs2, L(...theirs2.split('\n').slice(0, -2)));
  // empty files
  clean('', 'a\n', '', 'a\n');
  assert.deepEqual(mergeText('', 'a\n', 'b\n').conflicts, ['h1']);
  clean('a\n', '', 'a\n', '');
});

test('CRLF: a side that changed the line ends only changes them; the lines compared without their CR', () => {
  const crlf = s => s.replace(/\n/g, '\r\n');
  const theirs = edit(BASE, 10, '  y <= a or b;');
  // here, CRLF throughout; there, a line changed: CRLF and the change
  let m = mergeText(BASE, crlf(BASE), theirs);
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.text, crlf(theirs));
  assert.equal(m.eol, '\r\n');
  // a file in CRLF on every side, changed apart
  const mine = edit(BASE, 0, '-- mine', 'library ieee;');
  m = mergeText(crlf(BASE), crlf(mine), crlf(theirs));
  assert.equal(m.text, crlf(edit(mine, 11, '  y <= a or b;')));
  if (GIT) assert.deepEqual(gitMerge(crlf(BASE), crlf(mine), crlf(theirs)), { text: m.text, conflicts: 0 });
  // a conflict's lines given without their CR, the resolution written in CRLF
  m = mergeText(crlf(BASE), crlf(edit(BASE, 10, 'x1')), crlf(edit(BASE, 10, 'x2')));
  assert.deepEqual(m.hunks[1].mine, ['x1']);
  assert.equal(resolveText(m, { h1: { text: 'x3\r\nx4' } }), crlf(edit(BASE, 10, 'x3', 'x4')));
});

test('with no ancestor (a two-way merge) every difference is a conflict', () => {
  const mine = edit(BASE, 0, '-- mine', 'library ieee;'), theirs = edit(BASE, 10, '  y <= a or b;');
  const m = mergeText(null, mine, theirs);
  assert.deepEqual(m.conflicts, ['h1', 'h2']);
  assert.deepEqual(m.hunks.filter(h => h.id).map(h => [h.mine, h.theirs, h.base, h.at.base]), [[['-- mine'], [], [], null], [['  y <= a and b;'], ['  y <= a or b;'], [], null]]);
  assert.equal(resolveText(m, { h1: 'mine', h2: 'theirs' }), edit(mine, 11, '  y <= a or b;'));
  assert.equal(resolveText(m, { h1: 'theirs', h2: 'mine' }), BASE);
  assert.equal(mergeText(null, BASE, BASE).text, BASE);
});

test('textConflicts: a file\'s conflicts as a pull and the MCP give them; the resolution\'s values', () => {
  const r = textConflicts('src/t.vhd', BASE, edit(BASE, 10, 'x1'), edit(BASE, 10, 'x2'));
  assert.deepEqual(r, { path: 'src/t.vhd', hunks: [{ id: 'h1', base: ['  y <= a and b;'], mine: ['x1'], theirs: ['x2'], at: { base: 11, mine: 11, theirs: 11 } }] });
  assert.deepEqual(textConflicts('src/t.vhd', BASE, BASE, edit(BASE, 10, 'x2')).hunks, []);
  assert.equal(textConflicts('src/t.vhd', BASE, null, BASE), null, 'a file removed on one side is no text conflict');
  for (const v of ['mine', 'theirs', 'both', { text: '' }, { text: 'a\nb' }]) assert.ok(checkTextChoice(v), JSON.stringify(v));
  for (const v of [undefined, null, 'base', '', 1, { text: 1 }, { text: 'a', more: 1 }, ['mine']]) assert.ok(!checkTextChoice(v), JSON.stringify(v));
});

test('a renamed file is found by its lines (git\'s 50 %), the most alike first, of the same extension', () => {
  assert.equal(similarity(BASE, BASE), 1);
  assert.equal(similarity('', ''), 1);
  assert.equal(similarity('a\nb\n', 'c\nd\n'), 0);
  assert.equal(similarity('a\nb\nc\nd\n', 'a\nb\nx\ny\n'), 0.5);
  const changed = edit(BASE, 10, '  y <= a or b;');
  const other = L('module m(input a, output y);', '  assign y = a;', 'endmodule');
  assert.deepEqual(findRenames({ 'src/t.vhd': BASE, 'src/m.v': other }, { 'rtl/t.vhd': changed, 'rtl/x.vhd': other, 'src/t.v': BASE }),
    [{ from: 'src/t.vhd', to: 'rtl/t.vhd', score: 22 / 24 }]);
  // two candidates: the more alike one
  assert.deepEqual(findRenames({ 'a.vhd': BASE }, { 'b.vhd': edit(changed, 0, 'x'), 'c.vhd': changed }).map(r => r.to), ['c.vhd']);
  assert.deepEqual(findRenames({}, { 'b.vhd': BASE }), []);
});

// every HDL file of the repository's designs: the examples, the ISE projects of the tests
function hdlCorpus() {
  const out = [];
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p); else if (/\.(vhdl?|v|sv|ucf|xdc|pcf|lpf|cst)$/i.test(d.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, 'examples'));
  for (const f of ['ise-xise', 'ise-sch']) if (fs.existsSync(path.join(ROOT, 'test/fixtures', f))) walk(path.join(ROOT, 'test/fixtures', f));
  return out;
}
test('every HDL file of the repository\'s designs merged with itself: no change, no conflict', () => {
  const files = hdlCorpus();
  assert.ok(files.length > 50, `${files.length} files`);
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    for (const base of [t, null]) {
      const m = mergeText(base, t, t);
      assert.deepEqual(m.conflicts, [], f);
      assert.equal(m.text, t, f);
      assert.ok(m.hunks.every(h => h.kind === 'same'), f);
    }
    // a copy that changed its first line, merged with one that changed its last: both taken
    const l = t.split('\n');
    if (l.length < 6) continue;
    const mine = ['-- mine', ...l].join('\n'), theirs = [...l.slice(0, -2), `${l.at(-2)} -- theirs`, l.at(-1)].join('\n');
    assert.equal(mergeText(t, mine, theirs).text, ['-- mine', ...l.slice(0, -2), `${l.at(-2)} -- theirs`, l.at(-1)].join('\n'), f);
  }
});

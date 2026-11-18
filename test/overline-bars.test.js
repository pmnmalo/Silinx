// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The Engineering notation's bars as an SVG text draws them (#4484, core/overline.js's barRuns and barLines): the text
// without its combining overlines (U+0305), one bar per run of characters under a bar at each level, each a line from
// the left of its run's first character's cell to the right of its last, the bars with none under them at one height,
// a bar over bars above them (an outer NOT's bar the highest). Checked against the text's own reading (overlineToSlash) and laid-out cells.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERLINE, BAR_DROP, BAR_STEP, barLines, barRuns, overline, overlineToSlash } from '../core/overline.js';
import { showCondText } from '../core/expr-notation.js';

const B = OVERLINE;
// (a monospace text's cells: 7 wide, from x = 10, the top at y = 4; and a proportional one's, `widths` each)
const mono = (i) => ({ x: 10 + 7 * i, y: 4, width: 7, height: 15 });
const prop = (widths) => (i) => ({ x: 3 + widths.slice(0, i).reduce((a, b) => a + b, 0), y: 2, width: widths[i], height: 15 });

/** The text read back from barRuns: each run's characters under one bar more, as /( … ) (an independent reading). */
function slashOf({ plain, bars }) {
  const opens = new Map(), closes = new Map();
  for (const b of bars) { opens.set(b.from, (opens.get(b.from) ?? 0) + 1); closes.set(b.to, (closes.get(b.to) ?? 0) + 1); }
  let s = '';
  for (let i = 0; i < plain.length; i++) s += '/('.repeat(opens.get(i) ?? 0) + plain[i] + ')'.repeat(closes.get(i) ?? 0);
  return s;
}

test('#4484 barRuns: the text without its overlines, one bar per run and level', () => {
  assert.deepEqual(barRuns('equal'), { plain: 'equal', bars: [] });
  assert.deepEqual(barRuns(''), { plain: '', bars: [] });
  assert.deepEqual(barRuns(undefined), { plain: '', bars: [] });
  // NOT equal (the report's): one bar over the five letters
  assert.deepEqual(barRuns(overline('equal')), { plain: 'equal', bars: [{ level: 1, from: 0, to: 4, raise: 0 }] });
  // a̅·b̅: two bars; a̅·̅b̅: one over the three
  assert.deepEqual(barRuns(`a${B}.b${B}`), { plain: 'a.b', bars: [{ level: 1, from: 0, to: 0, raise: 0 }, { level: 1, from: 2, to: 2, raise: 0 }] });
  assert.deepEqual(barRuns(overline('a.b')), { plain: 'a.b', bars: [{ level: 1, from: 0, to: 2, raise: 0 }] });
  // a bar over bars: NOT (NOT a + b), the inner one over a only, the outer over all
  const nested = overline(`${overline('a')} + b`);
  assert.deepEqual(barRuns(nested), { plain: 'a + b', bars: [{ level: 1, from: 0, to: 4, raise: 1 }, { level: 2, from: 0, to: 0, raise: 0 }] });
  // an overline with no character before it: none
  assert.deepEqual(barRuns(`${B}a`), { plain: 'a', bars: [] });
  for (const d of [barRuns(nested), barRuns(`x.${overline('y + z')}`)]) assert.ok(!d.plain.includes(B), 'no overline drawn');
});

test('#4484 barRuns: read back, the same expression as the text\'s own reading, on the notation\'s conditions', () => {
  const conds = ['!equal', 'a && !b', '!(a || b)', '!(!a && b) || c', '!(!(a && !b) || !c)', 'x == 0 && !y', 'go', '!(a ^ b)'];
  for (const c of conds) {
    const text = showCondText(c, 'engineering');
    assert.equal(slashOf(barRuns(text)), overlineToSlash(text), `${c}: ${text}`);
  }
  assert.ok(showCondText('!equal', 'engineering').includes(B), 'the Engineering notation writes overlines');
});

test('#4484 barLines: each bar one line over exactly its characters, an outer bar above the ones under it', () => {
  const { bars } = barRuns(overline('equal'));
  assert.deepEqual(barLines(bars, mono, 12), [{ level: 1, x1: 10, x2: 10 + 7 * 5, y: 4 + 12 * BAR_DROP }]);
  // two terms: two bars, the one between them not barred, at one height
  const two = barLines(barRuns(`a${B}.b${B}`).bars, mono, 12);
  assert.deepEqual(two.map((l) => [l.x1, l.x2]), [[10, 17], [24, 31]]);
  assert.equal(two[0].y, two[1].y);
  // nested: the outer bar over the whole a step above the inner one, which is over its letter at the first height
  const nested = barLines(barRuns(overline(`${overline('a')} + b`)).bars, mono, 12);
  assert.deepEqual(nested.map((l) => [l.level, l.x1, l.x2]), [[1, 10, 45], [2, 10, 17]]);
  assert.equal(nested[1].y, 4 + 12 * BAR_DROP);
  assert.ok(Math.abs(nested[1].y - nested[0].y - 12 * BAR_STEP) < 1e-9, 'the outer bar a step above the inner one');
  // three deep beside a bar alone: NOT (NOT (NOT a . b) + c) . NOT d: each bar a step above the highest under it, d's
  // bar at the first height
  const deep = barRuns(`${overline(`${overline(`${overline('a')}.b`)} + c`)}.${overline('d')}`);
  assert.deepEqual(deep.bars.map((b) => [b.level, b.from, b.to, b.raise]), [[1, 0, 6, 2], [1, 8, 8, 0], [2, 0, 2, 1], [3, 0, 0, 0]]);
  const ys = barLines(deep.bars, mono, 10).map((l) => Math.round((l.y - 4) * 1000) / 1000);
  assert.deepEqual(ys, [10 * BAR_DROP - 20 * BAR_STEP, 10 * BAR_DROP, 10 * BAR_DROP - 10 * BAR_STEP, 10 * BAR_DROP].map((y) => Math.round(y * 1000) / 1000));
  // a proportional font: the measured cells, not a character's width
  const w = [6, 8, 4, 7, 3];
  assert.deepEqual(barLines(barRuns(overline('equal')).bars, prop(w), 10).map((l) => [l.x1, l.x2]), [[3, 3 + 28]]);
  // the size scales the drop
  assert.equal(barLines(barRuns(overline('a')).bars, mono, 24)[0].y, 4 + 24 * BAR_DROP);
});

test('#4484 barLines: no bars, none; a text not laid out (a cell of no width), null', () => {
  assert.deepEqual(barLines([], mono, 12), []);
  assert.equal(barLines(barRuns(overline('a')).bars, () => ({ x: 0, y: 0, width: 0, height: 0 }), 12), null);
  assert.equal(barLines(barRuns(overline('a')).bars, () => null, 12), null);
});

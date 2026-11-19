// A long list folded (#4571, core/list-fold.js): the Collaboration tab's changes past a threshold, the first ones shown,
// the urgent ones (a conflict) first and never hidden, "N more…" for the rest; unfolded, all shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldList, FOLD_LIMITS } from '../core/list-fold.js';

const items = (n) => Array.from({ length: n }, (_, i) => `f${String(i).padStart(2, '0')}`);

test('#4571 a short list is shown whole, as it is', () => {
  assert.deepEqual(foldList([]), { shown: [], more: 0 });
  assert.deepEqual(foldList(items(3)), { shown: items(3), more: 0 });
  // (up to the limit, never a fold of one or two)
  assert.deepEqual(foldList(items(FOLD_LIMITS.limit)), { shown: items(FOLD_LIMITS.limit), more: 0 });
  assert.equal(FOLD_LIMITS.limit, 12);
  assert.equal(FOLD_LIMITS.shown, 10);
});

test('#4571 past the limit: the first ones shown, the rest counted', () => {
  assert.deepEqual(foldList(items(13)), { shown: items(10), more: 3 });
  const r = foldList(items(100));
  assert.deepEqual(r.shown, items(10));
  assert.equal(r.more, 90);
  // (shown and folded: every item once)
  assert.equal(r.shown.length + r.more, 100);
});

test('#4571 unfolded: all shown, none counted', () => {
  assert.deepEqual(foldList(items(30), { open: true }), { shown: items(30), more: 0 });
});

test('#4571 the urgent ones first, each group in its order, and never folded', () => {
  const list = items(20).map((p, i) => ({ p, c: i % 7 === 6 }));   // (f06, f13 in conflict)
  const r = foldList(list, { first: (x) => x.c });
  assert.deepEqual(r.shown.map((x) => x.p), ['f06', 'f13', 'f00', 'f01', 'f02', 'f03', 'f04', 'f05', 'f07', 'f08']);
  assert.equal(r.more, 10);
  // (more urgent ones than the shown: all of them shown)
  const many = items(30).map((p, i) => ({ p, c: i < 15 }));
  const m = foldList(many, { first: (x) => x.c });
  assert.deepEqual(m.shown.map((x) => x.p), items(15));
  assert.equal(m.more, 15);
  // (all urgent: no fold)
  assert.deepEqual(foldList(items(14), { first: () => true }), { shown: items(14), more: 0 });
  // (a short list: reordered, not folded)
  assert.deepEqual(foldList(['a', 'b', 'c'], { first: (x) => x === 'c' }), { shown: ['c', 'a', 'b'], more: 0 });
});

test('#4571 the list given is not changed', () => {
  const list = items(20);
  foldList(list, { first: (x) => x === 'f19' });
  assert.deepEqual(list, items(20));
});

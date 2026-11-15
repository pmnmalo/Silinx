// A truth table's look in live sharing (#4192, #4193, web/js/tt-look.js): sent as its selection, read back the same
// through core/collab-select.js; the followed participant's put only when it changed (the follower's own choices kept
// meanwhile); an output the table no longer has, a kind that is not one, left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ttLook } from '../web/js/tt-look.js';
import { selectionValue } from '../core/collab-select.js';

const editor = (s0) => {
  let s = { out: 'f', groups: 'sop', qm: 'sop', map: false, steps: false, outputs: ['f', 'g'], ...s0 };
  const puts = [];
  const look = ttLook(() => ({ ...s }), (v) => { s = { ...v }; puts.push(v); });
  return { look, now: () => s, puts, mine: (v) => { s = { ...s, ...v }; } };
};

test('sent and read back the same', () => {
  const a = editor({ out: 'g', groups: 'pos', map: true });
  const sent = a.look.shared();
  assert.deepEqual(sent, { items: ['out:g'], look: { groups: 'pos', qm: 'sop', map: true, steps: false } });
  assert.deepEqual(selectionValue(JSON.parse(JSON.stringify(sent))), sent);
});

test('the followed participant\'s look put; again only when it changed, the follower\'s own choice kept meanwhile', () => {
  const b = editor();
  assert.equal(b.look.set({ groups: 'pos', qm: 'pos', map: true, steps: true }, ['out:g']), true);
  assert.deepEqual(b.now(), { out: 'g', groups: 'pos', qm: 'pos', map: true, steps: true, outputs: ['f', 'g'] });
  b.mine({ map: false });   // (the follower hides the map)
  assert.equal(b.look.set({ groups: 'pos', qm: 'pos', map: true, steps: true }, ['out:g']), false);
  assert.equal(b.now().map, false);
  assert.equal(b.look.set({ groups: 'sop', qm: 'pos', map: true, steps: true }, ['out:g']), true);
  assert.deepEqual([b.now().groups, b.now().map], ['sop', true]);
  assert.equal(b.puts.length, 2);
});

test('an output the table has not (renamed, deleted), a kind that is not one: left out', () => {
  const c = editor();
  c.look.set({ groups: 'xor', qm: 3, map: 'yes', steps: null }, ['out:gone', 'sym:S1']);
  assert.deepEqual(c.now(), { out: 'f', groups: 'sop', qm: 'sop', map: false, steps: false, outputs: ['f', 'g'] });
  assert.equal(c.look.set(null, []), false);
});

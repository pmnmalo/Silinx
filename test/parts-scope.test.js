// Each server call's own project parts (#4294, server/parts-scope.js): two calls run at once, their awaits interleaved
// by hand, each one's parts its own; outside any call, the module's (the browser's: one project open at a time)
import test from 'node:test';
import assert from 'node:assert/strict';
import { inPartsScope, partsScope } from '../server/parts-scope.js';
import { setProjectParts, partDef, projectParts } from '../core/circuit-parts.js';

const def = (type, title) => ({ type, title, kind: 'drawn', pins: [] });
const T = 'parts/ttl.kicad_sym#X';

test('two calls interleaved: each one reads the parts it set, not the other\'s; none outside them', async () => {
  let goA, goB;
  const a = inPartsScope(async () => { setProjectParts([def(T, 'of a')]); await new Promise((r) => { goA = r; }); return [partDef(T).title, projectParts().length]; });
  const b = inPartsScope(async () => { assert.equal(partDef(T), null, 'a new call starts with none'); setProjectParts([def(T, 'of b'), def(`${T}2`, 'b2')]); await new Promise((r) => { goB = r; }); return [partDef(T).title, projectParts().length]; });
  goA(); goB();
  assert.deepEqual(await Promise.all([a, b]), [['of a', 1], ['of b', 2]]);
  assert.equal(partDef(T), null, 'outside any call: the module\'s, unset');
  setProjectParts([def(T, 'outside')]);
  assert.equal(partDef(T).title, 'outside');
  assert.equal(await inPartsScope(async () => partDef(T)), null, 'a call does not see them');
  setProjectParts([]);
});

test('partsScope: an HTTP request\'s handlers in a store of their own', async () => {
  const seen = await new Promise((resolve) => partsScope({}, {}, () => { setProjectParts([def(T, 'req')]); resolve(partDef(T).title); }));
  assert.equal(seen, 'req');
  assert.equal(partDef(T), null);
});

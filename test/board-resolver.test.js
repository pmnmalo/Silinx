// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// One board resolver (#5092): the page's projectBoard (web/js/app.js) is core's projectBoardOf, on /api/devices's list,
// and gives what the page's own resolver gave on every board, variant and part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, getDeviceDb, projectBoardOf, resolveBoard } from '../core/devices.js';
import { mcuBoard } from '../core/system-doc.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// The page's resolver before #5092, as it was: the reference.
function oldProjectBoard(pj, boards) {
  const b = boards.find(x => x.id === pj?.board);
  if (!b) return null;
  const v = b.variants?.find(x => x.device.part === pj.device.part) || b.variants?.find(x => x.default) || null;
  const ov = v?.resourceOverrides || {};
  return { ...b, device: { ...(v?.device || b.device) }, resources: b.resources.map(r => (ov[r.name] ? { ...r, ...ov[r.name] } : r)) };
}

// /api/devices's list, as the page gets it (JSON).
const pageBoards = JSON.parse(JSON.stringify(getDeviceDb().boards));

const cases = () => BOARDS.flatMap(b => [
  { board: b.id, device: { ...b.device } },
  { board: b.id, device: { ...b.device, part: 'xc0none' } },
  ...(b.variants || []).map(v => ({ board: b.id, device: { ...v.device } })),
]);

test('projectBoardOf gives the page\'s old board on every board, variant and a part of no variant', () => {
  const all = cases();
  assert.ok(all.length > BOARDS.length * 2);
  for (const pj of all) assert.deepEqual(projectBoardOf(pj, pageBoards), oldProjectBoard(pj, pageBoards), `${pj.board} ${pj.device.part}`);
});

test('core\'s list and the page\'s give the same board', () => {
  for (const pj of cases()) assert.deepEqual(projectBoardOf(pj), projectBoardOf(pj, pageBoards), `${pj.board} ${pj.device.part}`);
});

test('a part written in capitals finds its variant (the one difference, decided: core lower-cases the part)', () => {
  const withVariants = BOARDS.filter(b => b.variants?.some(v => !v.default));
  assert.ok(withVariants.length > 0);
  for (const b of withVariants) {
    for (const v of b.variants) {
      const pj = { board: b.id, device: { ...v.device, part: v.device.part.toUpperCase() } };
      assert.deepEqual(projectBoardOf(pj).device, v.device, `${b.id} ${v.id}`);
    }
  }
});

test('a part of no variant: the page keeps the default variant, else the board\'s own device; resolveBoard the first', () => {
  for (const b of BOARDS.filter(x => x.variants?.length)) {
    const pj = { board: b.id, device: { part: 'xc0none' } };
    const def = b.variants.find(v => v.default);
    assert.deepEqual(projectBoardOf(pj).device, { ...(def?.device || b.device) }, b.id);
    assert.deepEqual(resolveBoard(b.id, { part: 'xc0none' }).device, { ...(def || b.variants[0]).device }, b.id);
    assert.equal(resolveBoard(b.id, { part: 'xc0none', fallback: 'default' }).variant, def || null, b.id);
  }
});

test('no board, an unknown board, no project: null', () => {
  assert.equal(projectBoardOf(null), null);
  assert.equal(projectBoardOf({ device: { part: 'xc3s100e' } }), null);
  assert.equal(projectBoardOf({ board: 'no-such-board', device: { part: 'xc3s100e' } }), null);
  assert.equal(projectBoardOf({ board: 'basys2' }).id, 'basys2');
});

test('the resources are copies: the board\'s own are never changed', () => {
  const before = JSON.stringify(BOARDS);
  for (const pj of cases()) projectBoardOf(pj).resources.forEach(r => { r.pins = null; });
  assert.equal(JSON.stringify(BOARDS), before);
});

test('the examples\' boards: the page\'s callers get the same board', () => {
  const dir = new URL('../examples/', import.meta.url);
  const pjs = readdirSync(dir).filter(d => existsSync(new URL(`${d}/silinx.json`, dir)))
    // (an FPGA board's: a processor board's example has no FPGA board to resolve, #5874)
    .map(d => JSON.parse(readFileSync(new URL(`${d}/silinx.json`, dir), 'utf8'))).filter(pj => pj.board && !mcuBoard(pj.board));
  assert.ok(pjs.length >= 10);
  for (const pj of pjs) {
    assert.ok(projectBoardOf(pj, pageBoards), pj.name);
    assert.deepEqual(projectBoardOf(pj, pageBoards), oldProjectBoard(pj, pageBoards), pj.name);
  }
});

test('the page\'s projectBoard reads core\'s', () => {
  const app = readFileSync(new URL('../web/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ projectBoardOf \} from '\/core\/devices\.js';/);
  assert.match(app, /return S\.devices\?\.boards \? projectBoardOf\(pj, S\.devices\.boards\) : null;/);
});

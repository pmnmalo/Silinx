// The UI tests make a project a System by its profile (#5970): since silinx.json's version 2 (#5907) a project's
// `profile` is what it is (core/project-profile.js profileOf: the profile first, the old `kind` only for a project with
// none), so a test that took a template's silinx.json (profile 'fpga') and wrote `kind: 'system'` over it kept an FPGA
// project: the Design pane showed no System row, and the tests waiting for it timed out on main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { profileOf } from '../core/project-profile.js';

const UI = path.join(import.meta.dirname, 'ui');

test('#5970 the profile wins over the old kind: a template\'s silinx.json given kind system stays an FPGA project', () => {
  assert.equal(profileOf({ profile: 'fpga', kind: 'system' }), 'fpga');
  assert.equal(profileOf({ profile: 'system', board: null }), 'system');
  assert.equal(profileOf({ kind: 'system' }), 'system', 'a project of before, with no profile: its kind');
});

test('#5970 no UI test makes a project a System through its old kind (its profile overrides it): profile: \'system\'', () => {
  const bad = fs.readdirSync(UI).filter((f) => f.endsWith('.test.js'))
    .flatMap((f) => fs.readFileSync(path.join(UI, f), 'utf8').split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => /\.\.\.pj, kind: 'system'/.test(l)).map(([f, n]) => `${f}:${n}`);
  assert.deepEqual(bad, []);
});

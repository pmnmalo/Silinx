// core/git-ignore.js (#3196): the tools' outputs a commit leaves out and Silinx's .gitignore, moved from server/git.js
// (which still exports GITIGNORE, the same text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUTS, GLOBS, EXCLUDE, isOutput, isWriteTemp, WRITE_TEMP, GITIGNORE } from '../core/git-ignore.js';
import * as G from '../server/git.js';

test('server/git.js exports the same .gitignore as before the move', () => {
  assert.equal(G.GITIGNORE, GITIGNORE);
  assert.ok(GITIGNORE.startsWith('# Silinx (#3195)'));
  for (const p of ['build/', 'xst/', '_xmsgs/', 'iseconfig/', 'isim/', '.Xil/', '*.bit', '*.ncd', '*.ngc', '*.ngd', '*.xdl', '*.xdlrc', '*.wdb', '.DS_Store']) assert.ok(GITIGNORE.split('\n').includes(p), p);
});

test('the outputs: a folder of a tool at the top, a file by its extension anywhere', () => {
  assert.equal(OUTPUTS.length, 13);
  assert.equal(GLOBS.length, OUTPUTS.length);
  assert.deepEqual(GLOBS.slice(0, 2), ['build/**', 'xst/**']);
  assert.equal(GLOBS.at(-1), '**/*.wdb');
  assert.deepEqual(EXCLUDE.slice(0, 1), [':(exclude,glob)build/**']);
  for (const p of ['build/open/top.bit', 'xst/x', '_xmsgs/a.xmsgs', 'isim/w', '.Xil/a', 'top.bit', 'sub/top.BIT', 'a/b.ncd', 'x.wdb']) assert.ok(isOutput(p), p);
  for (const p of ['src/top.vhd', 'silinx.json', 'src/build/x.vhd', 'constraints/top.ucf', 'bit.vhd', '.gitignore']) assert.ok(!isOutput(p), p);
});

test('#5016 a write\'s temporary file: hidden, the pid and a random part, .tmp', () => {
  assert.equal(WRITE_TEMP, '**/.*.tmp');
  for (const p of ['.silinx.json.4242.a1b2.tmp', 'src/.top.vhd.1.k3j9x0q.tmp', 'a/b/.x.v.77.z.tmp']) assert.ok(isWriteTemp(p), p);
  for (const p of ['src/top.vhd', 'top.tmp', 'src/x.4242.ab.tmp', '.silinx.json', 'src/.top.vhd.tmp', '.a.b.tmp.v']) assert.ok(!isWriteTemp(p), p);
});

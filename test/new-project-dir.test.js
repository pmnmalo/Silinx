// Unit tests (#4772): server/new-project-dir.js, a new project's folder made whole or not at all (the clones' one copy:
// server/git.js gitClone, server/git-github.js's REST clone), and server/programmer.js adepttoolEnv (the programmer's and
// the logic analyzer's one copy of adepttool's environment).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-new-project-dir-'));
process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
const { intoNewProjectDir } = await import('../server/new-project-dir.js');
const { adepttoolEnv } = await import('../server/programmer.js');
const ws = process.env.SILINX_WORKSPACE;
const leftovers = () => fs.readdirSync(ws).filter(n => n.startsWith('.silinx-clone-'));

test('intoNewProjectDir: filled in a folder of its own inside the workspace, then moved into place; fill\'s result returned', async () => {
  const dir = path.join(ws, 'p1');
  let at = null;
  const r = await intoNewProjectDir(dir, async t => {
    at = t;
    assert.equal(path.dirname(t), ws);
    assert.ok(!fs.existsSync(t), 'not made yet: git clone makes it');
    fs.mkdirSync(path.join(t, 'src'), { recursive: true });
    fs.writeFileSync(path.join(t, 'src', 'a.v'), 'module a; endmodule\n');
    assert.ok(!fs.existsSync(dir), 'not in place while it is written');
    return { project: 'p1' };
  });
  assert.deepEqual(r, { project: 'p1' });
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.v'), 'utf8'), 'module a; endmodule\n');
  assert.ok(!fs.existsSync(at));
  assert.deepEqual(leftovers(), []);
});

test('intoNewProjectDir: place() runs after fill, before the move; its error or fill\'s leaves no folder behind', async () => {
  const order = [];
  const dir = path.join(ws, 'p2');
  await intoNewProjectDir(dir, async t => { order.push('fill'); fs.mkdirSync(t); }, async () => { order.push('place'); assert.ok(!fs.existsSync(dir)); });
  assert.deepEqual(order, ['fill', 'place']);
  assert.ok(fs.existsSync(dir));
  const taken = path.join(ws, 'p3');
  fs.mkdirSync(taken);
  await assert.rejects(intoNewProjectDir(taken, async t => { fs.mkdirSync(t); fs.writeFileSync(path.join(t, 'x'), '1'); },
    async () => { throw new Error('project \'p3\' already exists'); }), /already exists/);
  assert.deepEqual(fs.readdirSync(taken), [], 'the existing folder untouched');
  await assert.rejects(intoNewProjectDir(path.join(ws, 'p4'), async t => { fs.mkdirSync(t); throw new Error('clone failed'); }), /clone failed/);
  assert.ok(!fs.existsSync(path.join(ws, 'p4')));
  assert.deepEqual(leftovers(), []);
});

test('adepttoolEnv: adepttool\'s modules on PYTHONPATH, the library folders that exist after the inherited ones', () => {
  const env = adepttoolEnv({ src: '/x/adepttool/src' });
  assert.equal(env.PYTHONPATH, '/x/adepttool/src');
  assert.equal(env.PATH, process.env.PATH);
  const libs = ['/opt/homebrew/lib', '/usr/local/lib'].filter(d => fs.existsSync(d));
  assert.equal(env.DYLD_FALLBACK_LIBRARY_PATH, [process.env.DYLD_FALLBACK_LIBRARY_PATH, ...libs].filter(Boolean).join(':'));
  for (const d of env.DYLD_FALLBACK_LIBRARY_PATH.split(':').filter(Boolean).slice(process.env.DYLD_FALLBACK_LIBRARY_PATH ? 1 : 0)) assert.ok(fs.existsSync(d), d);
});

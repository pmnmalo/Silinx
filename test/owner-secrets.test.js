// What a shared project's owner's computer is named by, left out of what its followers get (#4002,
// server/owner-secrets.js): the workspace and the exchange folder as given and as the system resolves them, the
// configuration folder, the home folder, the ISE machine (its user@host, its host, SILINX_ISE_HOST, an absolute build
// folder there); the longest first, none too short or a root.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-owner-secrets-'); fs.mkdirSync(process.env.SILINX_WORKSPACE, { recursive: true }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { ownerSecrets } = await import('../server/owner-secrets.js');

test('ownerSecrets: the folders as given and resolved, the home folder, the ISE machine; the longest first', async () => {
  await writeConfig({ mode: 'ssh', ssh: { host: 'buildbox.example', user: 'ana', remoteDir: '/srv/ise/builds' } });
  const home = path.join(tmp, 'home'), xchg = path.join(tmp, 'xchg');
  const s = await ownerSecrets({ env: { SILINX_MCP_FOLDER: xchg, SILINX_ISE_HOST: 'bob@other.example' }, home });
  const ws = process.env.SILINX_WORKSPACE, real = fs.realpathSync(ws);
  const want = [[ws, '<workspace>'], [real, '<workspace>'], [xchg, '<exchange folder>'], [process.env.SILINX_CONFIG_DIR, '<Silinx configuration>'], [home, '~'],
    ['ana@buildbox.example', '<ISE host>'], ['buildbox.example', '<ISE host>'], ['/srv/ise/builds', '<ISE build folder>'], ['bob@other.example', '<ISE host>'], ['other.example', '<ISE host>']];
  for (const p of want) assert.ok(s.some(([k, v]) => k === p[0] && v === p[1]), JSON.stringify(p));
  assert.deepEqual(s.map(([k]) => k.length), [...s.map(([k]) => k.length)].sort((a, b) => b - a), 'longest first');
  assert.equal(new Set(s.map(([k]) => k)).size, s.length, 'each once');
  // a relative build folder (in the remote home) is no name; SILINX_ISE_HOST=local none; a root never
  await writeConfig({ mode: 'ssh', ssh: { host: 'buildbox.example', user: 'ana', remoteDir: 'silinx-build' } });
  const t = await ownerSecrets({ env: { SILINX_ISE_HOST: 'local' }, home: '/' });
  assert.equal(t.some(([k, v]) => v === '<ISE build folder>' || k === 'local' || k === '/'), false);
});

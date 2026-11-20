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
const { redact } = await import('../core/collab-runs.js');

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

test('#4777 ownerSecrets on a Windows computer: its drive letters and backslashes, each folder as itself (the configuration inside the home folder first); a drive\'s root never', async () => {
  await writeConfig({ mode: 'local' });
  const P = path.win32, home = 'C:\\Users\\user', config = 'C:\\Users\\user\\AppData\\Roaming\\silinx', workspace = 'D:\\work\\silinx';
  const s = await ownerSecrets({ env: { SILINX_MCP_FOLDER: 'E:\\share' }, home, path: P, workspace, config });
  assert.deepEqual(s, [[config, '<Silinx configuration>'], [workspace, '<workspace>'], [home, '~'], ['E:\\share', '<exchange folder>']]);
  assert.equal(redact(`Bitstream: ${workspace}\\p\\build\\top.bit; settings ${config}\\config.json; ${home}\\Desktop\\x.vhd; E:\\share\\in.zip`, s),
    'Bitstream: <workspace>\\p\\build\\top.bit; settings <Silinx configuration>\\config.json; ~\\Desktop\\x.vhd; <exchange folder>\\in.zip');
  // (no exchange folder given: the home folder's Downloads, inside it; a home folder that is a drive's root: none)
  const t = await ownerSecrets({ env: {}, home: 'C:\\', path: P, workspace, config: 'C:\\silinx' });
  assert.deepEqual(t, [[workspace, '<workspace>'], ['C:\\Downloads', '<exchange folder>'], ['C:\\silinx', '<Silinx configuration>']]);
});

test('#4777 ownerSecrets for a user whose workspace and exchange folder are outside the home folder: each replaced as itself, never as ~', async () => {
  await writeConfig({ mode: 'local' });
  const P = path.posix, home = '/home/user', workspace = '/data/silinx/ws', config = '/home/user/.config/silinx';
  const s = await ownerSecrets({ env: { SILINX_MCP_FOLDER: '/mnt/share' }, home, path: P, workspace, config });
  assert.deepEqual(s, [[config, '<Silinx configuration>'], [workspace, '<workspace>'], ['/mnt/share', '<exchange folder>'], [home, '~']]);
  assert.equal(redact('ghdl -a /data/silinx/ws/p/src/top.vhd (/home/user/lib/x.vhd, /mnt/share/t.zip); /data/silinx/other', s),
    'ghdl -a <workspace>/p/src/top.vhd (~/lib/x.vhd, <exchange folder>/t.zip); /data/silinx/other');
});

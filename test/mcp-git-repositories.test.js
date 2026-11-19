// The MCP's git_repositories (#4653, server/mcp-git.js): the user's GitHub repositories as Open from GitHub Repository…
// lists them, through GitHub's command line (test/fake-gh.mjs, no network): all, filtered (by a name, an address), none
// matching; gh not installed: the error and its hint, as the console says them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratchEnv } from './server-helpers.js';

const { handle } = await import('../server/mcp.js');
const { REPOS_TESTING } = await import('../server/git-repos.js');
let id = 0, tmp;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const saved = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN };

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-repos-'));
  delete process.env.GH_TOKEN; delete process.env.GITHUB_TOKEN;
  const f = path.join(tmp, 'repos.json');
  fs.writeFileSync(f, JSON.stringify([
    { full_name: 'ana/lab2', html_url: 'https://github.com/ana/lab2', private: true, description: 'Traffic lights', pushed_at: '2026-11-19T10:00:00Z' },
    { full_name: 'ana/lab1', html_url: 'https://github.com/ana/lab1', private: false, description: null, pushed_at: '2026-11-18T10:00:00Z' },
  ]));
  process.env.FAKE_GH_REPOS = f;
  REPOS_TESTING.gh = [process.execPath, path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-gh.mjs')];
});
after(() => {
  REPOS_TESTING.gh = null;
  delete process.env.FAKE_GH_REPOS;
  for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
});

test('git_repositories: all, filtered, none; gh not installed: the error and its hint', async () => {
  const all = await call('git_repositories');
  assert.equal(all.isError, false, all.text);
  assert.equal(all.text, '2 repositories of 2, the most recently pushed first (through GitHub\'s command line).\n  ana/lab2 (private): Traffic lights\n  ana/lab1');
  assert.deepEqual(all.data.repositories.map(r => r.url), ['https://github.com/ana/lab2', 'https://github.com/ana/lab1']);
  assert.equal(all.data.source, 'gh');
  const one = await call('git_repositories', { query: 'traffic' });
  assert.equal(one.text, '1 repository with \'traffic\' of 2, the most recently pushed first (through GitHub\'s command line).\n  ana/lab2 (private): Traffic lights');
  assert.equal((await call('git_repositories', { query: 'https://github.com/ana/lab1' })).data.repositories[0].repository, 'ana/lab1');
  const none = await call('git_repositories', { query: 'pong' });
  assert.deepEqual([none.text, none.data.repositories, none.data.untrusted], ['0 repositories with \'pong\' of 2, the most recently pushed first (through GitHub\'s command line).', [], undefined]);
  REPOS_TESTING.gh = 'silinx-test-no-gh';
  const off = await call('git_repositories');
  assert.equal(off.isError, true);
  assert.equal(off.text, 'git_repositories: your repositories are not listed: GitHub\'s command line (gh) is not installed\nHint: Install GitHub\'s command line (cli.github.com) and sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.');
});

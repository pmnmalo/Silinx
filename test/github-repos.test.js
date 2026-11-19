// The user's GitHub repositories (#4653, core/github-repos.js, server/git-repos.js): the pages read until a short one (at
// most three), each entry; the filter (a name, an owner, a description, an address); and the server's sources: GitHub's
// API with the environment's token (against test/fake-github.mjs), else GitHub's command line (test/fake-gh.mjs: listed,
// not installed, not signed in, a failure), with the errors' messages and hints as the console says them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reposPath, repoEntry, listRepositories, filterRepositories, repoLine } from '../core/github-repos.js';
import { fakeGitHub } from './fake-github.mjs';

const GH = await import('../server/git-github.js');
const { gitRepositories, REPOS_TESTING } = await import('../server/git-repos.js');
const FAKE_GH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-gh.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-repos-'));
const saved = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN, FAKE_GH_REPOS: process.env.FAKE_GH_REPOS, FAKE_GH_MODE: process.env.FAKE_GH_MODE };
after(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  REPOS_TESTING.gh = null;
  GH.GITHUB_TESTING.fetch = null;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const gh = (repos, mode = '') => {
  const f = path.join(tmp, 'repos.json');
  fs.writeFileSync(f, JSON.stringify(repos));
  Object.assign(process.env, { FAKE_GH_REPOS: f, FAKE_GH_MODE: mode });
  delete process.env.GH_TOKEN; delete process.env.GITHUB_TOKEN;
  REPOS_TESTING.gh = [process.execPath, FAKE_GH];
};
const J = (full, more = {}) => ({ full_name: full, html_url: `https://github.com/${full}`, private: false, description: null, pushed_at: '2026-11-19T10:00:00Z', ...more });

test('the pages: 100 a page, read until a short one, at most three; each entry as the list shows it', async () => {
  assert.equal(reposPath(2), '/user/repos?per_page=100&page=2&sort=pushed&affiliation=owner,collaborator,organization_member');
  const asked = [];
  const pages = { 1: Array.from({ length: 100 }, (_, i) => J(`ana/r${i}`)), 2: [J('ana/last', { private: true, description: 'Lab 2' })] };
  const list = await listRepositories(async p => { asked.push(p); return pages[new URL(p, 'https://x').searchParams.get('page')] || []; });
  assert.deepEqual(asked, [reposPath(1), reposPath(2)]);
  assert.equal(list.length, 101);
  assert.deepEqual(list[100], { repository: 'ana/last', url: 'https://github.com/ana/last', private: true, description: 'Lab 2', pushedAt: '2026-11-19T10:00:00Z' });
  assert.equal(repoLine(list[100]), 'ana/last (private): Lab 2');
  assert.equal(repoLine(list[0]), 'ana/r0');
  // at most three pages; a page that is not a list stops it; an entry with no name left out
  let n = 0;
  assert.equal((await listRepositories(async () => { n++; return Array.from({ length: 100 }, (_, i) => J(`a/${n}-${i}`)); })).length, 300);
  assert.equal(n, 3);
  assert.deepEqual(await listRepositories(async () => ({ message: 'x' })), []);
  assert.deepEqual((await listRepositories(async () => [J('a/b'), {}, null])).map(r => r.repository), ['a/b']);
  assert.deepEqual(repoEntry({ full_name: 'o/r' }), { repository: 'o/r', url: 'https://github.com/o/r', private: false, description: '', pushedAt: null });
});

test('the filter: a name, an owner, a description (any case), an address; nothing: all', () => {
  const list = [J('ana/lab1'), J('ana/lab2', { description: 'Traffic lights' }), J('isel-sd/lab1-bob')].map(repoEntry);
  const names = q => filterRepositories(list, q).map(r => r.repository);
  assert.deepEqual(names(''), ['ana/lab1', 'ana/lab2', 'isel-sd/lab1-bob']);
  assert.deepEqual(names('  LAB1 '), ['ana/lab1', 'isel-sd/lab1-bob']);
  assert.deepEqual(names('isel'), ['isel-sd/lab1-bob']);
  assert.deepEqual(names('traffic'), ['ana/lab2']);
  assert.deepEqual(names('https://github.com/ana/lab2'), ['ana/lab2']);
  assert.deepEqual(names('git@github.com:isel-sd/lab1-bob.git'), ['isel-sd/lab1-bob']);
  assert.deepEqual(names('nothing'), []);
});

test('the server with a token: GitHub\'s API with it', async () => {
  const fake = fakeGitHub();
  fake.seed('student/older', null);
  fake.seed('student/lab', null, { private: true, description: 'Lab 1' });
  GH.GITHUB_TESTING.fetch = fake.fetch;
  process.env.GH_TOKEN = fake.token;
  REPOS_TESTING.gh = 'silinx-test-no-gh';   // (never asked)
  const r = await gitRepositories();
  assert.equal(r.source, 'api');
  assert.deepEqual(r.repositories.map(repoLine), ['student/lab (private): Lab 1', 'student/older']);
  process.env.GH_TOKEN = 'wrong';
  await assert.rejects(gitRepositories(), e => { assert.equal(e.status, 401); assert.match(e.message, /^GitHub refused the sign-in/); return true; });
  delete process.env.GH_TOKEN;
});

test('the server with no token: GitHub\'s command line; not installed, not signed in, a failure: said, with how to have the list', async () => {
  gh([J('ana/lab1', { private: true }), J('ana/notes', { description: 'Notes' })]);
  const r = await gitRepositories();
  assert.deepEqual([r.source, r.repositories.map(repoLine)], ['gh', ['ana/lab1 (private)', 'ana/notes: Notes']]);
  gh([], 'signed-out');
  await assert.rejects(gitRepositories(), e => {
    assert.deepEqual([e.status, e.message, e.hint], [401, 'your repositories are not listed: GitHub\'s command line (gh) is not signed in', 'Sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.']);
    return true;
  });
  gh([], 'broken');
  await assert.rejects(gitRepositories(), e => {
    assert.deepEqual([e.status, e.message, e.hint], [502, 'your repositories are not listed: gh api failed (HTTP 502: Bad Gateway (https://api.github.com/user/repos))', null]);
    return true;
  });
  REPOS_TESTING.gh = 'silinx-test-no-gh';
  await assert.rejects(gitRepositories(), e => {
    assert.deepEqual([e.status, e.message, e.hint], [503, 'your repositories are not listed: GitHub\'s command line (gh) is not installed', 'Install GitHub\'s command line (cli.github.com) and sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.']);
    return true;
  });
});

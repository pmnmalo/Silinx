// Open from GitHub Repository… onto a project of the same name (#4618, core/git-clone-exists.js): the free name, what a
// replace would lose, and each choice of cloneOrChoose ('error' as before, 'open', 'rename', 'replace': refused with
// changes nowhere else unless discarded, the old project removed only once the clone is ready, kept when it fails) on
// the browser edition's back end (core/git-rest.js) against a stand-in for GitHub (test/fake-github.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubClient, GitHubError } from '../core/github-api.js';
import { restGit } from '../core/git-rest.js';
import { checkUrl, nameFromRepo } from '../core/github-url.js';
import { IF_EXISTS, freeName, lossOf, cloneOrChoose, openedText, replacedText, keptBothText, notReplacedText } from '../core/git-clone-exists.js';

const PJ = JSON.stringify({ name: 'gates', device: { family: 'spartan3e', part: 'xc3s100e' }, top: 'gates', files: [{ path: 'src/gates.vhd', lang: 'vhdl', role: 'design' }] }, null, 2) + '\n';
const GATES = { 'silinx.json': PJ, 'src/gates.vhd': 'entity gates is end;\n' };

function setup() {
  const gh = fakeGitHub();
  gh.seed('pmalo/gates', GATES);
  gh.seed('pmalo/other', { ...GATES, 'src/gates.vhd': 'entity other is end;\n' });
  const P = new Map(), M = new Map(), removed = [];
  const projects = {
    exists: async n => P.has(n), files: async n => ({ ...P.get(n) }),
    create: async (n, files) => { P.set(n, { ...files }); },
    write: async (n, p, t) => { P.get(n)[p] = t; }, remove: async (n, p) => { delete P.get(n)[p]; },
  };
  const meta = { get: async n => M.get(n) ?? null, set: async (n, m) => { if (m) M.set(n, structuredClone(m)); else M.delete(n); } };
  const git = restGit({ client: githubClient({ fetch: gh.fetch, token: () => gh.token }), projects, meta });
  const B = {
    GitError: GitHubError, checkUrl, nameFromRepo, exists: n => projects.exists(n), status: n => git.status(n),
    remove: async n => { removed.push(n); P.delete(n); M.delete(n); return false; },
    clone: o => git.clone(o),
    sameRepository: (have, remote) => !!have && have.toLowerCase() === `${remote.owner}/${remote.repo}`.toLowerCase(),
  };
  return { gh, P, M, removed, git, B, choose: o => cloneOrChoose(B, o) };
}
const rejects = (p, message, more = {}) => assert.rejects(p, e => { assert.equal(e.message, message); for (const [k, v] of Object.entries(more)) assert.deepEqual(e[k], v, k); return true; });

test('freeName: name-2, name-3…, within 64 characters', async () => {
  const taken = new Set(['lab', 'lab-2']);
  assert.equal(await freeName('lab', async n => taken.has(n)), 'lab-3');
  assert.equal(await freeName('lab-2', async n => taken.has(n)), 'lab-2-2');
  const long = 'a'.repeat(64);
  assert.equal(await freeName(long, async () => false), `${'a'.repeat(62)}-2`);
});

test('lossOf: no repository, uncommitted changes, unpushed commits, never pushed; nothing when all is on GitHub', () => {
  assert.deepEqual(lossOf({ repository: false, files: [] }), ['it is in no git repository: its files are nowhere else']);
  assert.deepEqual(lossOf(null), ['it is in no git repository: its files are nowhere else']);
  assert.deepEqual(lossOf({ repository: true, upstream: 'origin/main', ahead: 0, files: [] }), []);
  assert.deepEqual(lossOf({ repository: true, upstream: 'origin/main', ahead: 2, files: [{ path: 'a', state: 'new' }] }), ['1 uncommitted change(s)', '2 commit(s) not pushed to GitHub']);
  assert.deepEqual(lossOf({ repository: true, upstream: null, ahead: 0, files: [] }), ['its commits were never pushed to GitHub']);
});

test('no project of the name: cloned as before, whatever ifExists says; an unknown ifExists refused', async () => {
  const { choose, P } = setup();
  assert.deepEqual(IF_EXISTS, ['error', 'open', 'replace', 'rename']);
  const r = await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'replace' });
  assert.deepEqual([r.project, r.replaced, r.renamedFrom], ['gates', undefined, undefined]);
  assert.ok(P.has('gates'));
  await rejects(choose({ url: 'https://github.com/pmalo/gates', ifExists: 'merge' }), 'if_exists: one of error, open, replace, rename, not \'merge\'', { status: 400 });
});

test('"error" (the default): the old 409, now with what the question asks (the same repository, nothing to lose, the free name)', async () => {
  const { choose } = setup();
  await choose({ url: 'https://github.com/pmalo/gates' });
  await rejects(choose({ url: 'https://github.com/pmalo/gates' }), 'project \'gates\' already exists', {
    status: 409, hint: 'Choose another name for the project.',
    existing: { project: 'gates', repository: 'pmalo/gates', sameRepository: true, loss: [], suggested: 'gates-2' },
  });
  // another repository onto it: not the same
  await rejects(choose({ url: 'https://github.com/pmalo/other', name: 'gates' }), 'project \'gates\' already exists', {
    existing: { project: 'gates', repository: 'pmalo/other', sameRepository: false, loss: [], suggested: 'gates-2' },
  });
});

test('"open": the existing project as it is, nothing fetched into it', async () => {
  const { choose, P } = setup();
  await choose({ url: 'https://github.com/pmalo/gates' });
  P.get('gates')['src/gates.vhd'] = 'mine\n';
  const r = await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'open' });
  assert.deepEqual(r, { project: 'gates', opened: true, url: 'https://github.com/pmalo/gates', repository: 'pmalo/gates', sameRepository: true, warnings: [] });
  assert.equal(P.get('gates')['src/gates.vhd'], 'mine\n');
  assert.equal(openedText(r), 'Project \'gates\' already exists: opened as it is; it is a clone of pmalo/gates, which Pull brings up to date.');
  assert.equal(openedText({ ...r, sameRepository: false }), 'Project \'gates\' already exists: opened as it is; it is not a clone of pmalo/gates.');
});

test('"rename": both kept, the clone under the free name', async () => {
  const { choose, P } = setup();
  await choose({ url: 'https://github.com/pmalo/gates' });
  P.get('gates')['src/gates.vhd'] = 'mine\n';
  const r = await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'rename' });
  assert.deepEqual([r.project, r.renamedFrom], ['gates-2', 'gates']);
  assert.equal(P.get('gates')['src/gates.vhd'], 'mine\n');
  assert.equal(P.get('gates-2')['src/gates.vhd'], 'entity gates is end;\n');
  assert.equal(keptBothText(r), 'Project \'gates\' kept as it is: the repository opened as \'gates-2\'.');
  assert.equal((await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'rename' })).project, 'gates-3');
});

test('"replace": nothing to lose, replaced; changes nowhere else refused, named, unless discarded; a failed clone keeps the old project', async () => {
  const { choose, P, removed } = setup();
  await choose({ url: 'https://github.com/pmalo/gates' });
  let r = await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'replace' });
  assert.deepEqual(r.replaced, { project: 'gates', trashed: false, lost: [] });
  assert.equal(replacedText(r), 'Project \'gates\' replaced.');
  assert.deepEqual(removed, ['gates']);
  // a change here: refused, the project as it was
  P.get('gates')['src/gates.vhd'] = 'mine\n';
  await rejects(choose({ url: 'https://github.com/pmalo/gates', ifExists: 'replace' }), 'project \'gates\' not replaced: 1 uncommitted change(s)', {
    status: 409, hint: 'Commit and push them first; or replace it anyway, losing them.',
    existing: { project: 'gates', repository: 'pmalo/gates', sameRepository: true, loss: ['1 uncommitted change(s)'], suggested: 'gates-2' },
  });
  assert.equal(P.get('gates')['src/gates.vhd'], 'mine\n');
  assert.deepEqual(removed, ['gates']);
  // a clone that fails (the repository gone): the old project never removed
  await assert.rejects(choose({ url: 'https://github.com/pmalo/missing', name: 'gates', ifExists: 'replace', discardChanges: true }), e => e.status === 404);
  assert.equal(P.get('gates')['src/gates.vhd'], 'mine\n');
  assert.deepEqual(removed, ['gates']);
  // discarded: replaced, what it had said
  r = await choose({ url: 'https://github.com/pmalo/gates', ifExists: 'replace', discardChanges: true });
  assert.deepEqual(r.replaced, { project: 'gates', trashed: false, lost: ['1 uncommitted change(s)'] });
  assert.equal(replacedText({ ...r, replaced: { ...r.replaced, trashed: true } }), 'Project \'gates\' replaced (the old one is in the workspace .trash folder): it had 1 uncommitted change(s).');
  assert.equal(P.get('gates')['src/gates.vhd'], 'entity gates is end;\n');
  assert.deepEqual(removed, ['gates', 'gates']);
  // a project in no repository: all of it would be lost
  P.set('mine', { ...GATES });
  await rejects(choose({ url: 'https://github.com/pmalo/gates', name: 'mine', ifExists: 'replace' }), notReplacedText('mine', ['it is in no git repository: its files are nowhere else']));
});

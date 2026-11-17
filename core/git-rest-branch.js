// Git's branches through GitHub's REST API (#4213, phase 4 of #4204): the browser edition's (and SILINX_GIT=github's)
// branches, with the functions and results of the system git's (server/git-branch.js). A branch is GitHub's: the
// project is on one (its meta's branch), and its commits go there. Listed: GitHub's branches. New Branch…: a branch made
// on GitHub at the project's last commit, the project on it. Switch Branch…: the project's files those of the branch's
// last commit (a pull's merge from the project's base, which its committed files leave with no conflict). Merge
// Branch…: GitHub's compare gives the two branches' merge base, the other branch's files are merged into the project's
// from it as a pull merges (a drawing by its objects, a text file by its lines, the conflicts by the user's choices),
// and a merge commit (two parents) is pushed; a branch only behind or ahead: up to date, or moved forward. A switch or a
// merge needs the project's changes committed. Isomorphic: core/git-rest.js gives its parts.
import { GitHubError as GitError } from './github-api.js';
import { checkBranchName } from './git-branch-name.js';

/** The branches' functions of core/git-rest.js's back end, from its parts: { branches, newBranch, switchBranch, merge }. */
export function restBranches({ request, R, pathOf, need, headOf, status, pullFrom, commit, meta, own }) {
  // (a switch or a merge needs no change left: a GitError naming how many)
  const needClean = async (name, again) => {
    const s = await status(name);
    if (s.files.length) throw new GitError(`the project has ${s.files.length} change(s) not committed`, `Commit your changes first, then ${again}.`, 409);
  };
  const nameOf = b => checkBranchName(b, GitError);

  /** The project's branches, GitHub's: { project, branch, github, branches: [{ name, current, local, remote }], warnings }. */
  async function branches(name) {
    const m = await need(name);
    const names = [];
    for (let page = 1; page <= 10; page++) {
      const got = await request('GET', `${R(m.owner, m.repo)}/branches?per_page=100&page=${page}`, undefined, { allow: [404, 409] });
      if (!Array.isArray(got) || !got.length) break;
      names.push(...got.map(b => b.name));
      if (got.length < 100) break;
    }
    // (a repository with no commit yet: its branch, still to be made)
    if (!names.includes(m.branch)) names.push(m.branch);
    names.sort((a, b) => a.localeCompare(b));
    return { project: name, branch: m.branch, github: true, branches: names.map(b => ({ name: b, current: b === m.branch, local: true, remote: true })), warnings: [] };
  }

  /** New Branch…: a branch made on GitHub at the project's last commit, the project on it (its changes kept): { project,
   *  branch, from, commit, pushed }. */
  async function newBranch(name, branch) {
    const m = await need(name);
    const b = nameOf(branch);
    if (!m.commit) throw new GitError('the project has no commit yet', 'Commit first, then New Branch….', 409);
    const made = await request('POST', `${R(m.owner, m.repo)}/git/refs`, { ref: `refs/heads/${b}`, sha: m.commit }, { allow: [422] });
    if (made.status) throw new GitError(`a branch '${b}' already exists`, 'Choose another name, or Switch Branch… to it.', 409);
    await meta.set(name, { ...m, branch: b });
    return { project: name, branch: b, from: m.branch, commit: m.commit, pushed: true };
  }

  // a branch's last commit and its files, or a GitError: none
  const headOfBranch = async (m, b, hint) => {
    const head = await headOf({ ...m, branch: b });
    if (!head) throw new GitError(`no branch '${b}' on GitHub`, hint, 404);
    return head;
  };

  /** Switch Branch…: the project on another branch, its files that branch's: { project, branch, from, switched, files }. */
  async function switchBranch(name, branch) {
    const m = await need(name);
    const b = nameOf(branch);
    if (b === m.branch) return { project: name, branch: b, from: m.branch, switched: false, files: [] };
    const head = await headOfBranch(m, b, 'New Branch… makes one.');
    await needClean(name, 'Switch Branch…');
    const r = await pullFrom(name, { ...m, branch: b }, head, null, 'switch');
    return { project: name, branch: b, from: m.branch, switched: true, files: r.files };
  }

  /** Merge Branch…: another branch merged into the project's, as a pull merges, then a merge commit pushed: { project,
   *  branch, from, upToDate, files, resolved, merged, renamed }; a conflict left merges nothing (a GitError with them). */
  async function merge(name, branch, { resolve = null } = {}) {
    const m = await need(name);
    const b = nameOf(branch);
    if (b === m.branch) throw new GitError(`'${b}' is the project's branch: a branch is not merged into itself`, 'Choose another branch.');
    if (!m.commit) throw new GitError('the project has no commit yet', 'Commit first, then Merge Branch….', 409);
    const theirs = await headOfBranch(m, b, 'Switch Branch… lists the branches.');
    await needClean(name, 'Merge Branch…');
    const done = r => ({ project: name, branch: m.branch, from: b, ...r });
    const cmp = await request('GET', `${R(m.owner, m.repo)}/compare/${m.commit}...${theirs.commit}`);
    if (cmp.status === 'identical' || cmp.status === 'behind') return done({ upToDate: true, files: [] });
    if (cmp.status === 'ahead') {
      // (the project's branch only behind: moved forward to the other's, never forced, then its files taken)
      const moved = await request('PATCH', `${R(m.owner, m.repo)}/git/refs/heads/${pathOf(m.branch)}`, { sha: theirs.commit, force: false }, { allow: [409, 422] });
      if (moved.status) throw new GitError('git merge: rejected by GitHub: the branch moved meanwhile', 'Pull first, then Merge Branch… again.', 409);
      const { project: _p, branch: _b, upToDate: _u, ...r } = await pullFrom(name, m, theirs, null, 'merge');
      return done({ upToDate: false, ...r });
    }
    // diverged: the merge base's files the base of both sides' changes (a file the project has as at its last commit
    // keeps its own hash, so that it is no change here)
    const base = cmp.merge_base_commit;
    const c = await request('GET', `${R(m.owner, m.repo)}/git/commits/${base.sha}`);
    const t = await request('GET', `${R(m.owner, m.repo)}/git/trees/${c.tree.sha}?recursive=1`);
    if (t.truncated) throw new GitError('the repository is too large for GitHub\'s API to list at once', 'Open it with git, in the server editions of Silinx.', 413);
    const paths = {};
    for (const e of t.tree) {
      if (e.type !== 'blob' || !own(e.path)) continue;
      const now = m.paths[e.path];
      paths[e.path] = { remote: e.sha, local: now && now.remote === e.sha ? now.local : e.sha };
    }
    const { project: _p, branch: _b, upToDate: _u, ...r } = await pullFrom(name, { ...m, commit: base.sha, tree: c.tree.sha, paths }, theirs, resolve, 'merge');
    // (the project's base its own last commit again: what the merge changed is the merge commit's)
    await meta.set(name, m);
    await commit(name, `Merge branch '${b}' into ${m.branch}`, { parents: [m.commit, theirs.commit] });
    return done({ upToDate: false, ...r });
  }

  return { branches, newBranch, switchBranch, merge };
}

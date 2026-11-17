// Git's branches (#4213, phase 4 of #4204): each person of a group works on a branch of their own, through the system's
// git: the branches listed (the project's and GitHub's, fetched first), New Branch… (made from the last commit, the
// project on it), Switch Branch… (the project's files those of the branch's last commit) and Merge Branch… (another
// branch merged into the project's, as a pull merges GitHub's commits: a drawing by its objects, a text file by its
// lines, the conflicts by the user's choices, server/git.js mergeCommits). The interface's routes (git-routes.js) and the
// MCP's tools (mcp-git.js) call these functions, through server/git.js, which exports them; the browser edition's are
// core/git-rest-branch.js's. A switch or a merge needs the project's changes committed: nothing of them is ever lost.
import * as G from './git.js';
import { checkBranchName as checkName, BRANCH_HINT } from '../core/git-branch-name.js';

const at = repo => ({ cwd: repo.dir });

/** A branch's name, checked (core/git-branch-name.js, then git's own rules: check-ref-format --branch), or a GitError. */
async function checkBranchName(repo, branch) {
  const b = checkName(branch, G.GitError);
  if ((await G.git(['check-ref-format', '--branch', b], at(repo))).code) throw new G.GitError(`'${b}' is not a valid branch name`, BRANCH_HINT);
  return b;
}

// the branches here (refs/heads) and GitHub's as the last fetch knew them (refs/remotes/origin): { name: { local, remote } }
async function refs(repo) {
  const out = await G.ok('branch', ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin'], at(repo));
  const by = new Map();
  for (const ref of out.split('\n').filter(Boolean)) {
    const local = ref.startsWith('refs/heads/');
    const name = ref.slice(local ? 11 : 20);
    if (!local && name === 'HEAD') continue;
    const b = by.get(name) || { name, local: false, remote: false };
    b[local ? 'local' : 'remote'] = true;
    by.set(name, b);
  }
  return by;
}

// the project's changes not committed (a switch or a merge needs none): a GitError naming how many; and none in the rest of
// the repository either (the workspace's, holding other projects): a switch changes every project of it, and a switch
// the import gate refuses is undone by a forced switch back, which would lose them
async function needClean(name, repo, again) {
  const s = await G.gitStatus(name);
  if (s.files.length) throw new G.GitError(`the project has ${s.files.length} change(s) not committed`, `Commit your changes first, then ${again}.`, 409);
  const out = await G.ok('status', ['status', '--porcelain', '-z', '--untracked-files=no'], { cwd: repo.top });
  const others = out.split('\0').filter(r => /^[ MADRCU?!]{2} /.test(r)).map(r => r.slice(3));
  if (others.length) {
    throw new G.GitError(`the repository has ${others.length} change(s) not committed outside the project (${others.slice(0, 5).join(', ')}${others.length > 5 ? ', …' : ''})`,
      `${again} changes every project of the repository: commit the other projects' changes first.`, 409);
  }
}

/** The project's branches: { project, branch (the project's), github (it has GitHub's: origin), branches: [{ name, current, local, remote }], warnings }:
 *  local, a branch of this repository; remote, one GitHub has (fetched first: GitHub not reached, the last fetch's, with
 *  a warning). */
export async function gitBranches(name) {
  const repo = await G.needRepo(name);
  const warnings = [];
  const hasOrigin = await G.origin(repo.dir).then(() => true, () => false);
  if (hasOrigin) {
    const r = await G.git(['fetch', '--quiet', '--prune', '--no-tags', 'origin'], { cwd: repo.dir, timeout: 180_000 });
    if (r.code) warnings.push(`GitHub's branches could not be read (${G.explain('fetch', r).message}): the ones known at the last pull are listed`);
  }
  const branch = await G.branchOf(repo.dir);
  const list = [...(await refs(repo)).values()];
  // (a repository with no commit yet: its branch, unborn, listed)
  if (branch && !list.some(b => b.name === branch)) list.push({ name: branch, local: true, remote: false });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { project: name, branch, github: hasOrigin, branches: list.map(b => ({ name: b.name, current: b.name === branch, local: b.local, remote: b.remote })), warnings };
}

/** New Branch…: a branch made from the project's last commit, the project on it (its changes not committed kept, on the
 *  new branch): { project, branch, from, commit }. Push sends it to GitHub. */
export async function gitNewBranch(name, branch) {
  const repo = await G.needRepo(name);
  const b = await checkBranchName(repo, branch);
  const known = (await refs(repo)).get(b);
  if (known?.local) throw new G.GitError(`a branch '${b}' already exists`, 'Choose another name, or Switch Branch… to it.', 409);
  if (known?.remote) throw new G.GitError(`a branch '${b}' is on GitHub already`, 'Choose another name, or Switch Branch… to it.', 409);
  const from = await G.branchOf(repo.dir);
  await G.ok('switch', ['switch', '--quiet', '-c', b], at(repo));
  return { project: name, branch: b, from, commit: await G.headOf(repo.dir) };
}

/** Switch Branch…: the project on another branch, its files that branch's last commit's (a branch only GitHub has: made
 *  here, following GitHub's); what it brings passes the import gate, as a pull's: { project, branch, from, switched,
 *  files, warnings }. The project's changes must be committed. */
export async function gitSwitch(name, branch) {
  const repo = await G.needRepo(name);
  const b = await checkBranchName(repo, branch);
  const from = await G.branchOf(repo.dir);
  if (b === from) return { project: name, branch: b, from, switched: false, files: [] };
  const known = (await refs(repo)).get(b);
  if (!known) throw new G.GitError(`no branch '${b}', here or on GitHub`, 'New Branch… makes one.', 404);
  await needClean(name, repo, 'Switch Branch…');
  const before = await G.headOf(repo.dir);
  const kept = await G.keptOut(repo);
  const had = await G.keepTrust(name, repo);
  try {
    const r = await G.git(['switch', '--quiet', ...(known.local ? [b] : ['-c', b, '--track', `origin/${b}`])], at(repo));
    if (r.code) throw G.explain('switch', r);
    const after = await G.headOf(repo.dir);
    // (refused by the gate: back on the branch it was on, the one made for it removed; forced, for the files the gate took
    // out, which needClean's clean repository makes safe: nothing of the user's to lose)
    const undo = async () => {
      await G.git(['switch', '--quiet', '--force', ...(from ? [from] : ['--detach', before])], at(repo));
      if (!known.local) await G.git(['branch', '-D', b], at(repo));
    };
    const gated = before === after || !after ? { out: [], warnings: [] } : await G.gatePulled(repo, before, after, kept, {}, { op: 'switch', undo });
    const files = await G.changedBetween(repo, before, after, gated.out);
    return { project: name, branch: b, from, switched: true, files, ...(gated.warnings.length ? { warnings: gated.warnings } : {}) };
  } finally { await G.broughtUntrusted(repo, had); }
}

/** Merge Branch…: another branch merged into the project's (GitHub's version of it when it is ahead of this
 *  repository's): the drawings both changed by their objects, the text files by their lines, the conflicts by the choices
 *  of `resolve` (as a pull's); a conflict left merges nothing and is a GitError with the conflicts. -> { project, branch,
 *  from, upToDate, files, resolved, merged, warnings }. The project's changes must be committed. */
export async function gitMerge(name, branch, { resolve = null } = {}) {
  const repo = await G.needRepo(name);
  const b = await checkBranchName(repo, branch);
  const cur = await G.branchOf(repo.dir);
  if (!cur) throw new G.GitError('the project is on no branch (a detached HEAD)', 'Switch Branch… to one first.', 409);
  if (b === cur) throw new G.GitError(`'${b}' is the project's branch: a branch is not merged into itself`, 'Choose another branch.');
  if (!await G.headOf(repo.dir)) throw new G.GitError('the project has no commit yet', 'Commit first, then Merge Branch….', 409);
  const known = (await refs(repo)).get(b);
  if (!known) throw new G.GitError(`no branch '${b}', here or on GitHub`, 'Switch Branch… lists the branches.', 404);
  // (here and on GitHub: GitHub's when this repository's is behind it, its other author's last commits)
  const behind = known.local && known.remote && !(await G.git(['merge-base', '--is-ancestor', `refs/heads/${b}`, `refs/remotes/origin/${b}`], at(repo))).code;
  const ref = known.local && !behind ? `refs/heads/${b}` : `refs/remotes/origin/${b}`;
  await needClean(name, repo, 'Merge Branch…');
  const had = await G.keepTrust(name, repo);
  try {
    const r = await G.mergeCommits(name, repo, { op: 'merge', args: ['merge', '--no-edit', '--ff', '-m', `Merge branch '${b}' into ${cur}`, ref], resolve });
    return { project: name, branch: cur, from: b, ...r };
  } finally { await G.broughtUntrusted(repo, had); }
}

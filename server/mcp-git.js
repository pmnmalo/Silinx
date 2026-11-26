// The MCP server's tools of git (#3195, #2674): a project in a GitHub repository, as the interface's File ▸ Open from
// Repository… and File ▸ Git: clone, init, status, commit, push, pull, the history and a file as it was in a commit,
// the checks GitHub ran on the last push (#3194), the branches (#4213: listed, made, switched, merged),
// through the same functions (server/git.js), with the same checks and messages. The credentials are the system's
// credential helper's: no tool takes or gives one.
import * as Git from './git.js';
import * as GH from './git-github.js';
import * as P from './projects.js';
import * as backupStore from './backup-store.js';
import { toolError, clip, readProject, STR, PROJECT, projectText } from './mcp-util.js';
import { mcpRemotes } from './toolchain.js';
import { fileDiff } from './mcp-file-diff.js';
import { checkChoices } from '../core/git-resolve.js';
import { checksLines } from '../core/github-checks.js';
import { IF_EXISTS, openedText, replacedText, keptBothText } from '../core/git-clone-exists.js';
import { gitCloneChoosing } from './git-clone.js';
import { filterRepositories, repoLine } from '../core/github-repos.js';
import { cloneText, initText, commitText, pushText, pullText, fileLines, changesFirst, conflictCount, shortCommit as short, hunkLines, pullMergeLines, branchesText, newBranchText, switchText, mergeBranchText } from '../core/git-messages.js';

// the back end: the system's git, or GitHub's API (SILINX_GIT=github, #3196)
const B = () => (GH.githubBackend() ? GH : Git);

// a git failure: its message, then its hint, as the console shows them
const run = async (fn, more = () => []) => {
  if (!Git.gitEnabled()) throw toolError('git is turned off on this server (SILINX_GIT=off)');
  try { return await fn(); } catch (e) {
    if (e instanceof Git.GitError || e.status) {
      // (a drawing's conflicts: each object's id, a text file's: each hunk's (#4214), for git_pull's resolve)
      const conflicts = [...(e.drawings || []).flatMap(d => d.conflicts.map(c => `  ${d.path}: ${c.id} (${c.label}): mine ${c.mine}, theirs ${c.theirs}`)),
        ...(e.texts || []).flatMap(t => hunkLines(t.path, t.hunks))];
      throw Object.assign(toolError([e.message, ...conflicts, ...more(e), ...(e.hint ? [`Hint: ${e.hint}`] : [])].join('\n')), e.files ? { files: e.files } : {}, e.drawings ? { drawings: e.drawings } : {}, e.texts ? { texts: e.texts } : {});
    }
    throw e;
  }
};
// a remote the MCP server may give a project (#3363: git_push then sends the project there): one the user's settings name
// (mcp.remotes in config.json, "owner/repo" or "owner/*"); never one an assistant chose alone
async function allowedRemote(remote) {
  const r = await run(async () => Git.checkUrl(remote));
  const allow = mcpRemotes();
  const repo = `${r.owner}/${r.repo}`.toLowerCase();
  if (allow.includes(repo) || allow.includes(`${r.owner.toLowerCase()}/*`)) return remote;
  throw toolError(`remote: ${r.owner}/${r.repo} is not among the repositories the user lets the MCP server set (mcp.remotes in config.json: "owner/repo" or "owner/*"); the user sets another in the interface (File ▸ Git ▸ Store Project in a GitHub Repository…)`);
}
// the choices of a pull's or a merge's conflicts (git_pull, git_merge)
const RESOLVE = (what) => ({ type: 'object', description: `The choices of the ${what}'s conflicts, by file: a drawing's objects { "src/ctl.fsm.json": { "transitions/t1": "theirs" } }, a text file's hunks { "src/top.vhd": { "h1": "both", "h2": { "text": "y <= a;\\n" } } }.`, additionalProperties: { type: 'object', additionalProperties: { anyOf: [{ type: 'string', enum: ['mine', 'theirs', 'both'] }, { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }] } } });
const choicesOf = resolve => { try { return checkChoices(resolve); } catch (e) { throw toolError(e.message); } };
// a project of the name already there (#4618): what the interface's question shows, for if_exists
const existingLines = e => (e.existing ? [
  `It is ${e.existing.sameRepository ? 'a clone of the same repository' : `not a clone of ${e.existing.repository}`}; ${e.existing.loss.length ? `replacing it would lose: ${e.existing.loss.join('; ')}` : 'replacing it would lose nothing (every change committed and pushed)'}.`,
  `if_exists: "open" opens it${e.existing.sameRepository ? ' (git_pull brings it up to date)' : ''}, "replace" replaces it${e.existing.loss.length ? ' (with discard_changes: true, losing that)' : ''}, "rename" opens the repository as '${e.existing.suggested}'.`,
] : []);
const UNTRUSTED = ' It is untrusted, as every project from outside: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';

export const GIT_TOOLS = [
  {
    name: 'git_clone', title: 'Open a project from a GitHub repository',
    description: 'Clone a GitHub repository (an https or git@ address; a GitHub Classroom assignment\'s) into the workspace as a project, as File ▸ Open from GitHub Repository… does. Its root must hold silinx.json; its files pass the import gate; git\'s own credentials. A project of the name already there: if_exists, as the interface asks: "error" (default: nothing done), "open" (as it is), "replace" (the clone checked first, the old project moved to the workspace\'s .trash; refused with uncommitted changes, unpushed commits or no repository, unless discard_changes), "rename" (the clone as name-2…).',
    inputSchema: { type: 'object', properties: { url: STR('The repository\'s address on GitHub.'), name: STR('The project\'s name (default: the repository\'s).'),
      if_exists: { type: 'string', enum: IF_EXISTS, description: 'A project of the name already there: "error" (default), "open", "replace" or "rename".' },
      discard_changes: { type: 'boolean', description: 'With if_exists "replace": replace the project although it has changes nowhere else, losing them. Only when the user said so.' } }, required: ['url'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ url, name, if_exists: ifExists = 'error', discard_changes: discardChanges = false }) {
      const r = await run(() => gitCloneChoosing({ url, name: name || null, ifExists, discardChanges: discardChanges === true, madeBy: 'mcp' }), existingLines);
      if (r.opened) return { text: openedText(r), data: r };
      const lines = [...(r.replaced ? [replacedText(r)] : []), ...(r.renamedFrom ? [keptBothText(r)] : []), `${cloneText(r)}${UNTRUSTED}`];
      return { text: [...lines, ...r.warnings.map(w => `WARNING: ${w}`)].join('\n'), data: { ...r, trusted: false }, untrusted: r.warnings.length ? 'the warnings, which name the repository\'s files' : undefined };
    },
  },
  {
    name: 'git_repositories', title: 'The user\'s GitHub repositories',
    description: 'The user\'s GitHub repositories (owned, a collaborator\'s, an organization\'s), most recently pushed first, as File ▸ Open from GitHub Repository… lists them, for git_clone. Listed with the server\'s GH_TOKEN, or else gh; with neither, the error says how.',
    inputSchema: { type: 'object', properties: { query: STR('Only the repositories whose owner/name or description has this (any case).') }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run({ query }) {
      const r = await run(async () => (await import('./git-repos.js')).gitRepositories());
      const list = filterRepositories(r.repositories, query);
      const head = `${list.length} repositor${list.length === 1 ? 'y' : 'ies'}${query ? ` with '${query}'` : ''} of ${r.repositories.length}, the most recently pushed first (through ${r.source === 'gh' ? 'GitHub\'s command line' : 'GitHub\'s API'}).`;
      return { text: [head, ...list.map(x => `  ${repoLine(x)}`)].join('\n'), data: { source: r.source, repositories: list }, untrusted: list.length ? 'the repositories\' names and descriptions' : undefined };
    },
  },
  {
    name: 'git_init', title: 'Make a git repository of a project',
    description: 'Make a git repository of a project (branch main, a .gitignore leaving build/ out), as File ▸ Git ▸ Store Project in a GitHub Repository… does; remote: its GitHub repository (origin), only one the user\'s settings allow (mcp.remotes in config.json).',
    inputSchema: { type: 'object', properties: { project: PROJECT, remote: STR('The GitHub repository\'s address (optional): origin; one of mcp.remotes.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project, remote }) {
      await readProject(project);
      if (remote) await allowedRemote(remote);
      const r = await run(() => B().gitInit(project, { remote: remote || null }));
      return { text: initText(project, r), data: r };
    },
  },
  {
    name: 'git_status', title: 'A project\'s changes',
    description: 'A project\'s files changed, new, deleted or in conflict since the last commit, its GitHub repository, its branch and its commits ahead of or behind GitHub, as the Collaboration tab and Changes… show them.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project }) {
      await readProject(project);
      const s = await run(() => B().gitStatus(project));
      if (!s.repository) return { text: `'${project}' is not in a git repository (git_init makes one).`, data: s };
      const where = `${s.branch || '(no branch)'}${s.upstream ? `, ${s.ahead} commit(s) ahead of and ${s.behind} behind ${s.upstream}` : ', not pushed yet'}${s.remote ? ` (GitHub: ${s.remote})` : ' (no GitHub repository)'}`;
      // (the files' names and the branches', a clone's own: labelled, #4174)
      // (the conflicts first and counted, as Changes… lists them, #4581)
      const conflicts = conflictCount(s.files);
      return { text: [`${project}: ${where}; ${s.files.length ? `${s.files.length} change(s)${conflicts ? `, ${conflicts} in conflict` : ''}:` : 'no change since the last commit.'}`, ...fileLines(changesFirst(s.files))].join('\n'), data: s,
        untrusted: 'the files\' and the branches\' names, the repository\'s' };
    },
  },
  {
    name: 'git_commit', title: 'Commit a project\'s changes',
    description: 'Commit every change of the project\'s folder (never build/ or the tools\' outputs), with a message, as File ▸ Git ▸ Commit… does. A project with no .gitignore gets Silinx\'s first.',
    inputSchema: { type: 'object', properties: { project: PROJECT, message: STR('What changed, in a few words.') }, required: ['project', 'message'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project, message }) {
      await readProject(project);
      const r = await run(() => B().gitCommit(project, message));
      return { text: commitText(r), data: r };
    },
  },
  {
    name: 'git_push', title: 'Push a project to GitHub',
    description: 'Push the project\'s commits to its GitHub repository (origin), as File ▸ Git ▸ Push does. A push GitHub rejects (it has commits this project has not) says to pull first.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project }) {
      await readProject(project);
      const r = await run(() => B().gitPush(project));
      await backupStore.record(P.projectDir(project), 'github');   // (its back-up on GitHub, #4971)
      return { text: pushText(r), data: r };
    },
  },
  {
    name: 'git_pull', title: 'Pull a project from GitHub',
    description: 'Pull the commits of the project\'s GitHub repository into it (a merge), as File ▸ Git ▸ Pull does. Drawings merge by their objects (their HDL made again), text files by their lines. A conflict (an object both sides changed, by its id; the same lines, a hunk h1, h2…) is named: pull again with resolve ("mine", "theirs", "both" or { "text" } each); never conflict markers. Any other conflict (removed on one side, changed on the other) pulls nothing. Pulled files pass the import gate: a hidden file, a tool\'s output or another spelling of silinx.json stays out (a WARNING each); another refused file pulls nothing.',
    inputSchema: { type: 'object', properties: { project: PROJECT, resolve: RESOLVE('pull') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ project, resolve }) {
      await readProject(project);
      const r = await run(() => B().gitPull(project, { resolve: choicesOf(resolve) }));
      return { text: [pullText(r), ...pullMergeLines(r), ...(r.warnings || []).map(w => `WARNING: ${w}`)].join('\n'), data: r,
        untrusted: r.upToDate && !r.warnings?.length ? undefined : 'the pulled files\' names and the warnings, which name them' };
    },
  },
  {
    name: 'git_log', title: 'A project\'s history',
    description: 'The project\'s commits, newest first (hash, author, date, message, files changed), as File ▸ Git ▸ History… lists them; with commit and path: that file\'s text in the commit, read only.',
    inputSchema: { type: 'object', properties: { project: PROJECT, limit: { type: 'integer', description: 'How many commits (default 100, at most 1000).' }, commit: STR('A commit\'s hash: with path, that file as it was.'), path: STR('A file of the project, e.g. src/top.vhd: its text in the commit.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project, limit, commit, path: rel }) {
      await readProject(project);
      if (rel || commit) {
        if (!rel || !commit) throw toolError('give both commit and path: a file as it was in a commit');
        const r = await run(() => B().gitShow(project, commit, rel));
        return { text: clip(r.text), data: { project, commit: r.commit, path: r.path, length: r.text.length }, untrusted: `${r.path} as it was in ${short(r.commit)}` };
      }
      const log = await run(() => B().gitLog(project, { limit }));
      return { text: log.length ? log.map(c => `${short(c.commit)} ${c.date} ${c.author}: ${c.message}${c.files.length ? ` (${c.files.map(f => f.path).join(', ')})` : ''}`).join('\n') : `'${project}' has no commit yet.`, data: { project, commits: log }, untrusted: log.length ? 'the commits\' messages and authors' : undefined };
    },
  },
  {
    name: 'git_checks', title: 'What GitHub said of the last push',
    description: 'The checks GitHub ran on the project\'s last pushed commit, as File ▸ Git ▸ GitHub Checks says them: each workflow\'s state and annotations; a GitHub Classroom assignment\'s visible tests\' verdicts. A private repository needs the server\'s GH_TOKEN.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run({ project }) {
      await readProject(project);
      const r = await run(() => B().gitChecks(project));
      return { text: checksLines(r).map(l => (l.level === 'error' ? `ERROR: ${l.text}` : l.level === 'warning' ? `WARNING: ${l.text}` : l.text)).join('\n'), data: r, untrusted: r.runs.length ? 'the checks\' names, titles and annotations, which the repository\'s workflows wrote' : undefined };
    },
  },
  {
    name: 'git_diff', title: 'What changed in a file',
    description: 'A file of the project between two versions, as the history\'s Compare shows it: a drawing by its objects (added, removed, moved, changed: each by its id), any other file as a unified diff.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('A file of the project, e.g. src/ctl.fsm.json.'), from: STR('A commit\'s hash (default: the last commit).'), to: STR('A commit\'s hash (default: the project now).') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project, path: rel, from, to }) {
      await readProject(project);
      const at = async c => { try { return (await B().gitShow(project, c, rel)).text; } catch (e) { if (e.status === 404) return null; throw e; } };
      const a = await run(async () => at(from || (await B().gitLog(project, { limit: 1 }))[0]?.commit || toolErrorOf('the project has no commit yet')));
      const b = to ? await run(() => at(to)) : await projectText(project, rel, `no file '${rel}' in the project '${project}'`).catch(() => null);
      const fromL = from ? short(from) : 'the last commit', toL = to ? short(to) : 'now';
      if (a === null && b === null) throw toolError(`no file '${rel}' in ${fromL} nor ${toL}`);
      return fileDiff(rel, a, b, { fromL, toL, data: { project, path: rel, from: from || null, to: to || null } });
    },
  },
  {
    name: 'git_branch', title: 'A project\'s branches, or a new one',
    description: 'Without branch: the project\'s branches, its own marked, and GitHub\'s (fetched first), as Switch Branch… lists them. With branch: a new branch from the last commit, the project on it (uncommitted changes kept), as File ▸ Git ▸ New Branch… does; git_push sends it. A name: letters, digits, -, _, . and /.',
    inputSchema: { type: 'object', properties: { project: PROJECT, branch: STR('The new branch\'s name (e.g. ana): made, the project on it. None: the branches listed.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project, branch }) {
      await readProject(project);
      if (branch === undefined) {
        const r = await run(() => B().gitBranches(project));
        return { text: [branchesText(r), ...r.warnings.map(w => `WARNING: ${w}`)].join('\n'), data: r, untrusted: 'the branches\' names, the repository\'s' };
      }
      const r = await run(() => B().gitNewBranch(project, branch));
      return { text: newBranchText(r), data: r };
    },
  },
  {
    name: 'git_switch', title: 'Switch a project to another branch',
    description: 'The project on another branch, its files the branch\'s last commit\'s, as File ▸ Git ▸ Switch Branch… does; a branch only GitHub has is made here, following GitHub\'s. The project\'s changes must be committed first. The files it brings pass the import gate.',
    inputSchema: { type: 'object', properties: { project: PROJECT, branch: STR('The branch\'s name, as git_branch lists it.') }, required: ['project', 'branch'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ project, branch }) {
      await readProject(project);
      const r = await run(() => B().gitSwitch(project, branch));
      return { text: [switchText(r), ...(r.warnings || []).map(w => `WARNING: ${w}`)].join('\n'), data: r, untrusted: r.switched ? 'the files\' names, the branch\'s' : undefined };
    },
  },
  {
    name: 'git_merge', title: 'Merge another branch into a project\'s',
    description: 'Another branch merged into the project\'s (GitHub\'s when newer), as File ▸ Git ▸ Merge Branch… does, the way git_pull merges; a conflict merges nothing: merge again with resolve. A merge commit records it. The project\'s changes must be committed first.',
    inputSchema: { type: 'object', properties: { project: PROJECT, branch: STR('The branch to merge in.'), resolve: RESOLVE('merge') }, required: ['project', 'branch'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ project, branch, resolve }) {
      await readProject(project);
      const r = await run(() => B().gitMerge(project, branch, { resolve: choicesOf(resolve) }));
      return { text: [mergeBranchText(r), ...pullMergeLines(r), ...(r.warnings || []).map(w => `WARNING: ${w}`)].join('\n'), data: r,
        untrusted: r.upToDate && !r.warnings?.length ? undefined : 'the merged files\' names and the warnings, which name them' };
    },
  },
];
const toolErrorOf = m => { throw toolError(m); };

// The MCP server's tools of git (#3195, #2674): a project in a GitHub repository, as the interface's File ▸ Open from
// Repository… and File ▸ Git: clone, init, status, commit, push, pull, the history and a file as it was in a commit,
// the checks GitHub ran on the last push (#3194), the branches (#4213: listed, made, switched, merged),
// through the same functions (server/git.js), with the same checks and messages. The credentials are the system's
// credential helper's: no tool takes or gives one.
import * as Git from './git.js';
import * as GH from './git-github.js';
import { toolError, clip, readProject, STR, PROJECT, projectText } from './mcp-util.js';
import { mcpRemotes } from './toolchain.js';
import { drawingKind, diffDrawings } from '../core/drawing-merge.js';
import { unifiedDiff } from '../core/text-diff.js';
import { checkChoices } from '../core/git-resolve.js';
import { checksLines } from '../core/github-checks.js';
import { IF_EXISTS, openedText, replacedText, keptBothText } from '../core/git-clone-exists.js';
import { gitCloneChoosing } from './git-clone.js';
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
const RESOLVE = (what) => ({ type: 'object', description: `The choices of the ${what}'s conflicts: a drawing's objects { "src/ctl.fsm.json": { "transitions/t1": "theirs", "states/s2": "mine" } }, a text file's hunks { "src/top.vhd": { "h1": "both", "h2": { "text": "  y <= a or b;\\n" } } }.`, additionalProperties: { type: 'object', additionalProperties: { anyOf: [{ type: 'string', enum: ['mine', 'theirs', 'both'] }, { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }] } } });
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
    description: 'Clone a GitHub repository (https://github.com/owner/repo, git@github.com:owner/repo.git; a GitHub Classroom assignment\'s repository) into the workspace as a project, as File ▸ Open from GitHub Repository… does. Its root must hold the project (silinx.json); its files pass the import gate. The credentials are git\'s own (its credential helper, an SSH key). A project of the name already there (#4618): if_exists says what to do, as the interface\'s question: "error" (the default: nothing done, the existing project described), "open" (it opened as it is; git_pull brings it up to date when it is a clone of the same repository), "replace" (the clone made and checked first, then the old project moved to the workspace\'s .trash folder; refused when it has uncommitted changes, unpushed commits or is in no repository, named, unless discard_changes is true), "rename" (both kept: the clone under a free name, name-2…).',
    inputSchema: { type: 'object', properties: { url: STR('The repository\'s address on GitHub.'), name: STR('The project\'s name (default: the repository\'s).'),
      if_exists: { type: 'string', enum: IF_EXISTS, description: 'A project of the name already there: "error" (default), "open", "replace" or "rename".' },
      discard_changes: { type: 'boolean', description: 'With if_exists "replace": replace the project even though it has changes nowhere else (the error named them), losing them. Only when the user said so.' } }, required: ['url'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ url, name, if_exists: ifExists = 'error', discard_changes: discardChanges = false }) {
      const r = await run(() => gitCloneChoosing({ url, name: name || null, ifExists, discardChanges: discardChanges === true, madeBy: 'mcp' }), existingLines);
      if (r.opened) return { text: openedText(r), data: r };
      const lines = [...(r.replaced ? [replacedText(r)] : []), ...(r.renamedFrom ? [keptBothText(r)] : []), `${cloneText(r)}${UNTRUSTED}`];
      return { text: [...lines, ...r.warnings.map(w => `WARNING: ${w}`)].join('\n'), data: { ...r, trusted: false }, untrusted: r.warnings.length ? 'the warnings, which name the repository\'s files' : undefined };
    },
  },
  {
    name: 'git_init', title: 'Make a git repository of a project',
    description: 'Make a git repository of a project (git init, branch main, a .gitignore that leaves build/ and the tools\' outputs out), as File ▸ Git ▸ Store Project in a GitHub Repository… does; remote: its GitHub repository (origin), which a project already in a repository with no remote gets too: only one the user\'s settings let the MCP server set (mcp.remotes in config.json).',
    inputSchema: { type: 'object', properties: { project: PROJECT, remote: STR('The GitHub repository\'s address (optional): origin, where git_push pushes; one of the user\'s settings (mcp.remotes).') }, required: ['project'], additionalProperties: false },
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
    description: 'A project\'s files changed, new, deleted or in conflict since the last commit (the Design pane\'s marks; the conflicts first, as Changes… lists them), its GitHub repository (owner/repository), its branch and how many commits it is ahead of or behind GitHub: what the Collaboration tab and its Changes… window show.',
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
    description: 'Commit every change of the project\'s folder (its files only; build/ and the tools\' outputs never), with a message, as File ▸ Git ▸ Commit… does. A project with no .gitignore gets Silinx\'s first.',
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
      return { text: pushText(r), data: r };
    },
  },
  {
    name: 'git_pull', title: 'Pull a project from GitHub',
    description: 'Pull the commits of the project\'s GitHub repository into it (a merge), as File ▸ Git ▸ Pull does. A drawing changed on both sides is merged by its objects (never as text), its HDL made again; an object both sides changed differently is a conflict, named with its id: Pull again with resolve, "mine" or "theirs" for each (the result checked as Check Drawing checks it). A text file (HDL, a test bench, constraints, C/C++) changed on both sides is merged by its lines: changes apart at once; the same lines a conflict per hunk, named with its id (h1, h2…), its line and both sides\' lines: Pull again with resolve, "mine", "theirs", "both" (mine\'s lines, then theirs\') or { "text": "…" } (the hunk\'s lines written) for each; never conflict markers. A file renamed on one side and changed on the other is merged as a rename. Any other conflict (a file removed on one side and changed on the other) pulls nothing: the project\'s files stay as they were, and the files in conflict are named. The pulled files pass the import gate: a hidden file, a tool\'s output or another spelling of silinx.json stays out of the project\'s folder (a WARNING each); another file it refuses pulls nothing.',
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
    description: 'The project\'s commits, the newest first (hash, author, date, message, the files each changed), as File ▸ Git ▸ History… lists them; path: a file\'s text as it was in a commit (commit required), read only.',
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
    description: 'The checks GitHub ran on the project\'s last pushed commit, as File ▸ Git ▸ GitHub Checks says them: each workflow\'s state (queued, running, its conclusion) and its annotations; a GitHub Classroom assignment\'s workflow gives each visible test\'s verdict (Accepted, Wrong Answer and its first difference). A check still running: ask again later. A private repository\'s needs the server\'s GitHub token (GH_TOKEN).',
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
    description: 'A file of the project between two versions, as the history\'s Compare shows it: a drawing (schematic, ASM chart, state diagram, truth table, Boolean function, Petri net) by its objects (added, removed, moved, changed: each by its id), any other file by its lines (a unified diff). from: a commit (default: the last one); to: a commit (default: the project as it is now).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('A file of the project, e.g. src/ctl.fsm.json.'), from: STR('A commit\'s hash (default: the last commit).'), to: STR('A commit\'s hash (default: the project now).') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project, path: rel, from, to }) {
      await readProject(project);
      const at = async c => { try { return (await B().gitShow(project, c, rel)).text; } catch (e) { if (e.status === 404) return null; throw e; } };
      const a = await run(async () => at(from || (await B().gitLog(project, { limit: 1 }))[0]?.commit || toolErrorOf('the project has no commit yet')));
      const b = to ? await run(() => at(to)) : await projectText(project, rel, `no file '${rel}' in the project '${project}'`).catch(() => null);
      const fromL = from ? short(from) : 'the last commit', toL = to ? short(to) : 'now';
      if (a === null && b === null) throw toolError(`no file '${rel}' in ${fromL} nor ${toL}`);
      if (drawingKind(rel)) {
        let A = null, Bm = null;
        try { A = a === null ? {} : JSON.parse(a); Bm = b === null ? {} : JSON.parse(b); } catch { A = null; }
        if (A) {
          const d = diffDrawings(A, Bm);
          const name = (coll, key) => { const o = [...(Bm[coll] || []), ...(A[coll] || [])].find(x => String(x?.id ?? x?.name) === key); return o?.name && o.name !== key ? ` (${o.name})` : ''; };
          const lines = [...d.added.map(x => `added ${x.coll}/${x.key}${name(x.coll, x.key)}`), ...d.removed.map(x => `removed ${x.coll}/${x.key}${name(x.coll, x.key)}`),
            ...d.moved.map(x => `moved ${x.coll}/${x.key}${name(x.coll, x.key)}`), ...d.changed.map(x => `changed ${x.coll}/${x.key}${name(x.coll, x.key)}${x.fields.length ? `: ${x.fields.join(', ')}` : ''}`), ...d.props.map(p => `changed ${p}`)];
          return { text: [`${rel}, ${fromL} to ${toL}: ${lines.length ? `${lines.length} change(s)` : 'no change'}.`, ...lines.map(l => `  ${l}`)].join('\n'), data: { project, path: rel, from: from || null, to: to || null, diff: d }, untrusted: `the changes of ${rel}` };
        }
      }
      const u = unifiedDiff(a ?? '', b ?? '', { from: `${rel} (${fromL})`, to: `${rel} (${toL})` });
      return { text: u ? clip(u) : `${rel}, ${fromL} to ${toL}: no change.`, data: { project, path: rel, from: from || null, to: to || null, changed: !!u }, untrusted: u ? `the changes of ${rel}` : undefined };
    },
  },
  {
    name: 'git_branch', title: 'A project\'s branches, or a new one',
    description: 'Each person of a group works on a branch of their own. Without branch: the project\'s branches, its own marked, and GitHub\'s (fetched first; one only GitHub has: "on GitHub"), as Switch Branch… lists them. With branch: a new branch made from the project\'s last commit, the project on it (its changes not committed kept), as File ▸ Git ▸ New Branch… does; git_push then sends it to GitHub. A branch\'s name: letters, digits, -, _, . and /, no spaces.',
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
    description: 'The project on another branch, its files those of the branch\'s last commit, as File ▸ Git ▸ Switch Branch… does; a branch only GitHub has (another person\'s, listed by git_branch) is made here, following GitHub\'s. The project\'s changes must be committed first (git_commit). The files it brings pass the import gate, as a pull\'s.',
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
    description: 'Another branch (another person\'s, as git_branch lists it; GitHub\'s version when it is newer) merged into the project\'s, as File ▸ Git ▸ Merge Branch… does, the way git_pull merges: a drawing changed on both branches by its objects, its HDL made again; a text file by its lines; a conflict (an object both changed differently, named by its id; the same lines, a hunk h1, h2…) merges nothing: Merge again with resolve, as git_pull\'s. A merge commit records it. The project\'s changes must be committed first.',
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

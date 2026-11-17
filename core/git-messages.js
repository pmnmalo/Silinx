// The messages of git's commands (#3195), the same in the interface's console and in the MCP server's results
// (server/mcp-git.js): what a clone, a commit, a push, a pull, an init did, from their results (server/git.js).
// Isomorphic.

const STATE = { modified: 'changed', new: 'new', deleted: 'deleted', conflict: 'in conflict' };
export const stateWord = s => STATE[s] || s;
export const fileLines = files => files.map(f => `  ${f.path} (${stateWord(f.state)})`);
export const shortCommit = c => String(c || '').slice(0, 7);

export const cloneText = r => `Project '${r.project}' opened from the GitHub repository ${r.repository}.`;
export const initText = (project, r) => (r.created ? `Repository made for '${project}'${r.remote ? `, its remote ${r.remote}` : ''}${r.gitignore ? '; .gitignore written' : ''}.` : `'${project}': its remote is now ${r.remote}.`);
export const commitText = r => [`Committed ${shortCommit(r.commit)} on ${r.branch || '(no branch)'}: ${r.files.length} file(s).`, ...fileLines(r.files)].join('\n');
export const pushText = r => (r.pushed ? `Pushed ${r.branch} to ${r.remote}.` : `Nothing to push: ${r.remote} has every commit of ${r.branch}.`);
export const pullText = r => (r.upToDate ? `Already up to date: ${r.branch} has every commit of GitHub's.` : [`Pulled into ${r.branch}: ${r.files.length} file(s) changed.`, ...r.files.map(f => `  ${f}`)].join('\n'));

/** A text file's conflicts, each hunk's id with its first line here and what each side has there (#4214): the lines the
 *  MCP gives for git_pull's and merge_contribution's resolve (Mine, Theirs, Both, or a text). */
export const hunkLines = (path, hunks) => hunks.map(h => `  ${path}: ${h.id} (line ${h.at.mine}): mine ${JSON.stringify(h.mine.join('\n'))}, theirs ${JSON.stringify(h.theirs.join('\n'))}`);

/** What a pull did beyond taking files: the drawings merged by their objects, the text files by their lines, the files
 *  renamed (#4214). designOnly: a design project's drawings have no HDL. */
export const pullMergeLines = (r, { designOnly = false } = {}) => [
  ...(r.resolved || []).map(f => (designOnly ? `${f}: merged by its objects.` : `${f}: merged by its objects, its HDL made again.`)),
  ...(r.merged || []).map(f => `${f}: merged by its lines.`),
  ...(r.renamed || []).map(x => `${x.from}: renamed ${x.side === 'theirs' ? 'on GitHub' : 'here'} to ${x.to}, the other side's changes merged into it.`),
];

// the branches (#4213): listed, made, switched, merged
const where = (b, github) => (!github ? '' : b.local ? (b.remote ? '' : ' (not on GitHub yet)') : ' (on GitHub)');
export const branchesText = r => [`${r.project}: on ${r.branch || '(no branch)'}; ${r.branches.length} branch(es):`, ...r.branches.map(b => `  ${b.current ? '* ' : ''}${b.name}${where(b, r.github)}`)].join('\n');
export const newBranchText = r => `Branch ${r.branch} made from ${r.from || 'the last commit'}: the project is on it now${r.pushed ? ', on GitHub too' : '; Push sends it to GitHub'}.`;
export const switchText = r => (r.switched ? [`Switched to ${r.branch}: ${r.files.length} file(s) changed.`, ...r.files.map(f => `  ${f}`)].join('\n') : `Already on ${r.branch}.`);
export const mergeBranchText = r => (r.upToDate ? `Already up to date: ${r.branch} has every commit of ${r.from}.` : [`Merged ${r.from} into ${r.branch}: ${r.files.length} file(s) changed.`, ...r.files.map(f => `  ${f}`)].join('\n'));

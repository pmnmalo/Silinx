// Open from GitHub Repository… onto a project of the same name (#4618): rather than failing, the existing project opened
// as it is (Open and Pull, when it is a clone of the same repository), replaced (the clone made and checked first, the
// old project removed only then; refused when it has changes nowhere else, unless the user confirmed losing them,
// named), or both kept (the clone under a free name). The interface's dialog (web/js/git-clone-exists.js) and the MCP's
// git_clone (if_exists) choose through cloneOrChoose, with the same checks and messages; its back end is the caller's
// (server/git-clone.js: the system git's or GitHub's API; web/js/git-browser.js: the browser edition's). Isomorphic.

/** What git_clone may do with a project of the same name: fail (as before), open it, replace it, or keep both. */
export const IF_EXISTS = ['error', 'open', 'replace', 'rename'];

/** A free name for a second copy: name-2, name-3… (taken: async name -> whether a project has it). */
export async function freeName(name, taken) {
  for (let i = 2; ; i++) {
    const n = `${name.slice(0, 64 - String(i).length - 1)}-${i}`;
    if (!await taken(n)) return n;
  }
}

/** What replacing a project would lose, from its git status: its uncommitted changes and its commits GitHub has not;
 *  all of it, when it is in no repository -> [] when nothing. */
export function lossOf(s) {
  if (!s?.repository) return ['it is in no git repository: its files are nowhere else'];
  const out = [];
  if (s.files?.length) out.push(`${s.files.length} uncommitted change(s)`);
  if (!s.upstream) out.push('its commits were never pushed to GitHub');
  else if (s.ahead) out.push(`${s.ahead} commit(s) not pushed to GitHub`);
  return out;
}

export const REPLACE_HINT = 'Commit and push them first; or replace it anyway, losing them.';
/** The refusal's message: a replace that would lose what it names. */
export const notReplacedText = (project, loss) => `project '${project}' not replaced: ${loss.join('; ')}`;
/** The console's line of an existing project opened (if_exists 'open'). */
export const openedText = r => `Project '${r.project}' already exists: opened as it is${r.sameRepository
  ? `; it is a clone of ${r.repository}, which Pull brings up to date`
  : `; it is not a clone of ${r.repository}`}.`;
/** The console's line of a project replaced: where the old one went. */
export const replacedText = r => `Project '${r.replaced.project}' replaced${r.replaced.trashed ? ' (the old one is in the workspace .trash folder)' : ''}${r.replaced.lost?.length ? `: it had ${r.replaced.lost.join('; ')}` : ''}.`;
/** The console's line of both kept: the clone's name beside the existing one's. */
export const keptBothText = r => `Project '${r.renamedFrom}' kept as it is: the repository opened as '${r.project}'.`;

/**
 * Clone `url` as a project; a project of its name already there: what ifExists says.
 * B, the back end: { GitError, checkUrl, nameFromRepo, exists(name), status(name) (git's), remove(name) -> whether it went
 * to a .trash folder, clone({ url, name, replace }) (replace: called once the clone is ready, before it is put in
 * place), sameRepository(statusRemote, remote) }.
 * -> the clone's result ({ project, url, repository, warnings }, with replaced / renamedFrom), or { project, opened,
 * sameRepository, … } for 'open'; 'error' (and a refused replace) throws a 409 whose `existing` says what the dialog asks.
 */
export async function cloneOrChoose(B, { url, name = null, ifExists = 'error', discardChanges = false }) {
  if (!IF_EXISTS.includes(ifExists)) throw new B.GitError(`if_exists: one of ${IF_EXISTS.join(', ')}, not '${ifExists}'`, null, 400);
  const remote = B.checkUrl(url);
  const project = name || B.nameFromRepo(remote.repo);
  if (!await B.exists(project)) return B.clone({ url, name: project });
  let s;
  try { s = await B.status(project); } catch (e) { s = { failed: e.message }; }
  const repository = `${remote.owner}/${remote.repo}`;
  const existing = {
    project, repository, sameRepository: !!s.repository && B.sameRepository(s.remote, remote),
    loss: s.failed ? [`its changes could not be read: ${s.failed}`] : lossOf(s),
    suggested: await freeName(project, B.exists),
  };
  if (ifExists === 'error') throw new B.GitError(`project '${project}' already exists`, 'Choose another name for the project.', 409, { existing });
  if (ifExists === 'open') return { project, opened: true, url: remote.url, repository, sameRepository: existing.sameRepository, warnings: [] };
  if (ifExists === 'rename') return { ...await B.clone({ url, name: existing.suggested }), renamedFrom: project };
  if (existing.loss.length && !discardChanges) throw new B.GitError(notReplacedText(project, existing.loss), REPLACE_HINT, 409, { existing });
  let trashed = false;
  const r = await B.clone({ url, name: project, replace: async () => { trashed = !!await B.remove(project); } });
  return { ...r, replaced: { project, trashed, lost: existing.loss } };
}

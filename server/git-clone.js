// Open from GitHub Repository… in the server editions and the MCP's git_clone (#4618): a clone onto a project of the same
// name opens it, replaces it or keeps both, as ifExists says (core/git-clone-exists.js), through the back end in use
// (the system's git, or GitHub's API: SILINX_GIT=github); a project replaced goes to the workspace's .trash folder.
import fs from 'node:fs';
import * as Git from './git.js';
import * as GH from './git-github.js';
import * as P from './projects.js';
import { cloneOrChoose } from '../core/git-clone-exists.js';

// the names a remote's repository goes by: GitHub's, and the tests' local repository it is cloned from (GIT_TESTING)
function names(remote) {
  const out = [`${remote.owner}/${remote.repo}`];
  const local = Git.GIT_TESTING.remoteOf?.(remote);
  if (local) { const r = Git.checkUrl(local); out.push(`${r.owner}/${r.repo}`); }
  return out.map(n => n.toLowerCase());
}

/** Clone a GitHub repository as a project: { url, name, ifExists ('error' | 'open' | 'replace' | 'rename'),
 *  discardChanges, madeBy } -> the result of cloneOrChoose. */
export function gitCloneChoosing({ url, name = null, ifExists = 'error', discardChanges = false, madeBy = null }) {
  const B = GH.githubBackend() ? GH : Git;
  return cloneOrChoose({
    GitError: Git.GitError, checkUrl: Git.checkUrl, nameFromRepo: Git.nameFromRepo,
    exists: async n => fs.existsSync(P.projectDir(n)),
    status: n => B.gitStatus(n),
    remove: async n => { await P.deleteProject(n); return true; },
    clone: ({ url: u, name: n, replace }) => B.gitClone({ url: u, name: n, madeBy, replace }),
    sameRepository: (have, remote) => !!have && names(remote).includes(String(have).toLowerCase()),
  }, { url, name, ifExists, discardChanges });
}

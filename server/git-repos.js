// The user's GitHub repositories in the server editions (#4653): Open from GitHub Repository…'s list and the MCP's
// git_repositories (core/github-repos.js). With a token in the environment (GH_TOKEN, GITHUB_TOKEN): GitHub's API with
// it; without one (the system's git, signed in with its own credentials): GitHub's command line, `gh api`, with gh's own
// sign-in, so that no token passes through Silinx. No gh, or gh not signed in: an error saying how to have the list (the
// address is then typed).
import { execFile } from 'node:child_process';
import * as GH from './git-github.js';
import { listRepositories } from '../core/github-repos.js';

// the tests' gh (a command and its first arguments: node and a stand-in script, or none): never the developer's own,
// signed in to their account
export const REPOS_TESTING = { gh: null };

const GH_HINT = 'Install GitHub\'s command line (cli.github.com) and sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.';

// a page through gh (its own sign-in; never a prompt)
function ghApi(p) {
  return new Promise((resolve, reject) => {
    const [cmd, ...pre] = [].concat(REPOS_TESTING.gh || 'gh');
    execFile(cmd, [...pre, 'api', p.replace(/^\//, '')], { timeout: 30_000, maxBuffer: 16 << 20, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (err, stdout, stderr) => {
      if (err?.code === 'ENOENT') return reject(new GH.GitError('your repositories are not listed: GitHub\'s command line (gh) is not installed', GH_HINT, 503));
      if (err) {
        const said = String(stderr || '').trim().split(/\r?\n/)[0].slice(0, 200);
        return reject(/auth login|not logged|authenticat/i.test(said)
          ? new GH.GitError('your repositories are not listed: GitHub\'s command line (gh) is not signed in', 'Sign in with gh auth login, or set GH_TOKEN before starting Silinx; or type the repository\'s address.', 401)
          : new GH.GitError(`your repositories are not listed: gh api failed${said ? ` (${said})` : ''}`, null, 502));
      }
      try { resolve(JSON.parse(stdout)); } catch { reject(new GH.GitError('your repositories are not listed: gh api gave no JSON', null, 502)); }
    });
  });
}

/** The user's repositories -> { source: 'api' | 'gh', repositories: [{ repository, url, private, description, pushedAt }] }. */
export async function gitRepositories() {
  if (GH.hasToken()) {
    const c = GH.apiClient();
    return { source: 'api', repositories: await listRepositories(p => c.request('GET', p)) };
  }
  return { source: 'gh', repositories: await listRepositories(ghApi) };
}

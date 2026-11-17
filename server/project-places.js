// Silinx - where each project of the workspace is kept (#4314), as File ▸ Open Project… shows it and the MCP's
// list_projects says it: the workspace folder ('folder'), and the GitHub repository it is in, if any ('owner/repo': its
// origin's, with the system's git; its record's, with GitHub's API, SILINX_GIT=github; none with git off).
import * as Git from './git.js';
import { githubBackend, gitRemote as githubRemote } from './git-github.js';

/** The projects (listProjects') with their place: { …, stored: 'folder', github: 'owner/repo' | null }. */
export async function withPlaces(projects) {
  const remote = !Git.gitEnabled() ? null : githubBackend() ? githubRemote : Git.gitRemote;
  return Promise.all(projects.map(async p => ({ ...p, stored: 'folder', github: remote ? await remote(p.name).catch(() => null) : null })));
}

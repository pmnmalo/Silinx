// Rename Project… on a server (#4641): the interface's route (server.js) and the MCP's rename_project (mcp-sources.js)
// through the same function, checks and messages (core/project-rename.js): refused while a process of the project runs
// (this process's jobs: an implementation, a programming), or while it is shared live (shared(name): the MCP's
// shares; a page refuses its own); then server/projects.js renameProject, and GitHub's record (SILINX_GIT=github) moved.
import * as P from './projects.js';
import { listJobs } from './jobs.js';
import { moveGithubMeta } from './git-github.js';
import { runningProblem, sharedProblem, renamedMessage } from '../core/project-rename.js';

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Renames the project `from` `to` -> { name, message }; an HttpError (its status, its message) when it is not. */
export async function renameProjectChecked(from, to, { shared = () => false } = {}) {
  P.projectDir(from);   // (a name that is no project's: its message first)
  if (listJobs().some(j => j.status === 'running' && same(j.meta?.project, from))) throw new P.HttpError(409, runningProblem(from));
  if (shared(from)) throw new P.HttpError(409, sharedProblem(from));
  const out = await P.renameProject(from, to);
  await moveGithubMeta(from, to).catch(() => {});   // (a record not moved: the project is no clone of it then)
  return { ...out, message: renamedMessage(from, to) };
}

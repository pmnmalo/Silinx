// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Delete of projects on a server (#5785): the interface's route (server.js, Open Project's Delete) and the MCP's
// delete_project through the same function, checks and messages (core/project-delete.js): refused while a process of
// the project runs (this process's jobs) or while it is shared live (shared(name): the MCP's shares); then
// server/projects.js deleteProject, its folder moved to the workspace's .trash.
import * as P from './projects.js';
import { listJobs } from './jobs.js';
import { runningProblem, sharedProblem, deletedMessage } from '../core/project-delete.js';

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Why the project `name` is not deleted now (an HttpError), or nothing. */
export function checkDelete(name, { shared = () => false } = {}) {
  P.projectDir(name);   // (a name that is no project's: its message first)
  if (listJobs().some(j => j.status === 'running' && same(j.meta?.project, name))) throw new P.HttpError(409, runningProblem(name));
  if (shared(name)) throw new P.HttpError(409, sharedProblem(name));
}

/** Deletes the project `name` -> { name, message }; an HttpError (its status, its message) when it is not. */
export async function deleteProjectChecked(name, opts = {}) {
  checkDelete(name, opts);
  await P.deleteProject(name);
  return { name, message: deletedMessage(name) };
}

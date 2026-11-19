// Rename Project… (#4641): the checks and the messages of a project's rename, one for the interface's dialog, the
// browser's stores (web/js/project-store.js), the local server (server/projects.js renameProject) and the MCP server
// (rename_project). Isomorphic module (browser + Node).

import { projectNameError } from './project-name.js';

/** Why `from` cannot be renamed `to` among the projects `names` (the workspace's), or null: `to` no project's name
 *  (New Project's rule), the same name, or another project's in any case (one folder on a case-insensitive file
 *  system). A change of case alone (blinky to Blinky) is a rename. -> { status, message } */
export function renameProblem(from, to, names) {
  const bad = projectNameError(to);
  if (bad) return { status: 400, message: bad };
  if (to === from) return { status: 400, message: `'${to}' is the project's name already` };
  const low = to.toLowerCase(), clash = names.map(n => String(n?.name ?? n)).find(n => n.toLowerCase() === low && n !== from);
  if (clash) return { status: 409, message: `a project named '${clash}' already exists: choose another name` };
  return null;
}

/** The console's line of a rename done. */
export const renamedMessage = (from, to) => `Project '${from}' renamed to '${to}'.`;
/** Why a project is not renamed now: a process of it running, it shared live or followed. */
export const runningProblem = name => `'${name}' is not renamed while a process of it runs: stop it (or wait for it to finish) first`;
export const sharedProblem = name => `'${name}' is not renamed while it is shared live: stop sharing it first`;
export const followedProblem = name => `'${name}' is another person's project, followed live: it is not renamed`;

/** A file kept in the project's folder by its name (an ISE project, <name>.xise, Synchronize with ISE), as it is named
 *  after the rename; null for one that is not. */
export const renamedFile = (path, from, to) => (String(path).toLowerCase() === `${from}.xise`.toLowerCase() ? `${to}.xise` : null);

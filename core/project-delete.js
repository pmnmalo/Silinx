// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Delete of projects (#5785): the question and the messages of a project's deletion, one for Open Project's Delete
// (web/js/open-project-delete.js), the local server (server/project-delete.js) and the MCP server (delete_project).
// `trash`: where the project goes is a workspace's .trash folder (the local server's, a workspace folder on the disk),
// else it is gone (the browser's storage). Isomorphic module (browser + Node).

/** The console's line of a project deleted. */
export const deletedMessage = (name, { trash = true } = {}) => `Project '${name}' deleted${trash ? ' (moved to the workspace\'s .trash folder)' : ''}.`;

/** Why a project is not deleted now: a process of it running, it shared live or followed. */
export const runningProblem = name => `'${name}' is not deleted while a process of it runs: stop it (or wait for it to finish) first`;
export const sharedProblem = name => `'${name}' is not deleted while it is shared live: stop sharing it first`;
export const followedProblem = name => `'${name}' is another person's project, followed live: it is not deleted`;

/** The console's line of the open project closed before it is deleted. */
export const closedMessage = name => `Project '${name}' closed, to be deleted.`;

/** The question of Delete: the project named, or the projects listed (`names`), the open one (`open`) said closed
 *  first, and that it cannot be undone. */
export function deleteQuestion(names, { trash = true, open = null } = {}) {
  const one = names.length === 1;
  const head = one ? `Delete the project '${names[0]}'?` : `Delete these ${names.length} projects?\n${names.map(n => `'${n}'`).join('\n')}`;
  const where = trash ? `${one ? 'Its folder is' : 'Their folders are'} moved to the workspace's .trash folder.` : `${one ? 'It is' : 'They are'} deleted from this browser's storage.`;
  const closing = open && names.includes(open) ? `\n'${open}' is open: it is closed first.` : '';
  return `${head}\n\n${where}${closing}\nThis cannot be undone.`;
}

/** The names asked to be deleted, each once (in any case, as the projects' folders: one on a case-insensitive disk),
 *  in their order; an error for none. */
export function deleteList(names) {
  const out = [];
  for (const n of names || []) if (!out.some(x => x.toLowerCase() === String(n).toLowerCase())) out.push(String(n));
  if (!out.length) throw new Error('no project to delete');
  return out;
}

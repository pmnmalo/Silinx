// The workspace's .trash (#4758): what Delete Project and Delete File move there, <project>-<time>[-n], is kept
// TRASH_DAYS days, then emptied (the server's, server/projects.js; the browser edition's folder store,
// web/js/project-store.js), its age read from the time in its name, as both name it. A deleted project's build/ is not
// kept (its outputs, made again by a run). Isomorphic module (browser + Node), no imports.

/** How long what was deleted stays in the .trash. */
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** The time (ms) in the name of an entry of the .trash, <project>-<time> or <project>-<time>-<n>; null for another. */
export function trashTime(name) {
  const m = /-(\d{12,})(?:-\d+)?$/.exec(String(name));
  return m ? Number(m[1]) : null;
}

/** Whether an entry of the .trash is older than `days` (TRASH_DAYS) at `now`: to be emptied. A name with no time is
 *  never emptied (not one of Silinx's). */
export function expiredTrash(name, now = Date.now(), days = TRASH_DAYS) {
  const t = trashTime(name);
  return t !== null && now - t > days * DAY;
}

// Silinx server - a new project's folder made whole or not at all (#4772: the clone's two copies, server/git.js gitClone
// and server/git-github.js's REST clone): written in a temporary folder of the workspace, then moved into place by one
// rename; the temporary folder removed whatever happens, so a failed clone leaves nothing behind.
//
//   intoNewProjectDir(dir, fill, place) -> fill's result
//     fill(tmp):  writes the project into tmp (which does not exist yet: `git clone` makes it), may throw
//     place():    run just before the move (the last checks; a project of the name removed), may throw
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { workspaceDir } from './projects.js';

/** The project folder `dir` filled by fill(tmp) in a folder of its own, then moved into place after place(). */
export async function intoNewProjectDir(dir, fill, place = async () => {}) {
  const ws = workspaceDir();
  await fsp.mkdir(ws, { recursive: true });
  const tmp = path.join(ws, `.silinx-clone-${crypto.randomBytes(6).toString('hex')}`);
  try {
    const result = await fill(tmp);
    await place();
    await fsp.rename(tmp, dir);
    return result;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

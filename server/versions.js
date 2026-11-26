// A server's projects' versions (#5740, core/versions.js): kept in the project's hidden folder, .silinx/versions/
// (index.json, and texts/<sha-256>: each text once), which the file routes, the file tree, the export and the shares never
// see, as the snapshots' (#4182); it goes with the project when it is renamed, and with it to the .trash. Used by the
// version routes and the MCP's version tools, with the same messages; the automatic versions: a save once a project is
// quiet (every write of the server's: the page's, the MCP's, git's), and one before each risky command (versionBefore).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { versionStore, restoreVersion, autoVersions, isHash } from '../core/versions.js';
import { mergeStorage } from './merge-projects.js';
import { onProjectChange } from './projects.js';

const dirOf = (P, name) => path.join(P.projectDir(name), '.silinx', 'versions');

/** core/versions.js's backend on a server's projects (P: server/projects.js). */
export function folderBackend(P) {
  const text = (name, h) => { if (!isHash(h)) throw new Error('not a text\'s hash'); return path.join(dirOf(P, name), 'texts', h); };
  return {
    async readIndex(name) { try { return JSON.parse(await fsp.readFile(path.join(dirOf(P, name), 'index.json'), 'utf8')); } catch { return null; } },
    async writeIndex(name, ix) {
      await fsp.mkdir(dirOf(P, name), { recursive: true });
      await P.writeAtomic(path.join(dirOf(P, name), 'index.json'), `${JSON.stringify(ix)}\n`);   // (whole or not at all)
    },
    async getText(name, h) { try { return await fsp.readFile(text(name, h), 'utf8'); } catch { return null; } },
    async putText(name, h, t) {
      const f = text(name, h);
      if (await fsp.stat(f).then(() => true, () => false)) return;
      await fsp.mkdir(path.dirname(f), { recursive: true });
      await P.writeAtomic(f, t);
    },
    dropText: (name, h) => fsp.rm(text(name, h), { force: true }),
    forget: name => fsp.rm(dirOf(P, name), { recursive: true, force: true }),
  };
}

const stores = new WeakMap();
/** The versions of a server's projects (one store a process, its writes one after the other). */
export function serverVersions(P) {
  if (!stores.has(P)) stores.set(P, versionStore(folderBackend(P)));
  return stores.get(P);
}

/** A version of the project as it is now: { version, saved }. */
export async function saveVersion(P, name, opts = {}) {
  return serverVersions(P).save(name, await mergeStorage(P).read(name), opts);
}

/** A version before a risky command (reason: core/versions.js REASONS' before-…): the project as it is, kept; its error
 *  never stops the command (the version is null, the warning said by the caller). */
export async function versionBefore(P, name, reason, { author = '' } = {}) {
  try { return (await saveVersion(P, name, { reason, author })).version; } catch (e) { return { error: e.message }; }
}

/** A version restored (the whole project, or `path`), as core/versions.js restoreVersion. */
export function restoreServerVersion(P, name, id, opts = {}) {
  return restoreVersion(mergeStorage(P), serverVersions(P), name, id, opts);
}

/** The automatic versions of a process's projects: a save once a project has been quiet `quiet` ms (at most one every
 *  saveGap: core/versions.js). Returns stop(). */
export function startAutoVersions(P, { quiet } = {}) {
  const changed = autoVersions(name => saveVersion(P, name, { reason: 'save' }), { quiet });
  const off = onProjectChange(changed);
  return () => { off(); changed.cancel(); };
}

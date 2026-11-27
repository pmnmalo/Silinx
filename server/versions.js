// A server's projects' versions (#5740, core/versions.js): kept in the project's hidden folder, .silinx/versions/
// (index.json, texts/<sha-256>: each text once, v/<id>.json: each version's own record, #5908), which the file routes,
// the file tree, the export and the shares never see, as the snapshots' (#4182); it goes with the project when it is renamed, and with it to the .trash. Used by the
// version routes and the MCP's version tools, with the same messages; the automatic versions: a save once a project is
// quiet (every write of the server's: the page's, the MCP's, git's), and one before each risky command (versionBefore).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { versionStore, restoreVersion, autoVersions, versionChanges, isHash } from '../core/versions.js';
import { mergeStorage } from './merge-projects.js';
import { onProjectChange } from './projects.js';

const dirOf = (P, name) => path.join(P.projectDir(name), '.silinx', 'versions');

/** core/versions.js's backend on a server's projects (P: server/projects.js). */
export function folderBackend(P) {
  const text = (name, h) => { if (!isHash(h)) throw new Error('not a text\'s hash'); return path.join(dirOf(P, name), 'texts', h); };
  const entryFile = (name, id) => { if (!/^\d{1,9}$/.test(String(id))) throw new Error('not a version\'s number'); return path.join(dirOf(P, name), 'v', `${id}.json`); };
  return {
    // (none: null; not JSON: its text, a damaged index to set aside and rebuild, #5908)
    async readIndex(name) {
      let t;
      try { t = await fsp.readFile(path.join(dirOf(P, name), 'index.json'), 'utf8'); } catch { return null; }
      try { return JSON.parse(t); } catch { return t; }
    },
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
    // each version's own object, v/<id>.json, written before the index: what a damaged index is rebuilt from (#5908)
    async listEntries(name) {
      const dir = path.join(dirOf(P, name), 'v');
      const names = await fsp.readdir(dir).catch(() => []);
      const out = [];
      for (const f of names.filter(n => /^\d{1,9}\.json$/.test(n))) { try { out.push(JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'))); } catch { /* unreadable: left out */ } }
      return out;
    },
    async putEntry(name, entry) {
      await fsp.mkdir(path.join(dirOf(P, name), 'v'), { recursive: true });
      await P.writeAtomic(entryFile(name, entry.id), `${JSON.stringify(entry)}\n`);
    },
    dropEntry: (name, id) => fsp.rm(entryFile(name, id), { force: true }),
    // (a damaged index kept beside, never written over: index.json.damaged-<time>)
    async setAside(name) {
      const to = `index.json.damaged-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { await fsp.rename(path.join(dirOf(P, name), 'index.json'), path.join(dirOf(P, name), to)); } catch { return null; }
      return `.silinx/versions/${to}`;
    },
    forget: name => fsp.rm(dirOf(P, name), { recursive: true, force: true }),
  };
}

const stores = new WeakMap();
/** The versions of a server's projects (one store a process; its changes one after the other under the project's lock,
 *  across processes too: the web server's, the MCP server's, the CLI's, #5908). */
export function serverVersions(P) {
  if (!stores.has(P)) stores.set(P, versionStore(folderBackend(P), { lock: P.lockProject }));
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

/** What differs between a version and the project now (#5741, core/versions.js versionChanges): { version (its row),
 *  files: [{ path, state }], json }. */
export async function diffServerVersion(P, name, id) {
  const target = await serverVersions(P).read(name, id);
  return { version: target.version, ...versionChanges(target, await mergeStorage(P).read(name)) };
}

/** The automatic versions of a process's projects: a save once a project has been quiet `quiet` ms (at most one every
 *  saveGap: core/versions.js). Returns stop(). */
export function startAutoVersions(P, { quiet } = {}) {
  const changed = autoVersions(name => saveVersion(P, name, { reason: 'save' }), { quiet });
  const off = onProjectChange(changed);
  return () => { off(); changed.cancel(); };
}

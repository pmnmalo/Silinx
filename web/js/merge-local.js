// Merge Contribution… in the browser edition (#4206; the server's: server/merge-projects.js): the storage
// core/merge-apply.js merges on, the browser's store (web/js/project-store.js: the browser's own, or a workspace folder),
// the drawings' HDL made again as the server's (core/drawing-sync.js), as git's pull does here (web/js/git-browser.js);
// what the project was before the last merge kept for Undo Merge in the browser's localStorage, one key per project of
// each storage (the edition's own: the development site's, silinx.dev.). A merge whose backup does not fit there is not
// made: its error says so.
import { markMerged } from '../../core/trust.js';
import { DEV_SITE } from './prefs.js';

const PREFIX = DEV_SITE ? 'silinx.dev.merge:' : 'silinx.merge:';

/** The storage of a merge: store() the store in use, ops its project operations, snapshots(name) the project's
 *  snapshots (web/js/snapshots-local.js), storage() the localStorage. */
export function localMergeStorage({ store, ops, snapshots, storage = () => globalThis.localStorage }) {
  const key = name => `${PREFIX}${store().kind}:${store().label || ''}:${name}`;
  return {
    async read(name) {
      const p = await store().load(name, { fresh: true });
      return { json: p.json, files: Object.fromEntries(Object.entries(p.files).filter(([k]) => !/\.xise$/i.test(k) && !/^build\//.test(k))) };
    },
    write: (name, path, text) => ops.writeFile(name, path, text),
    remove: (name, path) => ops.deleteFile(name, path),
    saveJson: (name, json) => ops.saveProject(name, json),
    async regenerate(name, path) {
      const { syncDrawing } = await import('../../core/drawing-sync.js');
      const P = {
        readProject: n => ops.project(n), fileTree: async n => (await ops.project(n)).fileTree, updateProject: async (n, fn) => ops.saveProject(n, (await fn(await ops.project(n))) ?? await ops.project(n)),
        readFile: ops.readFile, writeFile: ops.writeFile, deleteFile: ops.deleteFile, readSources: ops.sources,
      };
      return syncDrawing(P, name, path);
    },
    kept: (name, rev) => snapshots(name).read(rev),
    async markMerged(name) { const p = await store().load(name); await store().saveJson(name, markMerged(p.json)); },
    backup: {
      async get(name) { try { return JSON.parse(storage()?.getItem(key(name)) || 'null'); } catch { return null; } },
      async set(name, data) {
        try { if (data === null) storage()?.removeItem(key(name)); else storage()?.setItem(key(name), JSON.stringify(data)); } catch {
          throw Object.assign(new Error('the browser\'s storage has no room to keep the project as it was (Undo Merge): nothing was merged'), { status: 507 });
        }
      },
    },
  };
}

// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The page's project store for core's modules (#4731, #4750): the MCP server's operations (core/rename-module.js,
// core/drawing-sync.js) run on the page through the server's API, with the same checks and messages. And one queue for
// what rewrites drawings or their HDL files (a drawing's HDL made again as its editor saves it, Rename, Convert to
// Schematic): each runs after the ones before it, never in the middle of another (#4750: was a flag, S.syncing, set and
// cleared across awaits, that skipped a drawing's sync while it was set).
import { api } from './api.js';

/** The project store of core's modules (readProject, fileTree, readSources, readFile, writeFile, deleteFile, renameFile,
 *  updateProject, saveVersion) over the page's API. */
export const pageStore = () => ({
  readProject: n => api.project(n), fileTree: async n => (await api.project(n)).fileTree, readSources: n => api.sources(n),
  readFile: (n, p) => api.readFile(n, p), writeFile: (n, p, t) => api.writeFile(n, p, t), deleteFile: (n, p) => api.deleteFile(n, p),
  renameFile: (n, a, b) => api.renameFile(n, a, b),
  saveVersion: (n, o) => api.saveVersion(n, o),   // (an HDL file changed outside Silinx kept before it is made again, #5872)
  updateProject: async (n, fn) => { const pj = await api.project(n); delete pj.fileTree; return api.saveProject(n, fn(pj) || pj); },
});

let queue = Promise.resolve();
/** `fn` run once what was queued before it has run (failed or not): its result. Never called from inside another `fn`
 *  (it would wait for itself). */
export function serialDrawings(fn) {
  const run = queue.then(() => fn());
  queue = run.catch(() => {});
  return run;
}

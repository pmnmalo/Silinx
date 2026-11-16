// Merge Contribution… on the server's projects (#4206, core/merge-apply.js): the storage the merge works on (the
// project's files and description, its snapshots: server/project-snapshots.js, the drawings' HDL made again:
// core/drawing-sync.js), what the project was before the last merge kept for Undo Merge in its hidden folder
// (.silinx/merges/last.json: never a project file, never served, exported or shared), and a contribution read from the
// entries the import gate let through. Used by the merge routes and the MCP's merge tools, with the same messages.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_FILE } from '../core/fold-name.js';
import { markMerged } from '../core/trust.js';
import { readSnapshot } from './project-snapshots.js';
import { syncDrawing } from './drawing-sync.js';

const backupFile = (P, name) => path.join(P.projectDir(name), '.silinx', 'merges', 'last.json');

/** The storage core/merge-apply.js merges on: a server's projects (P: server/projects.js). */
export function mergeStorage(P) {
  return {
    async read(name) {
      const json = JSON.parse(await fsp.readFile(path.join(P.projectDir(name), PROJECT_FILE), 'utf8'));
      const files = {};
      for (const rel of await P.fileTree(name)) if (!/\.xise$/i.test(rel)) files[rel] = await fsp.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8');
      return { json, files };
    },
    write: (name, rel, text) => P.writeFile(name, rel, text),
    remove: (name, rel) => P.deleteFile(name, rel),
    saveJson: (name, json) => P.writeProject(name, json),
    regenerate: (name, drawing) => syncDrawing(P, name, drawing),
    kept: (name, rev) => readSnapshot(P, name, rev),
    markMerged: name => P.updateProject(name, markMerged),
    backup: {
      async get(name) { try { return JSON.parse(await fsp.readFile(backupFile(P, name), 'utf8')); } catch { return null; } },
      async set(name, data) {
        const f = backupFile(P, name);
        if (data === null) { await fsp.rm(f, { force: true }); return; }
        await fsp.mkdir(path.dirname(f), { recursive: true });
        await fsp.writeFile(f, JSON.stringify(data));
      },
    },
  };
}

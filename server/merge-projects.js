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
import { parseDescription } from '../core/project-json.js';
import { lockProject } from './projects.js';

// a file's bytes as text: UTF-8 with no NUL, else null (a binary file)
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });   // (a byte order mark kept: written back as it was)
function textOf(buf) {
  if (buf.includes(0)) return null;
  try { return utf8.decode(buf); } catch { return null; }
}

const backupFile = (P, name) => path.join(P.projectDir(name), '.silinx', 'merges', 'last.json');

/** The storage core/merge-apply.js merges on: a server's projects (P: server/projects.js). */
export function mergeStorage(P) {
  return {
    async read(name) {
      const json = parseDescription(await fsp.readFile(path.join(P.projectDir(name), PROJECT_FILE), 'utf8'));
      const files = {};
      // (a binary file, not UTF-8 text, left out, as a contribution's are: never merged, nor written back by Undo Merge
      // decoded as text, #4757)
      for (const rel of await P.fileTree(name)) {
        if (/\.xise$/i.test(rel)) continue;
        const text = textOf(await fsp.readFile(P.safeJoin(P.projectDir(name), rel)));
        if (text !== null) files[rel] = text;
      }
      return { json, files };
    },
    // (a merge's or an undo's writes all under the project's lock: no other write in between, #4757)
    locked: (name, fn) => lockProject(name, fn),
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
        await P.writeAtomic(f, JSON.stringify(data));   // (whole or not at all: the pre-merge backup, #4758)
      },
    },
  };
}

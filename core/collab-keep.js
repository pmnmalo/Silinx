// A copy of a project followed, kept once following ends (#4198): Stop Following, the owner's sharing stopped, the
// connection lost for good. The project the follower's page still shows is saved nowhere (its files are the room's,
// core/collab-doc.js): the follower keeps a copy of their own, an import into their workspace under a free name (the
// page's api.importZip, the MCP's importProjectEntries: through the import gate, marked untrusted as any project from
// someone else, core/trust.js), or leaves it, read only. What the copy holds: the project's description and every file
// the room has, its text files as their shared text and its drawings edited live as their participants merged them
// (an editor's changes not delivered yet included). Isomorphic (the page and the MCP server).
import { docFile, docProject } from './collab-doc.js';
import { liveDrawing, drawingModel, drawingText } from './collab-model.js';
import { freeName } from './design-link.js';
import { markUntrusted } from './trust.js';

/** The project a room's document holds, as a copy's entries: { name, owner, entries: [{ path, data (its text) }] }
 *  (silinx.json first, marked untrusted); throws when the project has not arrived. */
export function followedCopy(doc) {
  const { project, owner, fileTree } = docProject(doc);
  if (!project || typeof project.name !== 'string' || !project.name) throw new Error('the shared project has not arrived');
  const { fileTree: _tree, ...pj } = project;   // eslint-disable-line no-unused-vars
  const entries = [{ path: 'silinx.json', data: JSON.stringify(markUntrusted(pj), null, 2) }];
  for (const path of fileTree) {
    if (path === 'silinx.json') continue;
    const live = liveDrawing(path) ? drawingModel(doc, path) : null;
    const text = live ? drawingText(path, live.model) : docFile(doc, path);
    if (typeof text === 'string') entries.push({ path, data: text });
  }
  return { name: project.name, owner, entries };
}

/** The copy's name in a workspace whose projects are `taken`: the project's own when it is free (its case ignored),
 *  else the first free suffix (ALU_2, ALU_3, …). */
export const copyName = (name, taken) => (taken.some(n => n.toLowerCase() === name.toLowerCase()) ? freeName(name, taken) : name);

/** Whether a follower's page holds work saved nowhere: it changed the project (`edited`), no copy was kept, and its
 *  changes reach nobody now (following ended, or the connection lost meanwhile). */
export const unsavedFollow = ({ edited = false, kept = false, closed = false, connected = true } = {}) => edited && !kept && (closed || !connected);

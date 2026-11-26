// A shared project's versions through the MCP (#5742, core/collab-versions.js, as the owner's and the followers' pages):
// share_project, the owner, publishes its versions in the document (at once, after each change of the disk, every
// PUBLISH_MS) and does its editors' requests (a version saved, one restored, with the editor's name as its author:
// server/versions.js, its restore's writes published to everyone as the project's change on disk); follow_project's
// `version` lists the owner's versions, and with an editor's link asks for one saved or restored.
import * as P from './projects.js';
import { serverVersions, saveVersion, restoreServerVersion } from './versions.js';
import { publishVersions, watchRequests, handleRequest, putDone, watchDone, docVersions, putRequest } from '../core/collab-versions.js';
import { versionLine } from '../core/versions.js';

const PUBLISH_MS = 30e3, ASK_MS = 120e3;

/** The owner's side of a share (name: the project, doc: its document; said(line): an answer's line, the share's
 *  warnings): published(), called after a change of the disk; off(). */
export function ownerVersions(name, doc, said) {
  let chain = Promise.resolve(), stopped = false;
  const publish = () => { chain = chain.then(async () => { if (!stopped) publishVersions(doc, await serverVersions(P).list(name)); }).catch(() => {}); return chain; };
  const ops = {
    save: (label, author) => saveVersion(P, name, { reason: 'manual', label, author }),
    restore: (id, path, author) => restoreServerVersion(P, name, id, { path, author }),
  };
  const offReq = watchRequests(doc, r => {
    chain = chain.then(async () => { if (!stopped) putDone(doc, await handleRequest(r, ops)); }).catch(() => {});
    publish();
  }, { fix: () => publish() });
  const offDone = watchDone(doc, d => said(d.line), { owner: () => doc.clientID });
  const timer = setInterval(publish, PUBLISH_MS);
  timer.unref?.();
  publish();
  return { published: publish, off: () => { stopped = true; offReq(); offDone(); clearInterval(timer); } };
}

/** follow_project's `version` on a followed room (session: its own; editor: an editor's link; by: its name):
 *  { text, data }. action list (the owner's versions), save (a name) or restore (a version, a file or none). */
export async function followVersion(session, { action = 'list', id = null, path = null, name: label = '' } = {}, { by, editor }) {
  const owner = () => session.owner()?.client ?? null;
  if (action === 'list') {
    const list = docVersions(session.doc, { owner: owner() });
    return { text: list.length ? [`${list.length} version(s) of the owner's, newest first:`, ...list.map(v => `  ${versionLine(v)}`)].join('\n') : 'The owner has no versions yet (or they have not arrived).', data: { versions: list } };
  }
  if (!editor) throw new Error('save and restore with an editor\'s link only (this one follows read only)');
  if (action === 'restore' && !id) throw new Error('restore names the version (id)');
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const done = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('the owner\'s Silinx did not answer')); }, ASK_MS);
    const off = watchDone(session.doc, d => { if (d.nonce === nonce) { clearTimeout(timer); off(); resolve(d); } }, { owner });
    try { putRequest(session.doc, action === 'save' ? { nonce, kind: 'save', by, label } : { nonce, kind: 'restore', by, id: String(id), path }); } catch (e) { clearTimeout(timer); off(); reject(e); }
  });
  if (!done.ok) throw new Error(done.line);
  return { text: done.line, data: { done } };
}

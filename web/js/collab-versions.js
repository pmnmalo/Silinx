// A shared project's versions at its owner's page (#5742, core/collab-versions.js): its versions published in the
// project's document (at once, after each change of the disk, every PUBLISH_MS: the versions kept on their own too),
// and the editors' requests done here, the owner's store and project (a version saved, one restored, with the editor's
// name as its author; the restore's writes reach everyone as the owner's own, web/js/collab-share.js), their answer and
// its line in every participant's console (this one's too: watchDone, web/js/collab-follow.js the followers').
//   shareVersions(s) -> stop()      s: the share (its doc, its project)
import { api } from './api.js';
import { S } from './app.js';
import { collabLog } from './collab-log.js';
import { reloadProject } from './project.js';
import { saveAll } from './processes.js';
import { applyChanges } from './project-watch.js';
import { publishVersions, watchRequests, handleRequest, putDone, watchDone } from '/core/collab-versions.js';

const PUBLISH_MS = 30e3;

/** The share's versions kept in its document, its editors' requests done: stop(). */
export function shareVersions(s) {
  let chain = Promise.resolve(), stopped = false;
  const publish = () => { chain = chain.then(async () => { if (!stopped) publishVersions(s.doc, (await api.listVersions(s.project)).versions); }).catch(() => { /* the next one */ }); return chain; };
  // (a restore asked by an editor: as this page's own Restore, the page's documents saved first and read again after)
  const restore = async (id, path, author) => {
    await saveAll();
    const r = await api.restoreVersion(s.project, id, { path, author });
    if (r.version && S.project?.name === s.project) {
      if (api.standalone) await applyChanges({ project: s.project, changes: [...r.written.map(f => ({ path: f, kind: 'changed' })), ...r.removed.map(f => ({ path: f, kind: 'deleted' }))] });
      await reloadProject();
    }
    return r;
  };
  const save = (label, author) => api.saveVersion(s.project, { label, author, reason: 'manual' });
  const offReq = watchRequests(s.doc, r => {
    chain = chain.then(async () => { if (!stopped) putDone(s.doc, await handleRequest(r, { save, restore })); }).catch(() => {});
    publish();
  }, {
    // (the owner's parts written by another participant: its own again)
    fix: () => publish(),
  });
  const offDone = watchDone(s.doc, d => collabLog(d.line, d.ok ? 'info' : 'warn'), { owner: () => s.doc.clientID });
  const onDisk = ev => { if (ev.detail?.project === s.project) publish(); };
  addEventListener('silinx:disk-changes', onDisk);
  addEventListener('silinx:versions', onDisk);   // (a version saved or restored by this page: web/js/versions.js)
  const timer = setInterval(publish, PUBLISH_MS);
  publish();
  return () => { stopped = true; offReq(); offDone(); removeEventListener('silinx:disk-changes', onDisk); removeEventListener('silinx:versions', onDisk); clearInterval(timer); };
}

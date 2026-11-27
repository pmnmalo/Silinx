// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The drawings' HDL files checked against their drawings (#5872, core/drawing-sync.js checkDrawings, the MCP's): as the
// project is opened, when its folder changes outside Silinx (web/js/project-watch.js), before a run (Check Syntax, which
// every run starts with) and an export. A drawing replaced on disk has its HDL made again; an HDL file edited by hand is
// kept in a version of the project and made again from its drawing, a warning said; a drawing with errors leaves its
// file, stale, and Check Syntax stops on it (#5799). In the drawings' queue (page-store.js), through the page's API: the
// local server's and the browser edition's alike. Not for a project followed (#3181: its files are its owner's).
import { api } from './api.js';
import { S } from './app.js';
import { appLog as log } from './console.js';   // (the application's lines, translated, #4729)
import { pageStore, serialDrawings } from './page-store.js';

// (a drawing with errors said once while the project is open, as its folder changes: path -> why)
const said = new Map();

/** Every drawing of the open project checked (only: these drawings): the console told what was made again (warnings
 *  for the HDL files changed outside Silinx), the open editors of those files given their text. live: its folder changed
 *  while it is open, a drawing with errors said too (once). Returns checkDrawings' result (null: no project, or one
 *  followed), the files written. */
export function checkProjectDrawings({ only = null, live = false } = {}) {
  const name = S.project?.name;
  if (!name || api.following) return Promise.resolve(null);
  return serialDrawings(async () => {
    const { checkDrawings } = await import('/core/drawing-sync.js');
    let r;
    try { r = await checkDrawings(pageStore(), name, { only }); } catch (e) { log(`WARNING: the drawings' HDL files not checked: ${e.message}`, 'warn'); return null; }
    // (a drawing with errors: said where its HDL is used, Check Syntax and its editor, #303; changed on disk while the
    // project is open, here too, once: its HDL not made, never used)
    for (const x of r.results) {
      if (x.stale && (!live || said.get(x.path) === x.stale)) continue;
      if (x.stale) said.set(x.path, x.stale);
      for (const m of x.messages) log(m, /^WARNING: /.test(m) ? 'warn' : 'info');
    }
    for (const p of [...said.keys()]) if (!r.results.some(x => x.path === p && x.stale)) said.delete(p);
    if (r.written.length) {
      const { refreshOpenEditor } = await import('./drawings.js');
      for (const f of r.written) { try { refreshOpenEditor(f, await api.readFile(name, f)); } catch { /* gone */ } }
    }
    return r;
  });
}

let quiet = null, quietTimer = null;
/** The check once the project's folder has been quiet `ms` (a git checkout, an editor's save by a temporary file, a
 *  burst of writes: checked once, on their last state), live; the project read again when it wrote something. Returns
 *  the check's promise (the same one for the changes that came before it). */
export function checkWhenQuiet(ms = 600) {
  clearTimeout(quietTimer);
  quiet ||= (() => { let done; const p = new Promise(r => { done = r; }); return { p, done }; })();
  const q = quiet;
  quietTimer = setTimeout(async () => {
    quiet = null;
    let r = null;
    try {
      r = await checkProjectDrawings({ live: true });
      if (r?.written.length) await (await import('./project.js')).reloadProject();
    } finally { q.done(r); }
  }, ms);
  return q.p;
}

// A project's versions' routes (#5740: core/versions.js on server/versions.js, as the MCP's version tools):
//   GET  /projects/:p/versions                   -> { versions } (newest first: their rows, no texts)
//   POST /projects/:p/versions                   (JSON: { label, author, reason }) -> { version, saved }
//   GET  /projects/:p/versions/:id               -> { version, json, files } (a version's project)
//   GET  /projects/:p/versions/:id/diff          -> { version, files: [{ path, state }], json } (what differs from now, #5741)
//   POST /projects/:p/versions/:id/restore       (JSON: { path, author }) -> { written, removed, json, version, before }
// A restore's writes are told to the page as another process's (server/server.js TOLD): its open documents read again.
import express from 'express';
import { serverVersions, saveVersion, restoreServerVersion, diffServerVersion } from './versions.js';

// (the reasons a page asks for: a version by hand, or before one of its own risky commands; the others are the server's)
const PAGE_REASONS = /^(manual|before-(remove|delete|convert|import|merge|git|mode|regenerate))$/;

export function mountVersionRoutes({ P, api, wrap, bad }) {
  const json = express.json({ limit: '64kb' });
  const str = (v, what) => { if (v != null && typeof v !== 'string') throw bad(`${what}: a string`); return v ?? ''; };
  const rethrow = e => { if (e.status && e.status < 500) throw bad(e.message, e.status); throw e; };
  api.get('/projects/:p/versions', wrap(async req => {
    await P.readProject(req.params.p);
    // (a damaged index's repair said, #5908: the History's console)
    const v = serverVersions(P), warning = await v.warning(req.params.p);
    return { versions: await v.list(req.params.p), ...(warning ? { warning } : {}) };
  }));
  api.post('/projects/:p/versions', json, wrap(async req => {
    await P.readProject(req.params.p);
    const reason = str(req.body?.reason, 'reason') || 'manual';
    if (!PAGE_REASONS.test(reason)) throw bad('reason: manual, or before-remove, before-delete, before-convert, before-import, before-merge, before-git, before-mode, before-regenerate');
    try { return await saveVersion(P, req.params.p, { reason, label: str(req.body?.label, 'label'), author: str(req.body?.author, 'author') }); } catch (e) { return rethrow(e); }
  }));
  api.get('/projects/:p/versions/:id', wrap(async req => {
    await P.readProject(req.params.p);
    try { return await serverVersions(P).read(req.params.p, req.params.id); } catch (e) { return rethrow(e); }
  }));
  api.get('/projects/:p/versions/:id/diff', wrap(async req => {
    await P.readProject(req.params.p);
    try { return await diffServerVersion(P, req.params.p, req.params.id); } catch (e) { return rethrow(e); }
  }));
  api.post('/projects/:p/versions/:id/restore', json, wrap(async req => {
    await P.readProject(req.params.p);
    const p = str(req.body?.path, 'path') || null;
    try { return await restoreServerVersion(P, req.params.p, req.params.id, { path: p, author: str(req.body?.author, 'author') }); } catch (e) { return rethrow(e); }
  }));
}

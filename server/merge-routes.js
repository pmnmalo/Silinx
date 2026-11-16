// Merge Contribution…'s routes (#4206; the merge: core/merge-apply.js on server/merge-projects.js, as the MCP's tools):
//   POST /projects/:p/merge-preview   (the zip)                         -> each file's state, the conflicts, the texts
//   POST /projects/:p/merge?label=    (the zip; X-Silinx-Resolve: the choices, URI-encoded JSON) -> the result, its lines
//   POST /projects/:p/undo-merge                                        -> the last merge undone
// The contribution is a Silinx project's zip (a folder: zipped by the page, as Import Project's), the body as the
// import-zip route's, read through the import gate; its texts and names are someone else's (the page shows them as
// text only).
import express from 'express';
import { GateError, gateZip } from '../core/import-gate.js';
import { ZIP_LIMITS } from '../core/zip.js';
import { contributionOf } from '../core/project-merge.js';
import { applyMerge, previewMerge, undoMerge, mergeLines, previewOf } from '../core/merge-apply.js';
import { mergeStorage } from './merge-projects.js';

export function mountMergeRoutes({ P, api, wrap, bad, NODE_CODEC }) {
  const body = express.raw({ type: () => true, limit: ZIP_LIMITS.maxEntry });
  const contribution = async (req) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('missing contribution (the zip)');
    let gated;
    try { gated = await gateZip(new Uint8Array(req.body), NODE_CODEC); } catch (e) { throw e instanceof GateError ? bad(e.message) : e; }
    try { return contributionOf(gated); } catch (e) { throw bad(e.message); }
  };
  const label = req => String(req.query.label || 'the contribution').slice(0, 200);
  const choices = (req) => {
    let r = {};
    try { r = JSON.parse(decodeURIComponent(req.get('X-Silinx-Resolve') || '{}')); } catch { throw bad('X-Silinx-Resolve: not the choices\' JSON'); }
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  };
  api.post('/projects/:p/merge-preview', body, wrap(async req => {
    await P.readProject(req.params.p);
    return previewOf(await previewMerge(mergeStorage(P), req.params.p, await contribution(req)));
  }));
  api.post('/projects/:p/merge', body, wrap(async req => {
    const name = req.params.p;
    await P.readProject(name);
    let r;
    try { r = await applyMerge(mergeStorage(P), name, await contribution(req), choices(req)); } catch (e) { if (e.status) throw bad(e.message, e.status); throw e; }
    return { written: r.written, removed: r.removed, regenerated: r.regenerated, taken: r.taken, untrusted: r.untrusted, lines: mergeLines(name, label(req), r) };
  }));
  api.post('/projects/:p/undo-merge', wrap(async req => {
    try { return await undoMerge(mergeStorage(P), req.params.p); } catch (e) { if (e.status) throw bad(e.message, e.status); throw e; }
  }));
}

// The circuit editor's Browse KiCad Libraries… on the local server (#4285, server/kicad-libraries.js): the libraries to
// browse, what one holds, and its import into a project's parts/ (core/kicad-import.js), as the MCP's part_libraries and
// import_part with a library do.
import { kicadLibraries, openKicadLibrary, kicadContents, kicadOrigin } from './kicad-libraries.js';
import { importKicadPackage } from '../core/kicad-import.js';

export function mountKicadRoutes({ P, api, wrap, bad }) {
  const failed = (e) => bad(e.message, 502);
  api.get('/kicad/libraries', wrap(async (req) => { try { return await kicadLibraries({ refresh: req.query.refresh === '1' }); } catch (e) { throw failed(e); } }));
  api.get('/kicad/libraries/:id', wrap(async (req) => {
    let o;
    try { o = await openKicadLibrary(req.params.id); } catch (e) { throw failed(e); }
    return { library: o.library, cached: o.cached, contents: await kicadContents(o.pkg), footprints: o.pkg.footprints.length };
  }));
  api.post('/projects/:p/kicad/import', wrap(async (req) => {
    const name = req.params.p, b = req.body || {};
    await P.readProject(name);
    if (typeof b.library !== 'string') throw bad('library: a library\'s identifier');
    if (b.libraries != null && !(Array.isArray(b.libraries) && b.libraries.every((x) => typeof x === 'string'))) throw bad('libraries: a list of names');
    let o;
    try { o = await openKicadLibrary(b.library); } catch (e) { throw failed(e); }
    try {
      return await importKicadPackage(P, name, o.pkg, { libraries: b.libraries ?? null, origin: kicadOrigin(o.library), replace: !!b.replace });
    } catch (e) { throw bad(e.message); }
  }));
}

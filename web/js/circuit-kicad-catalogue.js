// The circuit editor's KiCad catalogue (#4305, core/kicad-catalogue.js): a part of it clicked in the Parts panel is
// imported into the project, its symbol (and those it extends) as one KiCad file each in parts/<library>.kicad_symdir/,
// its footprint beside it, as the MCP's import_part with a part does. Its files are fetched by the local server (checked,
// kept for offline use); in the browser's edition alone, from a host that sends CORS headers only (SparkFun's on GitHub,
// KiCad's through GitLab's API, #4312), the others said to need the local server. A file of the project the import would
// change is replaced once confirmed.
import { confirmDlg } from './ui.js';
import { api } from './api.js';
import { S } from './app.js';
import { log, logError } from './console.js';
import { importCataloguePart, browserUrl } from '/core/kicad-catalogue.js';
import { loadCircuitParts, kicadStore } from './circuit-kicad-import.js';

const lineClass = (l) => (/^ERROR: /.test(l) ? 'err' : /^WARNING: /.test(l) ? 'warn' : 'info');
// (the browser alone: a CORS host's file)
async function browserFile(url) {
  const at = browserUrl(url);
  if (!at) throw new Error(`${new URL(url).hostname}'s files need the local Silinx server (it sends no CORS header): run Silinx's server to import this part`);
  const r = await fetch(at);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

/** A catalogue's part imported into the project: its type, or null (refused, failed, a replace declined). */
export async function importCatalogue(id) {
  if (!S.project) return null;
  const name = S.project.name;
  const run = (replace) => (typeof api.kicadCataloguePart === 'function' ? api.kicadCataloguePart(name, { part: id, replace }) : importCataloguePart(kicadStore(), name, id, browserFile, { replace }));
  let r;
  try { r = await run(false); }
  catch (e) {
    if (!/the project has it already/.test(e.message)) { logError(`KiCad catalogue: ${e.message}`); return null; }
    if (!await confirmDlg('KiCad catalogue', `${e.message.replace(/ \(replace: true replaces it\)$/, '')}. Replace it?`)) return null;
    try { r = await run(true); } catch (e2) { logError(`KiCad catalogue: ${e2.message}`); return null; }
  }
  for (const f of r.written) if (S.fileTree && !S.fileTree.includes(f)) S.fileTree.push(f);
  for (const l of [`${r.type}: imported`, ...r.lines]) log(l, lineClass(l));
  await loadCircuitParts();
  return r.type;
}

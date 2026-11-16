// A KiCad part imported into a project (#4281, #4280): a symbol library (.kicad_sym) or a footprint (.kicad_mod)
// written into its parts/ folder as KiCad wrote it, what KiCad has no field for set in its symbols' properties
// (core/kicad-edit.js: Silinx.Model, Silinx.Family, Silinx.Footprint; Silinx.Source, Silinx.Author, Silinx.Licence),
// then the project's parts read again (core/circuit-kicad.js) and each of its symbols said. The circuit editor's Import
// KiCad Part… and the MCP's import_part, with the same checks and messages. Isomorphic module.
import { readKicadSymLib } from './kicad-sym.js';
import { readKicadFootprint } from './kicad-mod.js';
import { setSymbolProperties } from './kicad-edit.js';
import { PARTS } from './circuit-parts.js';
import { useProjectParts } from './circuit-kicad.js';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(kicad_sym|kicad_mod)$/;
/** The folder of the footprints imported (parts/<this>.pretty). */
const FOOTPRINTS_LIB = 'imported';

/** Whether a file's name is one a KiCad part is imported by (letters, digits, . _ -; .kicad_sym or .kicad_mod). */
export const isKicadImportName = (base) => NAME_RE.test(String(base ?? ''));
/** Where a file of that name goes in the project: parts/<name> (a library), parts/imported.pretty/<name> (a footprint). */
export const kicadImportPath = (base) => (base.endsWith('.kicad_mod') ? `parts/${FOOTPRINTS_LIB}.pretty/${base}` : `parts/${base}`);

/**
 * A library's text with the properties set: `symbols` { name: { model, family, footprint } }, `origin` { source, author,
 * licence } (on each symbol that is not derived: a derived one takes its parent's). Throws on a text it cannot read, a
 * symbol it has not, a model that is no IC of the library, a family neither ttl nor cmos.
 */
export function libraryWithProperties(text, symbols, origin = {}) {
  const lib = readKicadSymLib(text);
  const names = new Set(lib.symbols.map((s) => s.name)), edits = {};
  for (const [name, o] of Object.entries(symbols || {})) {
    if (!names.has(name)) throw new Error(`symbols: no symbol '${name}' in the library (its symbols: ${[...names].join(', ')})`);
    if (o?.model != null && o.model !== '' && PARTS[o.model]?.kind !== 'ic') throw new Error(`symbols.${name}.model: '${o.model}' is not an IC of the library (circuit_parts)`);
    if (o?.family != null && o.family !== '' && o.family !== 'ttl' && o.family !== 'cmos') throw new Error(`symbols.${name}.family: ttl or cmos`);
    edits[name] = Object.fromEntries([['Silinx.Model', o?.model], ['Silinx.Family', o?.family], ['Silinx.Footprint', o?.footprint]].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  }
  const from = Object.fromEntries([['Silinx.Source', origin.source], ['Silinx.Author', origin.author], ['Silinx.Licence', origin.licence]].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  if (Object.keys(from).length) for (const s of lib.symbols.filter((x) => !x.extends)) edits[s.name] = { ...from, ...edits[s.name] };
  return Object.values(edits).some((e) => Object.keys(e).length) ? setSymbolProperties(text, edits) : text;
}

/**
 * A KiCad file imported into the project `name` through `P` (fileTree, writeFile, readFile: the server's projects or the
 * browser's store): `base` its name, `text` its text, `symbols` and `origin` libraryWithProperties's, `replace` a file
 * of parts/ of that name replaced (else refused). { path, edited, lines (each symbol said), parts, skipped, errors };
 * throws (its message the reason) when it is refused.
 */
export async function importKicadPart(P, name, { base, text, symbols, origin, replace = false }) {
  if (!isKicadImportName(base)) throw new Error(`'${base}' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)`);
  const footprint = base.endsWith('.kicad_mod');
  if (footprint && symbols && Object.keys(symbols).length) throw new Error('symbols: a footprint has none');
  let out = text;
  if (footprint) readKicadFootprint(text);
  else out = libraryWithProperties(text, symbols, origin);
  const rel = kicadImportPath(base);
  if (!replace && (await P.fileTree(name)).includes(rel)) throw new Error(`${rel}: the project has it already (replace: true replaces it)`);
  await P.writeFile(name, rel, out);
  const r = await useProjectParts(P, name);
  const mine = (t) => footprint || t.startsWith(`${rel}#`);
  const lines = [`${rel} written${out !== text ? ' (its symbols\' Silinx properties set)' : ''}`,
    ...r.defs.filter((d) => mine(d.type)).map((d) => `${d.type}: ${d.behaves ? `behaves as the ${d.behaves} (by its ${d.how})` : 'drawn only: not simulated'}`),
    ...r.skipped.filter((x) => mine(x.type)).map((x) => `${x.type}: not a part: ${x.reason}`),
    ...r.notes.filter((x) => !footprint && x.startsWith(`${rel}: `)).map((w) => `WARNING: ${w}`),
    ...r.errors.map((e) => `ERROR: ${e}`)];
  const parts = r.defs.filter((d) => mine(d.type)).map((d) => ({ type: d.type, kind: d.kind, behavesAs: d.behaves, value: d.kicad.value }));
  return { path: rel, edited: out !== text, lines, parts, skipped: r.skipped.filter((x) => mine(x.type)), errors: r.errors };
}

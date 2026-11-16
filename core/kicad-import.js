// A KiCad part imported into a project (#4281, #4280): a symbol library (.kicad_sym) or a footprint (.kicad_mod)
// written into its parts/ folder as KiCad wrote it, what KiCad has no field for set in its symbols' properties
// (core/kicad-edit.js: Silinx.Model, Silinx.Family, Silinx.Footprint; Silinx.Source, Silinx.Author, Silinx.Licence),
// then the project's parts read again (core/circuit-kicad.js) and each of its symbols said. The circuit editor's Import
// KiCad Part… and the MCP's import_part, with the same checks and messages. Isomorphic module.
import { readKicadSymLib, readKicadSymbols } from './kicad-sym.js';
import { readKicadFootprint } from './kicad-mod.js';
import { setSymbolProperties } from './kicad-edit.js';
import { PARTS } from './circuit-parts.js';
import { useProjectParts, kicadPartsOf } from './circuit-kicad.js';
import { gateFile } from './import-gate.js';

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
  // (a file of a .kicad_symdir may hold a derived symbol whose parent is in another file: its extends read, not resolved)
  const lib = readKicadSymbols(text);
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
  gateFile(rel, out);   // (the import gate's rules on its name and size, #2830)
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

// the footprint libraries a library's symbols name (Footprint or Silinx.Footprint, 'Lib:Name'; PCM_Lib is Lib)
function footprintsNamed(texts) {
  const out = new Set();
  for (const t of texts) for (const m of t.matchAll(/\(property\s+"(?:Silinx\.)?Footprint"\s+"(?:PCM_)?([^":]+):([^"]+)"/g)) out.add(`${m[1]}:${m[2]}`);
  return out;
}

/**
 * A KiCad package's libraries imported into the project (`pkg`: core/kicad-pcm.js readPcmPackage's; its official
 * libraries: one symbols' file): those of `libraries` (their names: a .kicad_sym, a .kicad_symdir; all of them by
 * default) written in parts/ with the origin's properties (`origin`: { source, author, licence }), and the footprints
 * their symbols name (parts/<library>.pretty/). A file there already refused unless `replace`, before anything is written.
 * { written: [paths], lines (each library said: its parts as ICs, drawn only, and its symbols that are no part), parts }.
 */
export async function importKicadPackage(P, name, pkg, { libraries = null, origin = {}, replace = false, keepSame = false } = {}) {
  const all = [...pkg.symbols.map((s) => s.name), ...pkg.symdirs.map((d) => d.name)];
  const want = libraries ?? all;
  for (const l of want) if (!all.includes(l)) throw new Error(`libraries: no library '${l}' in the package (its libraries: ${all.join(', ') || 'none'})`);
  if (!want.length) throw new Error('libraries: none chosen');
  const files = [];   // [{ path, text }]
  for (const s of pkg.symbols.filter((x) => want.includes(x.name))) files.push({ path: `parts/${s.name}`, text: libraryWithProperties(s.text, {}, origin), lib: `parts/${s.name}` });
  for (const d of pkg.symdirs.filter((x) => want.includes(x.name))) for (const f of d.files) files.push({ path: `parts/${d.name}/${f.name}`, text: libraryWithProperties(f.text, {}, origin), lib: `parts/${d.name}` });
  const named = footprintsNamed(files.map((f) => f.text));
  for (const fp of pkg.footprints.filter((f) => named.has(`${f.library}:${f.name.replace(/\.kicad_mod$/, '')}`))) files.push({ path: `parts/${fp.library}.pretty/${fp.name}`, text: fp.text });
  if (!replace) {
    const tree = new Set(await P.fileTree(name));
    // (keepSame: a file there already with the same text is kept, #4305: a catalogue's parts share their parents)
    for (const f of files.filter((x) => tree.has(x.path))) {
      if (keepSame && await P.readFile(name, f.path).then((t) => t === f.text, () => false)) f.same = true;
      else throw new Error(`${f.path}: the project has it already (replace: true replaces it)`);
    }
  }
  for (const f of files) gateFile(f.path, f.text);   // (the import gate's rules on their names and sizes, #2830: all of them before any is written)
  for (const f of files.filter((x) => !x.same)) await P.writeFile(name, f.path, f.text);
  const r = await useProjectParts(P, name);
  const lines = [];
  for (const lib of [...new Set(files.filter((f) => f.lib).map((f) => f.lib))]) {
    const defs = r.defs.filter((d) => d.type.startsWith(`${lib}#`)), skipped = r.skipped.filter((x) => x.type.startsWith(`${lib}#`));
    lines.push(`${lib} written: ${defs.length} part(s), ${defs.filter((d) => d.behaves).length} of them as ICs of the library (${[...new Set(defs.filter((d) => d.behaves).map((d) => d.behaves))].join(', ') || 'none'}), ${defs.filter((d) => !d.behaves).length} drawn only; ${skipped.length} symbol(s) no part`);
  }
  const fps = files.filter((f) => !f.lib);
  if (fps.length) lines.push(`${fps.length} footprint(s) written: ${[...new Set(fps.map((f) => f.path.replace(/\/[^/]*$/, '')))].join(', ')}`);
  lines.push(...r.errors.map((e) => `ERROR: ${e}`));
  const mine = (t) => files.some((f) => f.lib && t.startsWith(`${f.lib}#`));
  return { written: files.filter((f) => !f.same).map((f) => f.path), lines, parts: r.defs.filter((d) => mine(d.type)).map((d) => ({ type: d.type, kind: d.kind, behavesAs: d.behaves, value: d.kicad.value })) };
}

/**
 * What a package's symbol libraries hold, as a project would read them: [{ name, parts, ics: [{ symbol, as }], drawn,
 * skipped, errors? }] (kicadPartsOf, with the package's footprints).
 */
export function packageContents(pkg) {
  const fps = Object.fromEntries(pkg.footprints.map((f) => [`parts/${f.library}.pretty/${f.name}`, f.text]));
  const libs = [...pkg.symbols.map((s) => ({ name: s.name, files: { [`parts/${s.name}`]: s.text } })),
    ...pkg.symdirs.map((d) => ({ name: d.name, files: Object.fromEntries(d.files.map((f) => [`parts/${d.name}/${f.name}`, f.text])) }))];
  return libs.map((l) => {
    const r = kicadPartsOf({ ...l.files, ...fps });
    return { name: l.name, parts: r.defs.length, ics: r.defs.filter((d) => d.behaves).map((d) => ({ symbol: d.kicad.symbol, as: d.behaves })), drawn: r.defs.filter((d) => !d.behaves).length,
      skipped: r.skipped.length, ...(r.errors.length ? { errors: r.errors } : {}) };
  });
}

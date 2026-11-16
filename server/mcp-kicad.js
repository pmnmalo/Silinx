// The MCP server's import_part (server/mcp.js, #2674, #4280, docs/CIRCUITS.md): a KiCad symbol library (.kicad_sym) or
// footprint (.kicad_mod) of the exchange folder imported into the project's parts/ folder as the circuit editor's
// Import KiCad Part… does (core/kicad-import.js): as KiCad wrote it, what KiCad has no field for written in its symbols'
// properties; each of its symbols said, a part that behaves as a library IC, a part drawn only, or no part and why.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, clip } from './mcp-util.js';
import { exchangePath } from './mcp-transfer.js';

const MAX_DIR_FILES = 5000;
// a package's zip or a .kicad_symdir folder of the exchange folder, imported as a library of part_libraries is
async function importArchive(name, file, { libraries, origin, replace, symbols, as }) {
  if (symbols || as != null) throw toolError('symbols, name: a file\'s only, not a package\'s nor a folder\'s');
  const full = await exchangePath(file, 'file');
  const { SEXPR_LIMITS, readPcmPackage, symdirPackage, packageOrigin } = { ...await import('../core/sexpr.js'), ...await import('../core/kicad-pcm.js') };
  let st;
  try { st = await fsp.stat(full); } catch { throw toolError(`file: no file '${file}' in the exchange folder`); }
  let pkg;
  try {
    if (/\.zip$/i.test(full)) {
      if (!st.isFile()) throw new Error(`file: '${file}' is not a file`);
      const zlib = await import('node:zlib');
      pkg = await readPcmPackage(new Uint8Array(await fsp.readFile(full)), { inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) });
    } else {
      if (!st.isDirectory()) throw new Error(`file: '${file}' is not a folder`);
      const names = (await fsp.readdir(full)).filter((n) => /^[A-Za-z0-9][A-Za-z0-9._+-]*\.kicad_sym$/.test(n));
      if (names.length > MAX_DIR_FILES) throw new Error(`file: '${file}' has more than ${MAX_DIR_FILES} symbols`);
      const files = [];
      for (const n of names) {
        const s = await fsp.stat(path.join(full, n));
        if (s.isFile() && s.size <= SEXPR_LIMITS.maxBytes) files.push({ name: n, text: await fsp.readFile(path.join(full, n), 'utf8') });
      }
      pkg = symdirPackage(path.basename(full), files);
    }
    const given = Object.fromEntries(Object.entries(origin).filter(([, v]) => v != null && v !== ''));
    const r = await (await import('../core/kicad-import.js')).importKicadPackage(P, name, pkg, { libraries: libraries ?? null, origin: { ...packageOrigin(pkg.metadata), ...given }, replace });
    return { text: r.lines.join('\n'), data: { project: name, written: r.written, parts: r.parts }, untrusted: 'the package\'s names and texts' };
  } catch (e) { throw toolError(e.message); }
}

const mb = (n) => (n ? `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB` : 'size unknown');

export const KICAD_TOOLS = [
  {
    name: 'part_libraries', title: 'KiCad libraries to import',
    description: 'The KiCad libraries the server fetches for a circuit\'s parts (as the circuit editor\'s Browse KiCad Libraries…): KiCad\'s own symbol libraries (74xx, 4xxx: their parts behave as Silinx\'s ICs) and the library packages of the KiCad Plugin and Content Manager (its official index), each one\'s identifier, name, version, licence, author, size and description; query: its words in them. Given one library (its identifier): it is fetched (its SHA-256 checked; kept for offline use, as the index is a day) and what it holds is said: each of its symbol libraries\' parts, those that behave as ICs of the library (and which), those drawn only, its symbols that are no part (SMD, no footprint). import_part with library imports it. KiCad\'s parts have no logic; a package\'s licence is its own (KiCad\'s: CC-BY-SA-4.0 with its exception for designs).',
    inputSchema: { type: 'object', properties: { query: STR('Words to find in the libraries\' names, identifiers, descriptions and authors (with catalogue: in the parts\' numbers and titles).'), library: STR('One library\'s identifier: what it holds.'),
      catalogue: { type: 'boolean', description: 'The KiCad catalogue\'s parts instead (as the Parts panel\'s KiCad catalogue): each one\'s id (import_part\'s part), part number, what it is in Silinx, its library and licence. No file is fetched to list them.' },
      refresh: { type: 'boolean', description: 'The index fetched again (default: the one kept, under a day old).' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run({ query, library, refresh = false, catalogue = false } = {}) {
      if (catalogue) {
        if (library != null) throw toolError('library: not with catalogue');
        const C = await import('../core/kicad-catalogue.js');
        const found = C.searchCatalogue(query);
        const lines = found.map((e) => `${e.id}: ${C.catalogueTitle(e)} (${C.CATALOGUE_LIBRARIES[e.library].name} ${C.CATALOGUE_LIBRARIES[e.library].version}, ${C.CATALOGUE_LIBRARIES[e.library].licence})`);
        return { text: clip([...lines, ...(found.length ? [] : [`No part of the catalogue matches '${query}'.`])].join('\n')), data: { parts: found.map((e) => ({ ...e, title: C.catalogueTitle(e) })) } };
      }
      const K = await import('./kicad-libraries.js');
      let list;
      try { list = await K.kicadLibraries({ refresh }); } catch (e) { throw toolError(e.message); }
      if (library == null) {
        const { searchLibraries } = await import('../core/kicad-pcm.js');
        const found = searchLibraries(list.libraries, query);
        const text = [...found.map((l) => `${l.identifier}: ${l.name} ${l.version} (${l.licence || 'no licence'}${l.author ? `, ${l.author}` : ''}; ${mb(l.size)})${l.description ? ` — ${l.description}` : ''}`),
          ...(found.length ? [] : [`No library matches '${query}'.`]), ...(list.note ? [`WARNING: ${list.note}`] : [])];
        return { text: text.join('\n'), data: { libraries: found, fetched: list.fetched, note: list.note }, untrusted: 'the libraries\' names and descriptions' };
      }
      let o;
      try { o = await K.openKicadLibrary(String(library), { refresh }); } catch (e) { throw toolError(e.message); }
      const contents = await K.kicadContents(o.pkg);
      const l = o.library;
      const text = [`${l.identifier}: ${l.name} ${l.version} (${l.licence || 'no licence'}; ${mb(l.size)}${o.cached ? ', kept' : ', fetched'}), ${contents.length} symbol librar${contents.length === 1 ? 'y' : 'ies'}, ${o.pkg.footprints.length} footprint(s)`,
        ...contents.map((c) => `${c.name}: ${c.parts} part(s), ${c.ics.length} as ICs of the library${c.ics.length ? ` (${c.ics.map((x) => `${x.symbol} as ${x.as}`).join(', ')})` : ''}, ${c.drawn} drawn only; ${c.skipped} symbol(s) no part`)];
      return { text: clip(text.join('\n')), data: { library: l, cached: o.cached, contents, footprints: o.pkg.footprints.length }, untrusted: 'the library\'s names and texts' };
    },
  },
  {
    name: 'import_part', title: 'Import a KiCad part',
    description: 'Copy a KiCad symbol library (.kicad_sym, KiCad 6 to 10) or footprint (.kicad_mod) of the exchange folder into the project\'s parts/ folder (a footprint into parts/imported.pretty/), as KiCad wrote it; or a KiCad PCM package\'s .zip or a .kicad_symdir folder of it, or a library of part_libraries (library: its identifier), its symbol libraries (libraries: those chosen) with the footprints their symbols name, their source, author and licence the package\'s: its symbols are then parts of the project\'s circuits (circuit_parts with the project; their type parts/<library>.kicad_sym#<symbol>, placed by edit_circuit\'s add). KiCad\'s parts have no logic: a symbol behaves as an IC of Silinx\'s library when its part number is one (SN74LS00N, 74HC00, CD4011BE: the 7400, the 4011) or symbols.<name>.model names one, and its pins are that IC\'s, pin by pin; family (ttl, cmos) makes its inputs read as that family\'s. Any other symbol is drawn only (not simulated, its pins driving nothing), its pins placed by its footprint (a .kicad_mod of the project, or its name: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm; symbols.<name>.footprint gives one its file has not); one with no through-hole footprint is no part. What is given is written in the symbols\' properties (Silinx.Model, Silinx.Family, Silinx.Footprint; source, author and licence as Silinx.Source, Silinx.Author, Silinx.Licence on every symbol), which KiCad keeps. Each symbol is said: as which IC, drawn only, or no part and why.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, file: STR('The library or footprint: a .kicad_sym or .kicad_mod file of the exchange folder; or a PCM package\'s .zip, a .kicad_symdir folder (or library).'),
      part: STR('A part of the KiCad catalogue (part_libraries with catalogue: its id, kicad-74xx/74HC00), instead of a file: its symbol (and those it extends) imported into parts/<library>.kicad_symdir/, its footprint beside it, its files fetched by the server and checked.'),
      library: STR('A library of part_libraries, by its identifier (KiCad\'s own, a package of the KiCad PCM), instead of a file: fetched by the server (kept for offline use), its SHA-256 checked.'),
      libraries: { type: 'array', items: { type: 'string' }, maxItems: 200, description: 'With library, a .zip or a .kicad_symdir folder: the symbol libraries of it to import, by their names (part_libraries with the library; default: all).' },
      name: STR('Its file\'s name in parts/ (default: its own).'),
      symbols: { type: 'object', additionalProperties: { type: 'object', properties: { model: STR('An IC of the library it behaves as (7400, 74161…).'), family: { type: 'string', enum: ['ttl', 'cmos'] }, footprint: STR('Its footprint: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm_Vertical, or one of the project\'s .kicad_mod.') }, additionalProperties: false }, description: 'Per symbol (by its name), what to write in its properties.' },
      source: STR('Where it comes from (a URL, a library\'s name).'), author: STR('Its author.'), licence: STR('Its licence (an SPDX identifier: CC-BY-SA-4.0, CC-BY-4.0…).'),
      replace: { type: 'boolean', description: 'Replace a file of parts/ of that name (default: refused).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, file, library, part, libraries, name: as, symbols, source, author, licence, replace = false }) {
      await readProject(name);
      if (part != null) {
        if (file != null || library != null || libraries || symbols || as != null) throw toolError('part: alone (no file, library, libraries, symbols nor name)');
        const [{ importCataloguePart }, { catalogueFile }] = await Promise.all([import('../core/kicad-catalogue.js'), import('./kicad-libraries.js')]);
        let r;
        try { r = await importCataloguePart(P, name, String(part), catalogueFile, { replace }); } catch (e) { throw toolError(e.message); }
        return { text: [`${r.type}: imported`, ...r.lines].join('\n'), data: { project: name, type: r.type, written: r.written, parts: r.parts }, untrusted: 'the library\'s names and texts' };
      }
      if ((file == null) === (library == null)) throw toolError('file, library or part: one of them');
      if (library != null) {
        if (symbols || as != null) throw toolError('symbols, name: a file\'s only, not a library\'s');
        const K = await import('./kicad-libraries.js');
        let r;
        try {
          const { library: lib, pkg } = await K.openKicadLibrary(String(library));
          const given = Object.fromEntries(Object.entries({ source, author, licence }).filter(([, v]) => v != null && v !== ''));
          r = await (await import('../core/kicad-import.js')).importKicadPackage(P, name, pkg, { libraries: libraries ?? null, origin: { ...K.kicadOrigin(lib), ...given }, replace });
        } catch (e) { throw toolError(e.message); }
        return { text: r.lines.join('\n'), data: { project: name, written: r.written, parts: r.parts }, untrusted: 'the library\'s names and texts' };
      }
      // (a package's zip, #4285: a PCM package downloaded by hand; a .kicad_symdir folder: KiCad 10's libraries)
      if (/\.(zip|kicad_symdir)\/?$/i.test(String(file))) return importArchive(name, file, { libraries, origin: { source, author, licence }, replace, symbols, as });
      if (libraries) throw toolError('libraries: a package\'s or a library\'s only, not a file\'s');
      const full = await exchangePath(file, 'file');
      const base = as ?? path.basename(full);
      const { isKicadImportName, importKicadPart } = await import('../core/kicad-import.js');
      if (!isKicadImportName(base)) throw toolError(`${as == null ? 'file' : 'name'}: '${base}' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)`);
      const { SEXPR_LIMITS } = await import('../core/sexpr.js');
      let st;
      try { st = await fsp.stat(full); } catch { throw toolError(`file: no file '${file}' in the exchange folder`); }
      if (!st.isFile()) throw toolError(`file: '${file}' is not a file`);
      if (st.size > SEXPR_LIMITS.maxBytes) throw toolError(`file: '${file}' is too large: ${st.size} bytes (at most ${SEXPR_LIMITS.maxBytes})`);
      let r;
      try { r = await importKicadPart(P, name, { base, text: await fsp.readFile(full, 'utf8'), symbols, origin: { source, author, licence }, replace }); } catch (e) { throw toolError(e.message); }
      return { text: r.lines.join('\n'), data: { project: name, path: r.path, parts: r.parts, skipped: r.skipped, errors: r.errors }, untrusted: 'the library\'s names and texts' };
    },
  },
];

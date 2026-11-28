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
    description: 'The KiCad libraries for a circuit\'s parts (as the circuit editor\'s Browse KiCad Libraries…): KiCad\'s own symbol libraries (74xx, 4xxx: behaving as Silinx\'s ICs) and the KiCad Plugin and Content Manager\'s packages, each one\'s identifier, name, version, licence, author, size and description. Given a library: fetched (SHA-256 checked, kept offline) and its parts said: those behaving as library ICs (which), drawn only, or no part. import_part with library imports it. A package\'s licence is its own.',
    inputSchema: { type: 'object', properties: { query: STR('Words to find in the libraries\' names, identifiers, descriptions and authors (with catalogue: the parts\' numbers, titles and functions).'), library: STR('One library\'s identifier: what it holds.'),
      catalogue: { type: 'boolean', description: 'The KiCad catalogue\'s parts instead (as the Parts panel\'s): each one\'s id (import_part\'s part), part number, function, library and licence.' },
      refresh: { type: 'boolean', description: 'The index fetched again (default: the one kept, under a day old).' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run({ query, library, refresh = false, catalogue = false } = {}) {
      if (catalogue) {
        if (library != null) throw toolError('library: not with catalogue');
        const C = await import('../core/kicad-catalogue.js');
        const found = C.searchCatalogue(query);
        // (what each part is, #4495: Silinx's IC's title, said by its title already, or its KiCad function)
        const fn = (e) => C.catalogueFunction(e);
        const lines = found.map((e) => `${e.id}: ${C.catalogueTitle(e)}${fn(e).text && !fn(e).silinx ? ` — ${fn(e).text}` : ''} (${C.CATALOGUE_LIBRARIES[e.library].name} ${C.CATALOGUE_LIBRARIES[e.library].version}, ${C.CATALOGUE_LIBRARIES[e.library].licence})`);
        return { text: clip([...lines, ...(found.length ? [] : [`No part of the catalogue matches '${query}'.`])].join('\n')), data: { parts: found.map((e) => ({ ...e, title: C.catalogueTitle(e), function: fn(e).text })) } };
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
    description: 'Copy a KiCad symbol library (.kicad_sym) or footprint (.kicad_mod) of the exchange folder into parts/; or a KiCad PCM package (.zip, .kicad_symdir), a part_libraries library or a catalogue part, with the footprints its symbols name. Its symbols become parts of the project\'s circuits (type parts/<library>.kicad_sym#<symbol>). A symbol is a library IC when its part number is one (SN74LS00N: the 7400) or model names one; any other is drawn only, its pins by its footprint; one with no through-hole footprint is no part. What is given goes in its properties (Silinx.Model…). Each symbol\'s outcome is said.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, file: STR('The library or footprint: a .kicad_sym or .kicad_mod file of the exchange folder; or a PCM package\'s .zip, a .kicad_symdir folder (or library).'),
      part: STR('A part of the KiCad catalogue (its id, kicad-74xx/74HC00), instead of a file: its symbol and footprint fetched, checked and imported into parts/<library>.kicad_symdir/.'),
      library: STR('A library of part_libraries, by its identifier, instead of a file: fetched by the server, its SHA-256 checked.'),
      libraries: { type: 'array', items: { type: 'string' }, maxItems: 200, description: 'With library, a .zip or a .kicad_symdir: its symbol libraries to import, by name (default: all).' },
      name: STR('Its file\'s name in parts/ (default: its own).'),
      symbols: { type: 'object', additionalProperties: { type: 'object', properties: { model: STR('The library part it behaves as: an IC (7400, 74161…), or led, button, spdt.'), family: { type: 'string', enum: ['ttl', 'cmos'] }, footprint: STR('Its footprint: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm_Vertical, or one of the project\'s .kicad_mod.'),
        hdl: STR('A VHDL entity or Verilog module of the project that models it: its ports the pins (A → a, ~{EN} → en_n); the circuit\'s HDL instantiates it.'),
        ports: STR('With hdl: the pins\' ports where their names are no HDL names: "1=a, 2=y".') }, additionalProperties: false }, description: 'Per symbol (by its name), what to write in its properties.' },
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
  {
    name: 'export_part', title: 'Export parts in KiCad\'s formats',
    description: 'Write Silinx\'s parts in KiCad\'s formats into the exchange folder (as the circuit editor\'s ⋮ Export…): a .kicad_sym of the library\'s ICs (a unit per gate, DIP footprints, behaviour in Silinx.Model and Silinx.Family, read back as that IC); or a .zip, a KiCad PCM package of a project\'s KiCad parts and/or the library\'s parts, with its metadata. A file there already is refused unless replace.',
    inputSchema: { type: 'object', properties: {
      file: STR('The file to write in the exchange folder: a .kicad_sym (the ICs) or a .zip (a project\'s package).'),
      ics: { type: 'array', items: { type: 'string' }, maxItems: 200, description: 'The library\'s ICs, by their types (7400, 74161…; circuit_parts); default for a .kicad_sym: all of them.' },
      parts: { type: 'array', items: { type: 'string' }, maxItems: 300, description: 'With a .zip: the library\'s parts, ICs or not, by their types (led, seg7-cc, 7400…), with their footprints.' },
      all_parts: { type: 'boolean', description: 'With a .zip: every part of the library with pins (as parts listing them all).' },
      project: STR('With a .zip: the project whose KiCad parts are packaged (none: the library\'s parts alone).'),
      identifier: STR('With a .zip: the package\'s identifier, a reverse domain name (org.example.parts).'), name: STR('With a .zip: its name.'),
      description: STR('With a .zip: what it holds (at most 150 characters).'), author: STR('With a .zip: its author.'), licence: STR('With a .zip: its licence (SPDX: CC-BY-SA-4.0…).'),
      version: STR('With a .zip: its version (1.0.0).'),
      replace: { type: 'boolean', description: 'Replace a file of the exchange folder of that name (default: refused).' },
    }, required: ['file'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ file, ics, parts, all_parts: allParts = false, project: name, identifier, name: title, description, author, licence, version, replace = false }) {
      const X = await import('../core/kicad-export.js');
      const full = await exchangePath(file, 'file');
      const zip = /\.zip$/i.test(full);
      if (!zip && !/\.kicad_sym$/i.test(full)) throw toolError(`file: '${file}' is neither a .kicad_sym nor a .zip`);
      if (!replace) { try { await fsp.stat(full); throw toolError(`file: '${file}' is in the exchange folder already (replace: true replaces it)`); } catch (e) { if (e.toolError) throw e; } }
      let bytes, lines;
      try {
        if (!zip) {
          if (name != null) throw new Error('project: a .zip\'s only (a .kicad_sym holds the library\'s ICs)');
          if (parts != null || allParts) throw new Error('parts: a .zip\'s only (their footprints go with them; a .kicad_sym holds the library\'s ICs: ics)');
          const types = ics ?? X.EXPORTED_ICS;
          bytes = X.icLibrary(types);
          lines = [`${path.basename(full)} written: ${new Set(types).size} IC(s) of the library as KiCad symbols (${[...new Set(types)].join(', ')})`];
        } else {
          // (the library's parts, #4290: chosen, or all of them; with the ICs, not both)
          const lib = allParts ? X.EXPORTED_PARTS : parts ?? null;
          if (lib && ics) throw new Error('ics: parts or ics, not both (parts may hold ICs)');
          if (name == null && !lib && !ics) throw new Error('project: the project whose KiCad parts are packaged (or parts, ics: the library\'s)');
          const files = {};
          if (name != null) {
            await readProject(name);
            const { isKicadPartFile } = await import('../core/circuit-kicad.js');
            for (const f of (await P.fileTree(name)).filter(isKicadPartFile)) files[f] = await P.readFile(name, f);
          }
          const zlib = await import('node:zlib');
          bytes = await X.partsPackage(files, { identifier, name: title, description, author, licence, version }, { deflate: (d) => zlib.deflateRawSync(d) }, { ics: ics ?? null, parts: lib });
          const what = lib ? `${new Set(lib).size} part(s) of the library` : ics ? `${new Set(ics).size} IC(s) of the library` : '';
          lines = [`${path.basename(full)} written: the KiCad package ${identifier} ${version} of ${name != null ? `${Object.keys(files).length} file(s) of ${name}'s parts/${what ? ` and ${what}` : ''}` : what}`];
        }
      } catch (e) { throw toolError(e.message); }
      await fsp.writeFile(full, bytes);
      return { text: lines.join('\n'), data: { file: path.basename(full), bytes: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length } };
    },
  },
];

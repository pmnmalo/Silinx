// The MCP server's import_part (server/mcp.js, #2674, #4280, docs/CIRCUITS.md): a KiCad symbol library (.kicad_sym) or
// footprint (.kicad_mod) of the exchange folder copied into the project's parts/ folder, as KiCad wrote it; what KiCad
// has no field for written in its symbols' properties (core/kicad-edit.js: Silinx.Model, Silinx.Family,
// Silinx.Footprint; Silinx.Source, Silinx.Author, Silinx.Licence). Its symbols are then the project's circuits' parts
// (core/circuit-kicad.js): each one said, a part that behaves as a library IC, a part drawn only, or no part and why.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { exchangePath } from './mcp-transfer.js';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(kicad_sym|kicad_mod)$/;
/** The folder of the footprints import_part copies (parts/<this>.pretty). */
const FOOTPRINTS_LIB = 'imported';

/** A library's text read and its properties set: the text to write (a tool's error: one it cannot read). */
async function editedLibrary(text, symbols, origin) {
  const { readKicadSymLib } = await import('../core/kicad-sym.js');
  const { PARTS } = await import('../core/circuit-parts.js');
  const { setSymbolProperties } = await import('../core/kicad-edit.js');
  let lib;
  try { lib = readKicadSymLib(text); } catch (e) { throw toolError(e.message); }
  const names = new Set(lib.symbols.map((s) => s.name)), edits = {};
  for (const [name, o] of Object.entries(symbols || {})) {
    if (!names.has(name)) throw toolError(`symbols: no symbol '${name}' in the library (its symbols: ${[...names].join(', ')})`);
    if (o?.model != null && PARTS[o.model]?.kind !== 'ic') throw toolError(`symbols.${name}.model: '${o.model}' is not an IC of the library (circuit_parts)`);
    if (o?.family != null && o.family !== 'ttl' && o.family !== 'cmos') throw toolError(`symbols.${name}.family: ttl or cmos`);
    edits[name] = Object.fromEntries([['Silinx.Model', o?.model], ['Silinx.Family', o?.family], ['Silinx.Footprint', o?.footprint]].filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  }
  // (where it comes from: on each symbol its file defines itself, the derived ones taking their parent's)
  const from = Object.fromEntries([['Silinx.Source', origin.source], ['Silinx.Author', origin.author], ['Silinx.Licence', origin.licence]].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  if (Object.keys(from).length) for (const s of lib.symbols.filter((x) => !x.extends)) edits[s.name] = { ...from, ...edits[s.name] };
  return Object.keys(edits).length ? setSymbolProperties(text, edits) : text;
}

export const KICAD_TOOLS = [
  {
    name: 'import_part', title: 'Import a KiCad part',
    description: 'Copy a KiCad symbol library (.kicad_sym, KiCad 6 to 10) or footprint (.kicad_mod) of the exchange folder into the project\'s parts/ folder (a footprint into parts/imported.pretty/), as KiCad wrote it: its symbols are then parts of the project\'s circuits (circuit_parts with the project; their type parts/<library>.kicad_sym#<symbol>, placed by edit_circuit\'s add). KiCad\'s parts have no logic: a symbol behaves as an IC of Silinx\'s library when its part number is one (SN74LS00N, 74HC00, CD4011BE: the 7400, the 4011) or symbols.<name>.model names one, and its pins are that IC\'s, pin by pin; family (ttl, cmos) makes its inputs read as that family\'s. Any other symbol is drawn only (not simulated, its pins driving nothing), its pins placed by its footprint (a .kicad_mod of the project, or its name: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm; symbols.<name>.footprint gives one its file has not); one with no through-hole footprint is no part. What is given is written in the symbols\' properties (Silinx.Model, Silinx.Family, Silinx.Footprint; source, author and licence as Silinx.Source, Silinx.Author, Silinx.Licence on every symbol), which KiCad keeps. Each symbol is said: as which IC, drawn only, or no part and why.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, file: STR('The library or footprint: a .kicad_sym or .kicad_mod file of the exchange folder.'),
      name: STR('Its file\'s name in parts/ (default: its own).'),
      symbols: { type: 'object', additionalProperties: { type: 'object', properties: { model: STR('An IC of the library it behaves as (7400, 74161…).'), family: { type: 'string', enum: ['ttl', 'cmos'] }, footprint: STR('Its footprint: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm_Vertical, or one of the project\'s .kicad_mod.') }, additionalProperties: false }, description: 'Per symbol (by its name), what to write in its properties.' },
      source: STR('Where it comes from (a URL, a library\'s name).'), author: STR('Its author.'), licence: STR('Its licence (an SPDX identifier: CC-BY-SA-4.0, CC-BY-4.0…).'),
      replace: { type: 'boolean', description: 'Replace a file of parts/ of that name (default: refused).' },
    }, required: ['project', 'file'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, file, name: as, symbols, source, author, licence, replace = false }) {
      await readProject(name);
      const full = await exchangePath(file, 'file');
      const base = as ?? path.basename(full);
      if (!NAME_RE.test(base)) throw toolError(`${as == null ? 'file' : 'name'}: '${base}' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)`);
      const { SEXPR_LIMITS } = await import('../core/sexpr.js');
      let st;
      try { st = await fsp.stat(full); } catch { throw toolError(`file: no file '${file}' in the exchange folder`); }
      if (!st.isFile()) throw toolError(`file: '${file}' is not a file`);
      if (st.size > SEXPR_LIMITS.maxBytes) throw toolError(`file: '${file}' is too large: ${st.size} bytes (at most ${SEXPR_LIMITS.maxBytes})`);
      const text = await fsp.readFile(full, 'utf8');
      const footprint = base.endsWith('.kicad_mod');
      if (footprint && symbols) throw toolError('symbols: a footprint has none');
      let out = text;
      if (footprint) { try { (await import('../core/kicad-mod.js')).readKicadFootprint(text); } catch (e) { throw toolError(e.message); } }
      else out = await editedLibrary(text, symbols, { source, author, licence });
      const rel = footprint ? `parts/${FOOTPRINTS_LIB}.pretty/${base}` : `parts/${base}`;
      if (!replace && (await P.fileTree(name)).includes(rel)) throw toolError(`${rel}: the project has it already (replace: true replaces it)`);
      try { await P.writeFile(name, rel, out); } catch (e) { throw toolError(e.message); }
      const r = await (await import('../core/circuit-kicad.js')).useProjectParts(P, name);
      const mine = (t) => footprint || t.startsWith(`${rel}#`);
      const lines = [`${rel} written${out !== text ? ' (its symbols\' Silinx properties set)' : ''}`,
        ...r.defs.filter((d) => mine(d.type)).map((d) => `${d.type}: ${d.behaves ? `behaves as the ${d.behaves} (by its ${d.how})` : 'drawn only: not simulated'}`),
        ...r.skipped.filter((x) => mine(x.type)).map((x) => `${x.type}: not a part: ${x.reason}`),
        ...r.notes.filter((x) => !footprint && x.startsWith(`${rel}: `)).map((w) => `WARNING: ${w}`),
        ...r.errors.map((e) => `ERROR: ${e}`)];
      const parts = r.defs.filter((d) => mine(d.type)).map((d) => ({ type: d.type, kind: d.kind, behavesAs: d.behaves, value: d.kicad.value }));
      return { text: lines.join('\n'), data: { project: name, path: rel, parts, skipped: r.skipped.filter((x) => mine(x.type)), errors: r.errors },
        untrusted: 'the library\'s names and texts' };
    },
  },
];

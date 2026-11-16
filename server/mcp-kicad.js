// The MCP server's import_part (server/mcp.js, #2674, #4280, docs/CIRCUITS.md): a KiCad symbol library (.kicad_sym) or
// footprint (.kicad_mod) of the exchange folder imported into the project's parts/ folder as the circuit editor's
// Import KiCad Part… does (core/kicad-import.js): as KiCad wrote it, what KiCad has no field for written in its symbols'
// properties; each of its symbols said, a part that behaves as a library IC, a part drawn only, or no part and why.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { exchangePath } from './mcp-transfer.js';

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

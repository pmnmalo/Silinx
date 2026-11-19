// The KiCad parts a project's link carries (#4573, core/design-link.js encodeDesign): only those its drawings use. A
// project's parts/ folder holds whole KiCad libraries (core/circuit-kicad.js: a .kicad_sym, a .kicad_symdir folder of
// one file per symbol, the .pretty folders of their footprints), often hundreds of kilobytes of which a circuit uses a
// few symbols: all of them made the link too long to be made at all. A part a drawing uses is named by its type
// (parts/74xx.kicad_symdir#74LS367) in the drawing's file; the link keeps that symbol's file, those of the symbols it
// extends, and its footprint (its Silinx.Footprint, else its Footprint, looked up as core/circuit-kicad.js pinPlaces
// does). A library in one .kicad_sym file is kept whole (its symbols are not split); a file of parts/ that is no KiCad
// part's is kept; a symbol file that does not read keeps its whole library and every footprint. Isomorphic module.
import { readKicadSymbols } from './kicad-sym.js';

const TYPE_RE = /(parts\/[^"#\\\n]+?\.kicad_sym(?:dir)?)#([^"\\\n]+)/g;
// (core/circuit-kicad.js's, not imported: design-link.js stays clear of the circuits' modules)
const LIB_RE = /^parts\/[^/]+\.kicad_sym$/i, DIR_FILE_RE = /^(parts\/[^/]+\.kicad_symdir)\/[^/]+\.kicad_sym$/i, FP_RE = /^parts\/([^/]+)\.pretty\/([^/]+)\.kicad_mod$/i;
const isKicadPartFile = (path) => LIB_RE.test(path) || DIR_FILE_RE.test(path) || FP_RE.test(path);

/** The KiCad parts the project's files use: Map(library path → Set of symbol names), named in any file outside parts/. */
export function usedPartTypes(files) {
  const used = new Map();
  for (const [path, text] of Object.entries(files)) {
    if (path.startsWith('parts/') || typeof text !== 'string') continue;
    for (const [, lib, sym] of text.matchAll(TYPE_RE)) (used.get(lib) ?? used.set(lib, new Set()).get(lib)).add(sym);
  }
  return used;
}

// a library's symbols read: Map(name → { file, extends, footprint }); null when one of its files does not read
function symbolsOf(lib, files) {
  const out = new Map();
  const paths = lib.toLowerCase().endsWith('.kicad_symdir') ? Object.keys(files).filter((p) => DIR_FILE_RE.exec(p)?.[1] === lib) : [lib];
  for (const file of paths) {
    let read;
    try { read = readKicadSymbols(files[file]); } catch { return null; }
    for (const s of read.symbols) out.set(s.name, { file, extends: s.extends, footprint: s.properties['Silinx.Footprint'] || s.properties.Footprint || null });
  }
  return out;
}

/**
 * The files of the project's parts/ that its link leaves out (`files`: { path: text }, the project's text files): the
 * KiCad part files no drawing uses, sorted. [] when the project has none.
 */
export function unusedPartFiles(files) {
  const parts = Object.keys(files).filter(isKicadPartFile);
  if (!parts.length) return [];
  const keep = new Set();
  const fps = parts.map((p) => [p, FP_RE.exec(p)]).filter(([, m]) => m);
  // (its footprint's file: Lib:Name, Name; a library the PCM installed named PCM_<its name>, as pinPlaces looks it up)
  const keepFootprint = (name) => {
    if (!name) return;
    const want = new Set([name, name.replace(/^PCM_/, ''), name.replace(/^[^:]*:/, '')]);
    for (const [p, m] of fps) if (want.has(`${m[1]}:${m[2]}`) || want.has(m[2])) keep.add(p);
  };
  for (const [lib, names] of usedPartTypes(files)) {
    const syms = symbolsOf(lib, files);
    // (a library that does not read: kept whole, and every footprint, which its symbols may name)
    if (!syms) { for (const p of parts) if (p === lib || p.startsWith(`${lib}/`) || FP_RE.test(p)) keep.add(p); continue; }
    for (const name of names) {
      // (the symbol, then each it extends: their files and footprints)
      for (let s = syms.get(name), k = 0; s && k < 64; s = s.extends ? syms.get(s.extends) : null, k++) { keep.add(s.file); keepFootprint(s.footprint); }
    }
  }
  return parts.filter((p) => !keep.has(p)).sort();
}

// The catalogue of KiCad parts (#4305, #4278): parts found by their part number, not by their library, with no
// library's content in Silinx. Its data (core/kicad-catalogue-data.js, written by scripts/kicad-catalogue.mjs) says
// where each part is: its library file's URL and SHA-256 at a pinned version, what it is in Silinx (as which IC of the
// library, or drawn only), the symbols it extends, the footprint it names. A part imported takes only its symbol (and
// its parents) out of its library, each into a file of its own as KiCad 10's .kicad_symdir folders hold them
// (parts/74xx.kicad_symdir/74HC00.kicad_sym), its origin written in it, its footprint beside it: native KiCad files.
// The files are fetched by the caller (getFile: the local server's, or the browser's from a host that sends CORS
// headers), each one checked against its SHA-256 here. Isomorphic module.
import { CATALOGUE, CATALOGUE_LIBRARIES } from './kicad-catalogue-data.js';
import { PARTS } from './circuit-parts.js';
import { checkSha256 } from './kicad-pcm.js';
import { symbolTexts, oneSymbolFile } from './kicad-edit.js';
import { importKicadPackage } from './kicad-import.js';

export { CATALOGUE, CATALOGUE_LIBRARIES };
/** The hosts a browser alone fetches a catalogue's file from (they send CORS headers; gitlab.com's API only). */
export const CORS_HOSTS = ['raw.githubusercontent.com', 'gitlab.com'];

/** The URL a browser alone fetches a catalogue's file from, or null (its host sends no CORS header): GitHub's raw file
 *  as it is; gitlab.com's raw file (no CORS header) through GitLab's API, which serves the same bytes with one (#4312). */
export function browserUrl(url) {
  const u = new URL(url);
  if (u.hostname === 'raw.githubusercontent.com') return url;
  const m = u.hostname === 'gitlab.com' && /^\/(.+?)\/-\/raw\/([^/]+)\/(.+)$/.exec(u.pathname);
  return m ? `https://gitlab.com/api/v4/projects/${encodeURIComponent(decodeURIComponent(m[1]))}/repository/files/${encodeURIComponent(decodeURIComponent(m[3]))}/raw?ref=${encodeURIComponent(decodeURIComponent(m[2]))}` : null;
}

/** A catalogue's part's title, in Silinx's words: what it is in Silinx. */
export function catalogueTitle(e) {
  return e.as ? `${e.value}, as the ${e.as}: ${PARTS[e.as].title}` : `${e.value}, drawn only: ${e.pins} pin(s)${e.package === 'grid' ? '' : `, ${e.package}`}`;
}

/** The catalogue's parts `q` finds (every word of it in a part's number, symbol, title or library), all with none. */
export function searchCatalogue(q, list = CATALOGUE) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((e) => words.every((w) => `${e.value} ${e.symbol} ${catalogueTitle(e)} ${CATALOGUE_LIBRARIES[e.library].name}`.toLowerCase().includes(w)));
}

/** A catalogue's part by its id, or null. */
const catalogueEntry = (id) => CATALOGUE.find((e) => e.id === id) ?? null;

/** Whether a URL is one of the catalogue's files (the local server fetches those only for it). */
export function isCatalogueFile(url) {
  return Object.values(CATALOGUE_LIBRARIES).some((l) => l.url === url) || CATALOGUE.some((e) => e.footprint?.url === url);
}
/** The SHA-256 a catalogue's file has (null: not one of them). */
export const catalogueSha256 = (url) => Object.values(CATALOGUE_LIBRARIES).find((l) => l.url === url)?.sha256 ?? CATALOGUE.find((e) => e.footprint?.url === url)?.footprint.sha256 ?? null;

/**
 * A catalogue's part imported into the project `name` through `P` (core/kicad-import.js importKicadPackage): its
 * symbol and those it extends written in parts/<library>.kicad_symdir/, its footprint in parts/<its library>.pretty/;
 * a file there already with the same text kept, another one refused unless `replace`. `getFile(url)`: a file's text
 * (each one checked against its SHA-256 here). { type (the part's), written, lines, parts }. `catalogue`: another one than
 * Silinx's (a test's).
 */
export async function importCataloguePart(P, name, id, getFile, { replace = false, catalogue = null } = {}) {
  // (catalogue: another one's { CATALOGUE, CATALOGUE_LIBRARIES }, a test's)
  const e = catalogue ? catalogue.CATALOGUE.find((x) => x.id === id) ?? null : catalogueEntry(id);
  if (!e) throw new Error(`no part '${id}' in the KiCad catalogue (part_libraries with catalogue lists them)`);
  const lib = (catalogue?.CATALOGUE_LIBRARIES ?? CATALOGUE_LIBRARIES)[e.library];
  const text = async (url, sha256) => { const t = await getFile(url); await checkSha256(new TextEncoder().encode(t), sha256, url); return t; };
  const { version, symbols } = symbolTexts(await text(lib.url, lib.sha256));
  const dir = `${lib.file.replace(/\.kicad_sym$/, '')}.kicad_symdir`;
  const files = [...(e.needs || []), e.symbol].map((s) => {
    if (!symbols.has(s)) throw new Error(`${lib.url}: no symbol '${s}' in it`);
    return { name: `${s}.kicad_sym`, text: oneSymbolFile(version, symbols.get(s)) };
  });
  const footprints = [];
  if (e.footprint) {
    const [library, fp] = e.footprint.name.split(':');
    footprints.push({ library, name: `${fp}.kicad_mod`, text: await text(e.footprint.url, e.footprint.sha256) });
  }
  const r = await importKicadPackage(P, name, { metadata: null, symbols: [], symdirs: [{ name: dir, files }], footprints },
    { origin: { source: `${lib.name} ${lib.version} (${lib.url})`, author: lib.author, licence: lib.licence }, replace, keepSame: true });
  return { type: `parts/${dir}#${e.symbol}`, ...r };
}

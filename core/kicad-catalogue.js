// The catalogue of KiCad parts (#4305, #4278): parts found by their part number, not by their library, with no
// library's content in Silinx. Its data (core/kicad-catalogue-data.js, written by scripts/kicad-catalogue.mjs) says
// where each part is: its library file's URL and SHA-256 at a pinned version, what it is in Silinx (as which IC of the
// library, or drawn only), the symbols it extends, the footprint it names. A part imported takes only its symbol (and
// its parents) out of its library, each into a file of its own as KiCad 10's .kicad_symdir folders hold them
// (parts/74xx.kicad_symdir/74HC00.kicad_sym), its origin written in it, its footprint beside it: native KiCad files.
// The files are fetched by the caller (getFile: the local server's, or the browser's from a host that sends CORS
// headers), each one checked against its SHA-256 here. Isomorphic module.
import { CATALOGUE, CATALOGUE_LIBRARIES, CATALOGUE_LOOKS } from './kicad-catalogue-data.js';
import { PARTS } from './circuit-parts.js';
import { dip } from './circuit-ics.js';
import { checkSha256 } from './kicad-pcm.js';
import { symbolTexts, oneSymbolFile, symbolFileName, setSymbolProperties } from './kicad-edit.js';
import { importKicadPackage } from './kicad-import.js';
import { CATALOGUE_FUNCTIONS } from './kicad-catalogue-functions.js';
import { functionPt, foldText } from './part-function.js';

export { CATALOGUE, CATALOGUE_LIBRARIES, CATALOGUE_FUNCTIONS };
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
  if (e.as && PARTS[e.as].kind !== 'ic') return `${e.value}, as the ${PARTS[e.as].title} of the library`;   // (#4349)
  return e.as ? `${e.value}, as the ${e.as}: ${PARTS[e.as].title}` : `${e.value}, drawn only: ${e.pins} pin(s)${e.package === 'grid' ? '' : `, ${e.package}`}`;
}

/**
 * What a catalogue's part is (#4495): { text, pt, silinx }: the title of the IC of Silinx's library it behaves as (silinx:
 * true; its Portuguese the interface's), else its KiCad description shortened to its function (CATALOGUE_FUNCTIONS; pt:
 * that function in Portuguese, or null: none by the vocabulary), else the title of the library's part it behaves as (an
 * LED); text '' for none. `functions`: another catalogue's (a test's).
 */
export function catalogueFunction(e, functions = CATALOGUE_FUNCTIONS) {
  const as = e.as && PARTS[e.as];
  if (as?.kind?.startsWith('ic')) return { text: as.title, pt: null, silinx: true };
  if (functions[e.id]) return { text: functions[e.id], pt: functionPt(functions[e.id]), silinx: false };
  return { text: as ? as.title : '', pt: null, silinx: !!as };
}

/**
 * The catalogue's parts `q` finds (every word of it in a part's number, symbol, title, function, the function's
 * Portuguese or library; its case and accents aside), all with none. `more(e)`: a text found too (the interface's
 * language's).
 */
export function searchCatalogue(q, list = CATALOGUE, { more = null } = {}) {
  const words = foldText(q).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((e) => {
    const f = catalogueFunction(e);
    const text = foldText(`${e.value} ${e.symbol} ${catalogueTitle(e)} ${f.text} ${f.pt ?? ''} ${more ? more(e) ?? '' : ''} ${CATALOGUE_LIBRARIES[e.library]?.name ?? ''}`);
    return words.every((w) => text.includes(w));
  });
}

/** A catalogue's part by its id, or null. */
const catalogueEntry = (id) => CATALOGUE.find((e) => e.id === id) ?? null;

const KINDS = { c: 'circle', l: 'line', a: 'arc', p: 'poly' };
/**
 * A catalogue's part drawn only, as its preview draws it before it is imported (#4346): { kind: 'drawn', kicad: { value,
 * symbol, keywords }, pins: [{ n, dx, dy }], look?, dip? }: its footprint's drawing and pads (CATALOGUE_LOOKS; its pads
 * only when it has no drawing), or a DIP's pins;
 * null for a part that behaves as an IC (its IC's preview) or one with neither. An LED, a switch or a button of the
 * library's (#4349) is drawn so too, its colour its own.
 */
export function catalogueDrawing(e, looks = CATALOGUE_LOOKS) {
  if (!e || PARTS[e.as]?.kind === 'ic') return null;
  const kicad = { value: e.value, symbol: e.symbol, keywords: '' };
  const m = /^DIP-(\d+)$/.exec(e.package);
  if (m) { const n = Number(m[1]), at = dip(n); return { kind: 'drawn', kicad, dip: n, pins: Array.from({ length: n }, (_, k) => ({ n: k + 1, ...at(k + 1) })) }; }
  const l = e.footprint && looks[e.footprint.name];
  if (!l) return null;
  const shapes = l.shapes.map(([k, fill, w, ...v]) => {
    const pts = [];
    for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
    return k === 'c' ? { k: 'circle', fill: !!fill, w, c: [v[0], v[1]], r: v[2] } : { k: KINDS[k], fill: !!fill, w, pts };
  });
  return { kind: 'drawn', kicad, pins: l.pins.map(([n, dx, dy]) => ({ n, dx, dy })), ...(shapes.length ? { look: { layer: 'F.Fab', shapes } } : {}) };
}

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
    const text = oneSymbolFile(version, symbols.get(s));
    // (the footprint the catalogue picks for it, #4385: its Silinx.Footprint)
    return { name: symbolFileName(s), text: s === e.symbol && e.footprint?.set ? setSymbolProperties(text, { [s]: { 'Silinx.Footprint': e.footprint.name } }) : text };   // (KiCad's escapes, #4318)
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

// KiCad's libraries to browse (#4285, #4278): the Plugin and Content Manager's index (https://dev-docs.kicad.org/en/addons/:
// repository.json names its packages' list, packages-v1.json, each package's versions with their zip's URL and SHA-256)
// read into its library packages; and KiCad's own symbol libraries, which the PCM has not (they ship with KiCad), taken
// at a tag of theirs, their SHA-256 pinned here. A package's zip read (core/zip.js, its limits) into its symbol libraries
// (symbols/*.kicad_sym, symbols/*.kicad_symdir/*.kicad_sym) and footprints (footprints/*.pretty/*.kicad_mod), its
// metadata.json; nothing else of it is inflated (its 3D models, its resources). Everything here comes from outside: its
// names are checked, its sizes limited, its SHA-256 compared before it is read. Isomorphic module.
import { readZip } from './zip.js';

/** The PCM's official repository. */
export const PCM_REPOSITORY = 'https://repository.kicad.org/repository.json';
// KiCad's own libraries (their 9.0.0 tag: one file per library, KiCad 10's split in folders), the ones whose parts
// behave as Silinx's ICs
const OFFICIAL = 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/9.0.0';
export const OFFICIAL_LIBRARIES = [
  { identifier: 'org.kicad.libraries.symbols.74xx', name: 'KiCad 74xx symbols', library: '74xx.kicad_sym', size: 1270177,
    sha256: 'd229bea4164b7197952f31aa6deff19d9eaa0cf0a319190424cfad3ba1b6a727', description: 'KiCad\'s own 74 series logic symbols (TTL and CMOS): its 74LS, 74HC, 74HCT…' },
  { identifier: 'org.kicad.libraries.symbols.4xxx', name: 'KiCad 4xxx symbols', library: '4xxx.kicad_sym', size: 365382,
    sha256: '60cbb92571dd4a4b75b5a691817c309219dd88f42e070af556ba9ec973335888', description: 'KiCad\'s own 4000 series CMOS logic symbols' },
].map((x) => ({ ...x, kind: 'file', version: '9.0.0', url: `${OFFICIAL}/${x.library}`, licence: 'CC-BY-SA-4.0', author: 'KiCad Libraries team' }));

const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const ID_RE = /^[a-zA-Z0-9-]{1,50}(\.[a-zA-Z0-9-]{1,50})+$/;   // (the PCM's identifiers: reverse DNS)

/** repository.json read: its packages' list's { url, sha256 } (throws on one that is not a PCM repository). */
export function pcmPackagesOf(json) {
  const r = typeof json === 'string' ? JSON.parse(json) : json;
  const p = r?.packages;
  if (!p || typeof p.url !== 'string' || !/^https:\/\//.test(p.url)) throw new Error('not a KiCad PCM repository: no packages\' URL');
  return { name: str(r.name, 200), url: p.url, sha256: /^[0-9a-f]{64}$/i.test(p.sha256 || '') ? p.sha256.toLowerCase() : null };
}

// a version number compared part by part (10.0.0 after 9.0.0, 2.10 after 2.9)
const versionKey = (v) => String(v).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
const newer = (a, b) => { const x = versionKey(a), y = versionKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };

/**
 * The library packages of packages-v1.json, each one's newest stable version with a download: [{ identifier, name,
 * description, licence, author, version, url, sha256, size, installSize, kind: 'package' }], by name. Others are left out:
 * not a library, no stable version, an identifier, a URL or a SHA-256 that is not one.
 */
export function pcmLibraries(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(d?.packages)) throw new Error('not a KiCad PCM packages\' list: no packages');
  const out = [];
  for (const p of d.packages) {
    if (p?.type !== 'library' || !ID_RE.test(p.identifier || '')) continue;
    const vs = (Array.isArray(p.versions) ? p.versions : []).filter((v) => v?.status === 'stable' && /^https:\/\//.test(v.download_url || '') && /^[0-9a-f]{64}$/i.test(v.download_sha256 || ''));
    const v = vs.reduce((a, b) => (!a || newer(b.version, a.version) ? b : a), null);
    if (!v) continue;
    out.push({ identifier: p.identifier, name: str(p.name, 200) || p.identifier, description: str(p.description, 500), licence: str(p.license, 100), author: str(p.author?.name, 200),
      version: str(v.version, 50), url: v.download_url, sha256: v.download_sha256.toLowerCase(), size: Number(v.download_size) || null, installSize: Number(v.install_size) || null, kind: 'package' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** The libraries `q` finds (every word of it in a library's name, identifier, description or author), all with none. */
export function searchLibraries(list, q) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => words.every((w) => `${p.name} ${p.identifier} ${p.description} ${p.author}`.toLowerCase().includes(w)));
}

/** The SHA-256 of some bytes, in hex. */
export async function sha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
/** Throws unless the bytes' SHA-256 is `want` (the index's, or one pinned). */
export async function checkSha256(bytes, want, what = 'the download') {
  const got = await sha256Hex(bytes);
  if (got !== String(want).toLowerCase()) throw new Error(`${what}'s SHA-256 is ${got}, not the ${want} it should be: not read`);
}

// a package's entries Silinx reads, by their path (no other is inflated); a path out of the package refused
// (a .kicad_symdir's file named as KiCad escapes a symbol's name, 10k_Axial_1{slash}6W.kicad_sym, #4318)
const SYM = /^symbols\/([A-Za-z0-9][A-Za-z0-9._+-]*\.kicad_sym)$/, SYMDIR = /^symbols\/([A-Za-z0-9][A-Za-z0-9._+-]*\.kicad_symdir)\/([A-Za-z0-9][A-Za-z0-9._+{}-]*\.kicad_sym)$/;
const FP = /^footprints\/([A-Za-z0-9][A-Za-z0-9._+-]*)\.pretty\/([A-Za-z0-9][A-Za-z0-9._+-]*\.kicad_mod)$/;
/** The limits of a package read: its entries, and what is inflated of it. */
export const PACKAGE_LIMITS = { maxFiles: 50000, maxEntry: 32 << 20, maxTotal: 256 << 20 };

/**
 * A PCM package's zip read: { metadata, symbols: [{ name, text }] (a library's file), symdirs: [{ name, files: [{ name,
 * text }] }], footprints: [{ library, name, text }] }. Throws on a zip over the limits, a path out of the package
 * (absolute, .., a backslash) or one with no symbols nor footprints.
 */
export async function readPcmPackage(bytes, codec, limits = {}) {
  const lim = { ...PACKAGE_LIMITS, ...limits };
  const entries = await readZip(bytes, codec, { ...lim, onEntry: ({ path, symlink }) => {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..') || /^[A-Za-z]:/.test(path)) throw new Error(`a path out of the package: ${path}`);
    if (symlink) return 'a link';
    return path === 'metadata.json' || SYM.test(path) || SYMDIR.test(path) || FP.test(path) ? null : 'not read';
  } });
  const dec = new TextDecoder();
  const out = { metadata: null, symbols: [], symdirs: [], footprints: [] };
  const dirs = new Map();
  for (const e of entries) {
    const text = dec.decode(e.data);
    let m;
    if (e.path === 'metadata.json') { try { out.metadata = JSON.parse(text); } catch { throw new Error('its metadata.json is not JSON'); } }
    else if ((m = SYM.exec(e.path))) out.symbols.push({ name: m[1], text });
    else if ((m = SYMDIR.exec(e.path))) (dirs.get(m[1]) ?? dirs.set(m[1], []).get(m[1])).push({ name: m[2], text });
    else if ((m = FP.exec(e.path))) out.footprints.push({ library: m[1], name: m[2], text });
  }
  out.symdirs = [...dirs].map(([name, files]) => ({ name, files }));
  if (!out.symbols.length && !out.symdirs.length && !out.footprints.length) throw new Error('the package has no symbols nor footprints');
  return out;
}

/** A .kicad_symdir folder's files ([{ name, text }]) as a package of one library (readPcmPackage's shape). */
export const symdirPackage = (name, files) => ({ metadata: null, symbols: [], symdirs: [{ name, files: files.filter((f) => /\.kicad_sym$/i.test(f.name)) }], footprints: [] });

/** Where a package's zip says it comes from (its metadata.json): { source, author, licence } (none it has not). */
export function packageOrigin(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const v = Array.isArray(m.versions) ? m.versions[0]?.version : null;
  return Object.fromEntries(Object.entries({ source: m.identifier ? `${str(m.identifier, 100)}${v ? ` ${str(String(v), 50)}` : ''}` : undefined, author: str(m.author?.name, 200) || undefined,
    licence: str(m.license, 100) || undefined }).filter(([, x]) => x));
}

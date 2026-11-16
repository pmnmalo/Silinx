// KiCad's libraries fetched by the local server (#4285, #4278): the PCM's index and its library packages, and KiCad's own
// symbol libraries (core/kicad-pcm.js), for the circuit editor's Browse KiCad Libraries… and the MCP's part_libraries
// and import_part. A browser cannot fetch them (repository.kicad.org and GitHub's release files send no CORS header): the
// server does, from an allowed list of hosts only, over HTTPS, its redirects checked the same way, its sizes limited.
// What it fetched is kept in Silinx's configuration folder (kicad/: the index, each package by its SHA-256), so that a
// library fetched once is there offline; the index is fetched again after a day, or when asked, the one kept used when
// the network fails. A package is read only once its SHA-256 is the index's.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { configDir } from './toolchain.js';
import { PCM_REPOSITORY, OFFICIAL_LIBRARIES, pcmPackagesOf, pcmLibraries, checkSha256, readPcmPackage } from '../core/kicad-pcm.js';

/** The hosts the server fetches KiCad's libraries from (a redirect to another one is refused). */
export const ALLOWED_HOSTS = ['repository.kicad.org', 'gitlab.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com',
  'raw.githubusercontent.com', 'codeload.github.com'];
const FETCH_LIMITS = { maxBytes: 96 << 20, redirects: 5, timeoutMs: 120000 };
const INDEX_AGE_MS = 24 * 3600 * 1000;
const CODEC = { inflate: (d, limit) => zlib.inflateRawSync(d, limit === undefined ? {} : { maxOutputLength: Math.max(1, limit) }) };

let fetchImpl = (...a) => globalThis.fetch(...a);
/** The function the server fetches with (tests give theirs; null: the platform's). */
export function setKicadFetch(fn) { fetchImpl = fn || ((...a) => globalThis.fetch(...a)); }
const cacheDir = () => path.join(configDir(), 'kicad');

/** Why a URL is not one the server fetches (null: it is): HTTPS, an allowed host, no user nor port. */
export function refusedUrl(u) {
  let url;
  try { url = new URL(u); } catch { return `not a URL: ${u}`; }
  if (url.protocol !== 'https:') return `not an HTTPS URL: ${u}`;
  if (url.username || url.password || url.port) return `a URL with a user or a port: ${u}`;
  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) return `not a host KiCad's libraries are fetched from (${ALLOWED_HOSTS.join(', ')}): ${url.hostname}`;
  return null;
}

/** A URL's bytes, fetched from the allowed hosts only (each redirect checked), at most `maxBytes`. */
export async function fetchAllowed(u, { maxBytes = FETCH_LIMITS.maxBytes } = {}) {
  let url = u;
  for (let k = 0; ; k++) {
    const why = refusedUrl(url);
    if (why) throw new Error(why);
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_LIMITS.timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (k >= FETCH_LIMITS.redirects) throw new Error(`too many redirects: ${u}`);
      url = new URL(res.headers.get('location'), url).href;
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length'));
    if (declared > maxBytes) throw new Error(`${url}: ${declared} bytes, more than the ${maxBytes} fetched`);
    const chunks = [];
    let n = 0;
    for await (const c of res.body) { n += c.length; if (n > maxBytes) throw new Error(`${url}: more than the ${maxBytes} bytes fetched`); chunks.push(c); }
    return new Uint8Array(Buffer.concat(chunks));
  }
}

async function readCache(name) { try { return { bytes: new Uint8Array(await fs.readFile(path.join(cacheDir(), name))), at: (await fs.stat(path.join(cacheDir(), name))).mtimeMs }; } catch { return null; } }
async function writeCache(name, bytes) { await fs.mkdir(cacheDir(), { recursive: true }); await fs.writeFile(path.join(cacheDir(), name), bytes); }

/**
 * The libraries to browse: { libraries: [KiCad's own, then the PCM's library packages], fetched (true: from the network
 * now), note (the index kept used, and why) }. `refresh`: the index fetched again however recent the one kept is.
 */
export async function kicadLibraries({ refresh = false } = {}) {
  const kept = await readCache('packages-v1.json');
  let bytes = kept?.bytes, fetched = false, note = null;
  if (!kept || refresh || Date.now() - kept.at > INDEX_AGE_MS) {
    try {
      const repo = pcmPackagesOf(new TextDecoder().decode(await fetchAllowed(PCM_REPOSITORY)));
      const list = await fetchAllowed(repo.url);
      if (repo.sha256) await checkSha256(list, repo.sha256, 'the PCM\'s packages list');
      pcmLibraries(new TextDecoder().decode(list));   // (read before it is kept)
      await writeCache('packages-v1.json', list);
      bytes = list; fetched = true;
    } catch (e) {
      if (!kept) throw new Error(`the KiCad PCM's index could not be fetched: ${e.message}`);
      note = `the index kept on ${new Date(kept.at).toISOString().slice(0, 10)} (${e.message})`;
    }
  }
  return { libraries: [...OFFICIAL_LIBRARIES, ...pcmLibraries(new TextDecoder().decode(bytes))], fetched, note };
}

/**
 * One library's content, by its identifier: { library (its entry), pkg (core/kicad-pcm.js readPcmPackage's: KiCad's own
 * one file), cached (true: it was kept) }; fetched once, its SHA-256 checked, then kept.
 */
export async function openKicadLibrary(identifier, opts = {}) {
  const { libraries } = await kicadLibraries(opts);
  const lib = libraries.find((x) => x.identifier === identifier);
  if (!lib) throw new Error(`no library '${identifier}' (part_libraries lists them)`);
  const name = `${lib.sha256}.${lib.kind === 'file' ? 'kicad_sym' : 'zip'}`;
  const kept = await readCache(name);
  let bytes = kept?.bytes;
  if (!bytes) {
    bytes = await fetchAllowed(lib.url);
    await checkSha256(bytes, lib.sha256, `${lib.name} ${lib.version}`);
    await writeCache(name, bytes);
  } else await checkSha256(bytes, lib.sha256, `${lib.name} ${lib.version} (kept)`);
  const pkg = lib.kind === 'file' ? { metadata: null, symbols: [{ name: lib.library, text: new TextDecoder().decode(bytes) }], symdirs: [], footprints: [] } : await readPcmPackage(bytes, CODEC);
  return { library: lib, pkg, cached: !!kept };
}

/** Where a library comes from, as its imported symbols say it (Silinx.Source, Silinx.Author, Silinx.Licence). */
export const kicadOrigin = (lib) => ({ source: `${lib.identifier} ${lib.version} (${lib.kind === 'file' ? lib.url : 'KiCad PCM'})`, author: lib.author, licence: lib.licence });


/** What a library's symbol libraries hold (core/kicad-import.js packageContents). */
export const kicadContents = async (pkg) => (await import('../core/kicad-import.js')).packageContents(pkg);

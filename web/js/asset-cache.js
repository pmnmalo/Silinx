// The browser edition's versioned assets kept in Cache Storage (#967): Yosys in WebAssembly
// (assets/vendor/yowasp-yosys/<its version>/gen/*, 16.7 MB gzipped), nextpnr in WebAssembly and its chip databases
// (assets/vendor/nextpnr-spartan/<its version>/gen|chipdb/*, #2136; the Spartan-6's in vendor/nextpnr-spartan6, #2288; the 7-series' in
// vendor/nextpnr-xc7, #3143) and the device descriptions and the bit databases (assets/<version>/devices|bitdb|bitdb/s6|bitdb/xc7/*). Their URLs name their version, so that what one holds
// never changes: they are read from the cache with no request at all. The browser's HTTP cache kept them
// 10 minutes only (GitHub Pages' max-age=600), and its revalidation downloaded Yosys again whenever the
// site had been deployed since (its ETags are the files' times of deployment: every push to main).
// - assetFetch(scope): the scope's fetch replaced by one that reads and fills the cache, for the flow
//   worker and the Yosys workers (YoWASP's bundle takes globalThis.fetch when it loads: replaced before);
//   self-contained, its text goes into the Yosys Blob workers (assetFetchSource);
// - prefetchAssets: what a device's Implement needs, fetched into the cache: in the background once the page is idle
//   after a project opened (web/js/prefetch-schedule.js, #4628), or by the first Implement, its progress in the console;
// - pruneAssetCache: the entries of this edition's other versions deleted.
// Each asset's SHA-256, which the build writes into the page (scripts/build-standalone.mjs, #1237: the layout's
// integrity, by the path under assets/; a worker's scope.SILINX_ASSET_INTEGRITY), is checked before a copy is
// kept or used: a truncated download, or an entry another page of the same site put there, is not used.
// The device descriptions and the bit databases change their path at every release (assets/<version>/), their content
// seldom: those the build gave a SHA-256 are kept under it (assetKey, #4628: <the edition's assets/>sha256/<it>/<name>), so
// that a release that did not change them finds them in the cache. Yosys and nextpnr are kept by their URL, which names
// their own version (the same at a release that did not update them).
// Where Cache Storage is not available (a page opened from a file: an opaque origin; an http page that
// is not localhost) nothing changes: the HTTP cache, as before.

export const ASSET_CACHE = 'silinx-assets';
// the versioned assets' URLs: Yosys's and nextpnr's (their version in their path: VENDOR_ASSET), an edition's device
// descriptions and bit databases (the edition's version in their path: EDITION_ASSET), and the cache's keys of the latter by
// their content (CONTENT_KEY, #4628); one pattern of all, VERSIONED_ASSET, for isVersionedAsset and assetFetch (#2792:
// assetFetch had its own, without nextpnr's)
const VENDOR = String.raw`\/vendor\/yowasp-yosys\/\d[^/]*\/gen\/[^/?#]+$|\/vendor\/nextpnr-(spartan6?|xc7)\/\d[^/]*\/(gen|chipdb)\/[^/?#]+$`;
const EDITION = String.raw`\/assets\/(\d+\.\d+\.\d+[^/]*|dev-[0-9a-f]+)\/(devices|bitdb(\/(s6|xc7))?)\/[^/?#]+$`;
const CONTENT = String.raw`\/assets\/sha256\/[A-Za-z0-9_-]{43}\/[^/?#]+$`;
export const VENDOR_ASSET = new RegExp(VENDOR);
export const EDITION_ASSET = new RegExp(EDITION);
export const CONTENT_KEY = new RegExp(CONTENT);
export const VERSIONED_ASSET = new RegExp(`${VENDOR}|${EDITION}|${CONTENT}`);
/** Is url one of the versioned assets (its content never changes)? */
export const isVersionedAsset = url => VERSIONED_ASSET.test(String(url));

/** The key in the cache of an asset of url whose SHA-256 the build gave as want ('sha256-<base64>'): an edition's device
 *  description or bit database by its content (<the edition's assets/>sha256/<base64url>/<name>, #4628), any other by its URL.
 *  Self-contained: assetFetch's (in the Yosys Blob workers too). */
export function assetKey(url, want) {
  if (!want || !/\/assets\/(\d+\.\d+\.\d+[^/]*|dev-[0-9a-f]+)\/(devices|bitdb(\/(s6|xc7))?)\/[^/?#]+$/.test(url)) return url;
  const hash = want.slice(7).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${url.slice(0, url.lastIndexOf('/assets/') + 8)}sha256/${hash}/${url.slice(url.lastIndexOf('/') + 1)}`;
}

/** The scope's fetch reads the versioned assets from Cache Storage, and puts there those it fetches. Returns
 *  whether it replaced it. Self-contained: assetFetchSource writes its text into the Yosys Blob workers, with the pattern
 *  and the key as literals (their defaults, VERSIONED_ASSET and assetKey, are not in a worker's scope). */
export function assetFetch(scope = globalThis, name = 'silinx-assets', pattern = VERSIONED_ASSET, keyOf = assetKey) {
  const net = scope.fetch;
  if (typeof net !== 'function' || net.assetCache) return false;
  const versioned = url => pattern.test(url);
  const open = () => { try { return scope.caches ? scope.caches.open(name) : null; } catch { return null; } };   // (an opaque origin throws)
  // the SHA-256 the build wrote for url (none: not checked), and a response's body checked against it (null: it differs)
  const expected = url => { const i = url.lastIndexOf('/assets/'); return i >= 0 ? scope.SILINX_ASSET_INTEGRITY?.[url.slice(i + 8)] : undefined; };
  const checked = async (res, want) => {
    const buf = await res.arrayBuffer();
    let bin = '';
    for (const b of new Uint8Array(await scope.crypto.subtle.digest('SHA-256', buf))) bin += String.fromCharCode(b);
    return `sha256-${scope.btoa(bin)}` === want ? new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers }) : null;
  };
  const cached = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!url || !versioned(url) || (init?.method && init.method !== 'GET')) return net.call(scope, input, init);
    const want = expected(url), key = keyOf(url, want);
    let cache = null;
    try {
      cache = await open();
      const hit = cache && await cache.match(key);
      if (hit && !want) return hit;
      const ok = hit && await checked(hit, want);
      if (ok) return ok;
      if (hit) await cache.delete(key);   // (not the asset: fetched again)
    } catch { cache = null; }
    const res = await net.call(scope, input, init);
    if (!cache || !res.ok || res.status !== 200) return res;
    // (kept as it is read: the copy goes into the cache while the caller reads the response; a full disk keeps nothing)
    if (!want) { cache.put(key, res.clone()).catch(() => {}); return res; }
    // checked first: kept only when it is the asset (a download that differs is given as it came, not kept)
    const copy = res.clone(), ok = await checked(res, want);
    if (ok) { cache.put(key, ok.clone()).catch(() => {}); return ok; }
    return copy;
  };
  cached.assetCache = true;
  scope.fetch = cached;
  return true;
}

/** The code that installs assetFetch in a worker, for the front of a Yosys Blob worker's code (packages/silinx-fpga/src/synth-open.js
 *  yosysWorkerSource): run before its import of YoWASP's bundle. */
export const assetFetchSource = (integrity = globalThis.SILINX_ASSET_INTEGRITY) =>
  `self.SILINX_ASSET_INTEGRITY = ${JSON.stringify(integrity || null)};\n(${assetFetch})(self, ${JSON.stringify(ASSET_CACHE)}, ${VERSIONED_ASSET}, ${assetKey});\n`;

const cacheOf = async (scope = globalThis) => { try { return scope.caches ? await scope.caches.open(ASSET_CACHE) : null; } catch { return null; } };

/** The SHA-256 the build gave the asset of url (by its path under assets/), undefined where it gave none. */
const integrityOf = (url, scope = globalThis) => { const i = url.lastIndexOf('/assets/'); return i >= 0 ? scope.SILINX_ASSET_INTEGRITY?.[url.slice(i + 8)] : undefined; };
/** 'sha256-<base64>' of bytes, as the build writes it (scripts/build-standalone.mjs). */
export async function assetDigest(buf, scope = globalThis) {
  let bin = '';
  for (const b of new Uint8Array(await scope.crypto.subtle.digest('SHA-256', buf))) bin += String.fromCharCode(b);
  return `sha256-${scope.btoa(bin)}`;
}

/** Is url in the cache (under its key)? (false where there is no cache) */
export async function assetCached(url, scope = globalThis) {
  url = String(url);
  try { return !!await (await cacheOf(scope))?.match(assetKey(url, integrityOf(url, scope))); } catch { return false; }
}

/** The files of Yosys's bundle (YoWASP's gen/): what its first run fetches. */
export const YOSYS_FILES = ['bundle.js', 'yosys.core.wasm', 'yosys.core2.wasm', 'yosys.core3.wasm', 'yosys.core4.wasm', 'yosys-resources.0.tar'];

/** The files of nextpnr's bundle of a micro-architecture (its gen/, #2136; 'spartan6', #2288; 'xilinx', the 7-series', #3143) and a device's chip database
 *  beside it: what its first run fetches. */
export const nextpnrFiles = (uarch = 'spartan3e') => ['bundle.js', ...['', '2', '3', '4'].map(n => `nextpnr-himbaechel-${uarch}.core${n}.wasm`),
  `nextpnr-himbaechel-${uarch}-resources.0.tar`];
export const NEXTPNR_FILES = nextpnrFiles('spartan3e');
export const nextpnrChipdb = device => `../chipdb/chipdb-${device}.bin.gz`;

/** A metered or slow connection (Save-Data, 2G/3G, a cellular one): no download in the background (#967, #4628). */
export function meteredConnection(nav = globalThis.navigator) {
  const conn = nav?.connection;
  return !!(conn?.saveData || /(^|-)[23]g$/.test(conn?.effectiveType || '') || conn?.type === 'cellular');
}

/**
 * Fetch urls into the cache, one at a time, those it holds skipped: { fetched, bytes } (bytes: as read, decompressed).
 * Nothing without a cache, nor, but when force (an Implement's: the user asked), on a metered or slow connection.
 * onProgress(bytes) as each part of a body comes. A failure stops quietly (the run fetches them).
 */
export async function prefetchAssets(urls, { scope = globalThis, fetchFn = scope.fetch?.bind(scope), force = false, onProgress = () => {} } = {}) {
  const out = { fetched: 0, bytes: 0 };
  if (!force && meteredConnection(scope.navigator)) return out;
  const cache = await cacheOf(scope);
  if (!cache || !fetchFn) return out;
  for (const url of urls.map(String)) {
    const want = integrityOf(url, scope), key = assetKey(url, want);
    try {
      if (await cache.match(key)) continue;
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const buf = await bodyOf(res, onProgress);
      // (checked against the build's SHA-256: not the asset, not kept, the run fetches it)
      if (want && await assetDigest(buf, scope) !== want) continue;
      await cache.put(key, new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers }));
      out.fetched++; out.bytes += buf.byteLength;
    } catch { break; }
  }
  return out;
}
// a response's body, its parts counted as they come
async function bodyOf(res, onProgress) {
  if (!res.body?.getReader) { const buf = await res.arrayBuffer(); onProgress(buf.byteLength); return buf; }
  const reader = res.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.byteLength;
    onProgress(value.byteLength);
  }
  const buf = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { buf.set(p, at); at += p.byteLength; }
  return buf.buffer;
}

/** Delete the cached versioned assets under root (this edition's assets/) that this version no longer uses: those by their
 *  URL not under one of the keep prefixes (this version's), those by their content (#4628) whose SHA-256 is not one of this
 *  version's (none deleted where the page has no SHA-256), and, where it has them, an edition's files kept by their URL (by
 *  an earlier Silinx: their content's keys replace them). The other edition's (the site's dev/ beside its root) are not touched. */
export async function pruneAssetCache(root, keep, { scope = globalThis } = {}) {
  const cache = await cacheOf(scope);
  if (!cache) return 0;
  const integrity = scope.SILINX_ASSET_INTEGRITY;
  // (each one's content key's hash: assetKey's base64url)
  const hashes = integrity ? new Set(Object.values(integrity).map(w => w.slice(7).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))) : null;
  let n = 0;
  for (const req of await cache.keys()) {
    const u = req.url;
    if (!u.startsWith(root) || !isVersionedAsset(u)) continue;
    const stale = CONTENT_KEY.test(u) ? !!hashes && !hashes.has(u.split('/').at(-2))
      : EDITION_ASSET.test(u) && hashes ? true : !keep.some(k => u.startsWith(k));
    if (stale && await cache.delete(req)) n++;
  }
  return n;
}

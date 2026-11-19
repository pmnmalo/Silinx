// The browser edition's versioned assets in Cache Storage (web/js/asset-cache.js, #967), with a fake
// Cache Storage and a fake network: what is versioned, a hit read with no request, a miss fetched and
// kept, what is never kept (other URLs, other methods, failures), no cache at all (an opaque origin),
// the fetch in a Yosys Blob worker's code, the prefetch (once, not with Save-Data or on 3G) and the
// pruning of the other versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSIONED_ASSET, isVersionedAsset, assetFetch, assetFetchSource, assetCached, prefetchAssets, pruneAssetCache, assetDigest, assetKey, meteredConnection, VENDOR_ASSET, EDITION_ASSET, CONTENT_KEY, ASSET_CACHE, YOSYS_FILES, NEXTPNR_FILES, nextpnrFiles, nextpnrChipdb } from '../web/js/asset-cache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SITE = 'https://pmnmalo.github.io/Silinx/';
const WASM = `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/yosys.core.wasm`;
const GRAPH = `${SITE}assets/15.12.0/devices/xc3s250ecp132-4.json.gz`;

class FakeCache {
  constructor() { this.map = new Map(); this.puts = []; }
  async match(url) { const r = this.map.get(String(url)); return r ? r.clone() : undefined; }
  async put(url, res) { this.puts.push(String(url)); this.map.set(String(url), new Response(await res.arrayBuffer(), { status: res.status, headers: res.headers })); }
  async keys() { return [...this.map.keys()].map(url => ({ url })); }
  async delete(req) { return this.map.delete(typeof req === 'string' ? req : req.url); }
}
/** A scope (a worker's self) with a fake network and a fake Cache Storage (caches: false, none; 'throws': an opaque origin's). */
function scope({ caches = true, status = 200 } = {}) {
  const cache = new FakeCache(), requests = [];
  const s = {
    requests, cache, crypto: globalThis.crypto, btoa: globalThis.btoa,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input.href || input.url;
      requests.push([url, init?.method || 'GET']);
      return new Response(`body of ${url}`, { status, headers: { 'content-length': String(`body of ${url}`.length) } });
    },
  };
  if (caches === 'throws') Object.defineProperty(s, 'caches', { get() { throw new Error('SecurityError: opaque origin'); } });
  else if (caches) s.caches = { open: async name => { assert.equal(name, ASSET_CACHE); return cache; } };
  return s;
}
const settle = () => new Promise(r => setTimeout(r, 10));

test('#967 the versioned assets: Yosys and nextpnr (#2136) of a version, a version\'s (or a development build\'s) device descriptions and bit database', () => {
  for (const u of [WASM, `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`, GRAPH, `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`,
    `${SITE}dev/assets/dev-770bf18/devices/xc3s500efg320-4.json.gz`, `${SITE}dev/assets/vendor/yowasp-yosys/0.71.3/gen/yosys-resources.0.tar`,
    // nextpnr's bundle and its chip databases (#2136)
    `${SITE}assets/vendor/nextpnr-spartan/0.11.2/gen/bundle.js`, `${SITE}assets/vendor/nextpnr-spartan/0.11.2/gen/nextpnr-himbaechel-spartan3e.core.wasm`,
    `${SITE}dev/assets/vendor/nextpnr-spartan/0.11.2/chipdb/chipdb-xc3s250e.bin.gz`,
    // the Spartan-6's, a folder of their own (#2288)
    `${SITE}assets/vendor/nextpnr-spartan6/0.1.1/gen/nextpnr-himbaechel-spartan6.core.wasm`, `${SITE}dev/assets/vendor/nextpnr-spartan6/0.1.1/chipdb/chipdb-xc6slx45.bin.gz`,
    // the Spartan-6's bit databases, a folder of their own (#2103)
    `${SITE}assets/15.12.0/bitdb/s6/xc6slx16-lut.json`, `${SITE}dev/assets/dev-770bf18/bitdb/s6/s6-pips-flow.json`,
    // the 7-series' nextpnr, its chip databases and its bit databases, folders of their own (#3143)
    `${SITE}assets/vendor/nextpnr-xc7/0.1.1/gen/nextpnr-himbaechel-xilinx.core.wasm`, `${SITE}dev/assets/vendor/nextpnr-xc7/0.1.1/chipdb/chipdb-xc7a50t.bin.gz`,
    `${SITE}assets/15.12.0/bitdb/xc7/xc7a35tcpg236-1.json.gz`, `${SITE}dev/assets/dev-770bf18/bitdb/xc7/xc7a100tcsg324-1.json.gz`])
    assert.equal(isVersionedAsset(u), true, u);
  // unversioned: the local server's Yosys and the tests' assets, the page, version.json; a folder; a query
  for (const u of ['http://127.0.0.1:8/vendor/yowasp-yosys/gen/yosys.core.wasm', 'http://127.0.0.1:8/vendor/nextpnr-spartan/gen/bundle.js', `${SITE}assets/vendor/nextpnr-spartan/0.11.2/package.json`, `${SITE}assets/vendor/nextpnr-spartan6/0.1.1/package.json`, `${SITE}assets/vendor/nextpnr-spartan7/0.1.1/gen/bundle.js`, 'http://127.0.0.1:8/vendor/nextpnr-spartan6/gen/bundle.js', 'http://127.0.0.1:8/assets/devices/xc3s250ecp132-4.json.gz', SITE, `${SITE}version.json`,
    `${SITE}assets/15.12.0/devices/`, `${SITE}assets/15.12.0/bitdb/s6/`, `${SITE}assets/15.12.0/bitdb/x6/a.json`, `${GRAPH}?x=1`, `${SITE}assets/latest/devices/a.json.gz`,
    // (#3143: the 7-series' unversioned, its package.json, a folder)
    'http://127.0.0.1:8/vendor/nextpnr-xc7/gen/bundle.js', `${SITE}assets/vendor/nextpnr-xc7/0.1.1/package.json`, `${SITE}assets/15.12.0/bitdb/xc7/`, `${SITE}assets/vendor/nextpnr-xc8/0.1.1/gen/bundle.js`])
    assert.equal(isVersionedAsset(u), false, u);
});

// nextpnr's bundles and chip databases (#2136, the Spartan-6's #2288), as the flow worker's prepare fetches them
const NEXTPNR = [`${SITE}assets/vendor/nextpnr-spartan/0.11.2/gen/`, `${SITE}dev/assets/vendor/nextpnr-spartan6/0.1.3/gen/`];
const NEXTPNR_URLS = [...nextpnrFiles('spartan3e').map(f => new URL(f, NEXTPNR[0]).href), new URL(nextpnrChipdb('xc3s250e'), NEXTPNR[0]).href,
  ...nextpnrFiles('spartan6').map(f => new URL(f, NEXTPNR[1]).href), new URL(nextpnrChipdb('xc6slx45'), NEXTPNR[1]).href];

test('#2792 assetFetch reads nextpnr\'s files (both bundles, their chip databases) from the cache: prefetched, then no request; in a Yosys worker\'s code too', async () => {
  for (const install of [s => assetFetch(s), s => new Function('self', assetFetchSource())(s)]) {
    const s = scope();
    assert.deepEqual(await prefetchAssets(NEXTPNR_URLS, { scope: s }), { fetched: NEXTPNR_URLS.length, bytes: NEXTPNR_URLS.reduce((n, u) => n + `body of ${u}`.length, 0) });
    s.requests.length = 0;
    install(s);
    for (const u of NEXTPNR_URLS) {
      assert.equal(isVersionedAsset(u), true, u);
      assert.equal(await (await s.fetch(u)).text(), `body of ${u}`);
    }
    assert.deepEqual(s.requests, [], 'every one from the cache');
    // and a miss is kept: the next run reads it with no request
    const fresh = scope();
    install(fresh);
    for (const u of NEXTPNR_URLS) await (await fresh.fetch(u)).text();
    await settle();
    assert.deepEqual(fresh.cache.puts, NEXTPNR_URLS);
    for (const u of NEXTPNR_URLS) await fresh.fetch(u);
    assert.equal(fresh.requests.length, NEXTPNR_URLS.length);
  }
});

test('#2792 assetFetch and isVersionedAsset agree: one pattern (VERSIONED_ASSET), the worker\'s code carries it', async () => {
  const urls = [WASM, GRAPH, ...NEXTPNR_URLS, `${SITE}assets/15.12.0/bitdb/s6/xc6slx16-lut.json`, `${SITE}version.json`, `${GRAPH}?x=1`,
    'http://127.0.0.1:8/vendor/nextpnr-spartan/gen/bundle.js', `${SITE}assets/vendor/nextpnr-spartan7/0.1.1/gen/bundle.js`];
  const s = scope();
  assetFetch(s);
  for (const u of urls) { await (await s.fetch(u)).text(); await s.fetch(u); }
  await settle();
  assert.deepEqual(s.cache.puts, urls.filter(isVersionedAsset));
  assert.equal(s.requests.length, urls.filter(isVersionedAsset).length + 2 * urls.filter(u => !isVersionedAsset(u)).length);
  assert.ok(assetFetchSource().includes(String(VERSIONED_ASSET)));
});

test('#967 assetFetch: a miss is fetched and kept, the next fetch of it reads the cache with no request', async () => {
  const s = scope();
  assert.equal(assetFetch(s), true);
  assert.equal(assetFetch(s), false, 'installed once');
  const a = await s.fetch(WASM);
  assert.equal(await a.text(), `body of ${WASM}`);
  await settle();
  assert.deepEqual(s.cache.puts, [WASM]);
  const b = await s.fetch(new URL(WASM));
  assert.equal(await b.text(), `body of ${WASM}`);
  assert.deepEqual(s.requests, [[WASM, 'GET']], 'the second from the cache');
  assert.equal(await assetCached(WASM, s), true);
  assert.equal(await assetCached(GRAPH, s), false);
});

test('#967 assetFetch: other URLs and methods go to the network, never kept; a failed response is not kept', async () => {
  const s = scope();
  assetFetch(s);
  await s.fetch(`${SITE}version.json`);
  await s.fetch(`${SITE}version.json`);
  await s.fetch(GRAPH, { method: 'POST' });
  assert.equal(s.requests.length, 3);
  const bad = scope({ status: 404 });
  assetFetch(bad);
  assert.equal((await bad.fetch(GRAPH)).status, 404);
  await bad.fetch(GRAPH);
  await settle();
  assert.deepEqual(bad.cache.puts, []);
  assert.equal(bad.requests.length, 2);
});

test('#967 assetFetch with no Cache Storage (none, or an opaque origin\'s that throws: a page opened from a file): the network, as before', async () => {
  for (const caches of [false, 'throws']) {
    const s = scope({ caches });
    assetFetch(s);
    assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
    await s.fetch(WASM);
    assert.equal(s.requests.length, 2, String(caches));
    assert.equal(await assetCached(WASM, s), false);
    assert.deepEqual(await prefetchAssets([WASM], { scope: s }), { fetched: 0, bytes: 0 });
    assert.equal(await pruneAssetCache(`${SITE}assets/`, [], { scope: s }), 0);
  }
});

test('#967 assetFetchSource: the code at the front of a Yosys Blob worker installs the cache on its self, before Yosys loads', async () => {
  const s = scope();
  const src = assetFetchSource();
  new Function('self', src)(s);   // (the worker's code, its global self)
  assert.equal(s.fetch.assetCache, true);
  await (await s.fetch(WASM)).text();
  await settle();
  await s.fetch(WASM);
  assert.equal(s.requests.length, 1);
});

test('#967 prefetchAssets: what is not cached yet, one at a time; not with Save-Data or on a 2G/3G connection; a network failure stops it', async () => {
  const s = scope();
  const urls = [GRAPH, ...YOSYS_FILES.map(f => new URL(f, WASM).href)];
  const r = await prefetchAssets(urls, { scope: s });
  assert.equal(r.fetched, urls.length);
  assert.equal(r.bytes, urls.reduce((n, u) => n + `body of ${u}`.length, 0));
  assert.deepEqual(s.cache.puts, urls);
  assert.deepEqual(await prefetchAssets(urls, { scope: s }), { fetched: 0, bytes: 0 }, 'all there: nothing fetched');
  assert.equal(s.requests.length, urls.length);
  for (const connection of [{ saveData: true }, { effectiveType: '3g' }, { effectiveType: 'slow-2g' }]) {
    const t = scope();
    t.navigator = { connection };
    assert.deepEqual(await prefetchAssets(urls, { scope: t }), { fetched: 0, bytes: 0 }, JSON.stringify(connection));
    assert.equal(t.requests.length, 0);
  }
  const ok4g = scope();
  ok4g.navigator = { connection: { effectiveType: '4g' } };
  assert.equal((await prefetchAssets([GRAPH], { scope: ok4g })).fetched, 1);
  const off = scope();
  let n = 0;
  const r2 = await prefetchAssets(urls, { scope: off, fetchFn: async u => { if (++n === 2) throw new TypeError('Failed to fetch'); return off.fetch(u); } });
  assert.deepEqual(r2, { fetched: 1, bytes: `body of ${GRAPH}`.length });
  assert.equal(n, 2, 'stopped at the failure');
});

test('#967 pruneAssetCache: this edition\'s other versions deleted; this version\'s, the other edition\'s and unversioned entries kept', async () => {
  const s = scope();
  const keep = [`${SITE}assets/15.13.0/`, `${SITE}assets/vendor/yowasp-yosys/0.71.0/gen/`];
  const urls = {
    old: [`${SITE}assets/15.12.0/devices/a.json.gz`, `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`, `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/yosys.core.wasm`],
    kept: [`${SITE}assets/15.13.0/devices/a.json.gz`, `${SITE}assets/vendor/yowasp-yosys/0.71.0/gen/yosys.core.wasm`,
      `${SITE}dev/assets/dev-770bf18/devices/a.json.gz`, `${SITE}dev/assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`, `${SITE}assets/other.json`],
  };
  for (const u of [...urls.old, ...urls.kept]) s.cache.map.set(u, new Response('x'));
  assert.equal(await pruneAssetCache(`${SITE}assets/`, keep, { scope: s }), urls.old.length);
  assert.deepEqual([...s.cache.map.keys()].sort(), [...urls.kept].sort());
  // the development edition's own: its older builds go, the stable edition's stay
  assert.equal(await pruneAssetCache(`${SITE}dev/assets/`, [`${SITE}dev/assets/dev-abc1234/`, `${SITE}dev/assets/vendor/yowasp-yosys/0.70.1258/gen/`], { scope: s }), 1);
  assert.equal(s.cache.map.has(`${SITE}assets/15.13.0/devices/a.json.gz`), true);
});

// #1237: each asset's SHA-256 (the build's, by its path under assets/), as Node computes it
const sha = text => `sha256-${crypto.createHash('sha256').update(text).digest('base64')}`;
const key = url => url.slice(url.lastIndexOf('/assets/') + 8);

test('#1237 assetDigest: the SHA-256 the build writes (base64, sha256- prefix)', async () => {
  assert.equal(await assetDigest(new TextEncoder().encode('abc')), sha('abc'));
  assert.equal(await assetDigest(new ArrayBuffer(0)), sha(''));
});

test('#1237 assetFetch with the assets\' SHA-256: a good copy used, a copy that differs dropped and fetched again, a download that differs not kept', async () => {
  const s = scope();
  s.SILINX_ASSET_INTEGRITY = { [key(WASM)]: sha(`body of ${WASM}`), [key(GRAPH)]: sha('the real graph') };
  assetFetch(s);
  // a download that is the asset: kept, then read from the cache with no request
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  await settle();
  assert.deepEqual(s.cache.puts, [WASM]);
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  assert.equal(s.requests.length, 1);
  // a cached copy that differs (truncated, or put there by another page of the site): dropped, fetched again, kept anew
  s.cache.map.set(WASM, new Response('poisoned', { status: 200 }));
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  await settle();
  assert.equal(s.requests.length, 2);
  assert.equal(await (await s.cache.match(WASM)).text(), `body of ${WASM}`);
  // a download that differs from the build's: given as it came (the run says what fails), never kept
  assert.equal(await (await s.fetch(GRAPH)).text(), `body of ${GRAPH}`);
  await settle();
  assert.equal(await assetCached(GRAPH, s), false);
  await s.fetch(GRAPH);
  assert.equal(s.requests.length, 4, 'fetched again each time');
  // an asset the build gave no SHA-256 (a test's, the local server's): as before, kept unchecked
  const other = `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`;
  s.cache.map.set(other, new Response('anything'));
  assert.equal(await (await s.fetch(other)).text(), 'anything');
});

test('#1237 prefetchAssets with the assets\' SHA-256: a download that differs is not kept', async () => {
  const s = scope();
  s.SILINX_ASSET_INTEGRITY = { [key(GRAPH)]: sha(`body of ${GRAPH}`), [key(WASM)]: sha('not what the network says') };
  const r = await prefetchAssets([GRAPH, WASM], { scope: s });
  assert.deepEqual(r, { fetched: 1, bytes: `body of ${GRAPH}`.length });
  // (kept by its content, #4628)
  assert.deepEqual(s.cache.puts, [assetKey(GRAPH, sha(`body of ${GRAPH}`))]);
  assert.equal(await (await s.cache.match(assetKey(GRAPH, sha(`body of ${GRAPH}`)))).text(), `body of ${GRAPH}`);
});

test('#1237 assetFetchSource: the Yosys worker\'s code carries the SHA-256 and checks its cached copies', async () => {
  const s = scope();
  const src = assetFetchSource({ [key(WASM)]: sha(`body of ${WASM}`) });
  assert.match(src, /^self\.SILINX_ASSET_INTEGRITY = \{"vendor\/yowasp-yosys\/0\.70\.1258\/gen\/yosys\.core\.wasm":"sha256-[^"]+"\};\n/);
  new Function('self', src)(s);
  s.cache.map.set(WASM, new Response('poisoned'));
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  assert.equal(s.requests.length, 1, 'the poisoned copy not used');
  assert.match(assetFetchSource(), /^self\.SILINX_ASSET_INTEGRITY = null;\n/, 'none given: nothing checked');
});

test('#2288 nextpnrFiles: a micro-architecture\'s bundle, as its package ships it (the Spartan-3E\'s by default, NEXTPNR_FILES)', () => {
  for (const [uarch, dir] of [['spartan3e', 'nextpnr-himbaechel-spartan3e'], ['spartan6', 'nextpnr-himbaechel-spartan6'], ['xilinx', 'nextpnr-himbaechel-xc7']]) {
    const gen = fs.readdirSync(path.join(ROOT, 'node_modules/@silinx', dir, 'gen')).sort();
    assert.deepEqual([...nextpnrFiles(uarch)].sort(), gen, uarch);
  }
  assert.deepEqual(NEXTPNR_FILES, nextpnrFiles());
  assert.equal(nextpnrChipdb('xc6slx16'), '../chipdb/chipdb-xc6slx16.bin.gz');
});

// #4628: a release's assets, as the build's SHA-256 name them (by their path under assets/): the edition's device descriptions
// and bit databases under assets/<version>/, Yosys and nextpnr under their own version
const release = (dir, files) => Object.fromEntries(Object.entries(files).map(([p, body]) => [p.replace(/^~/, dir), sha(body)]));
const B64URL = /^[A-Za-z0-9_-]{43}$/;

test('#4628 assetKey: an edition\'s device descriptions and bit databases by their content (the same at every release that did not change them); Yosys, nextpnr and the files with no SHA-256 by their URL', () => {
  const want = sha('the graph');
  const k = assetKey(GRAPH, want);
  assert.equal(k, `${SITE}assets/sha256/${want.slice(7).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}/xc3s250ecp132-4.json.gz`);
  assert.match(k.split('/').at(-2), B64URL);
  assert.equal(assetKey(`${SITE}assets/15.28.0/devices/xc3s250ecp132-4.json.gz`, want), k, 'another release, the same content: the same key');
  assert.equal(assetKey(`${SITE}assets/dev-770bf18/devices/xc3s250ecp132-4.json.gz`, want), k);
  assert.notEqual(assetKey(GRAPH, sha('another graph')), k, 'another content: another key');
  // the development edition's under its own assets/
  assert.equal(assetKey(`${SITE}dev/assets/dev-770bf18/bitdb/s6/xc6slx16-lut.json`, want), `${SITE}dev/assets/sha256/${k.split('/').at(-2)}/xc6slx16-lut.json`);
  assert.equal(assetKey(`${SITE}assets/15.12.0/bitdb/xc7/xc7a35tcpg236-1.json.gz`, want), `${SITE}assets/sha256/${k.split('/').at(-2)}/xc7a35tcpg236-1.json.gz`);
  // by their URL: Yosys, nextpnr (their version in their path), a file with no SHA-256, anything else
  for (const u of [WASM, ...NEXTPNR_URLS, `${SITE}version.json`]) assert.equal(assetKey(u, want), u, u);
  assert.equal(assetKey(GRAPH, undefined), GRAPH);
  // the content's keys are versioned assets (pruneAssetCache sees them), of neither kind of URL
  assert.equal(isVersionedAsset(k), true);
  assert.deepEqual([VENDOR_ASSET.test(k), EDITION_ASSET.test(k), CONTENT_KEY.test(k)], [false, false, true]);
  assert.deepEqual([VENDOR_ASSET.test(WASM), EDITION_ASSET.test(WASM), CONTENT_KEY.test(WASM)], [true, false, false]);
  assert.deepEqual([VENDOR_ASSET.test(GRAPH), EDITION_ASSET.test(GRAPH), CONTENT_KEY.test(GRAPH)], [false, true, false]);
  for (const bad of [`${SITE}assets/sha256/short/a.json`, `${SITE}assets/sha256/${'A'.repeat(43)}/`, `${SITE}sha256/${'A'.repeat(43)}/a.json`]) assert.equal(isVersionedAsset(bad), false, bad);
});

test('#4628 a release: an unchanged Yosys and nextpnr, and the device descriptions and bit databases it did not change, kept in the cache; a changed file replaced; prune deletes what it no longer uses', async () => {
  const root = `${SITE}assets/`;
  const yosys = `${root}vendor/yowasp-yosys/0.70.1258/gen/`, chipdb = `${root}vendor/nextpnr-spartan/1.5.2/chipdb/chipdb-xc3s250e.bin.gz`;
  // the bodies the network serves, by the path under assets/ (no version: the edition's files keep their content across releases unless changed)
  const bodies = { 'devices/a.json.gz': 'graph v1', 'bitdb/t.json': 'tiles v1' };
  const s = scope();
  s.fetch = async (input) => {
    const url = String(input), p = url.slice(url.lastIndexOf('/assets/') + 8).replace(/^(\d+\.\d+\.\d+|dev-[0-9a-f]+)\//, '');
    s.requests.push([url, 'GET']);
    const body = bodies[p] ?? `body of ${url}`;
    return new Response(body, { status: 200 });
  };
  const yosysFiles = Object.fromEntries(YOSYS_FILES.map(f => [`vendor/yowasp-yosys/0.70.1258/gen/${f}`, sha(`body of ${yosys}${f}`)]));
  const urlsOf = dir => [`${root}${dir}devices/a.json.gz`, `${root}${dir}bitdb/t.json`, ...YOSYS_FILES.map(f => yosys + f), chipdb];
  const keepOf = dir => [`${root}${dir}`, yosys, `${root}vendor/nextpnr-spartan/1.5.2/`];
  // version A, prefetched
  s.SILINX_ASSET_INTEGRITY = { ...release('15.27.0/', { '~devices/a.json.gz': 'graph v1', '~bitdb/t.json': 'tiles v1' }), ...yosysFiles, 'vendor/nextpnr-spartan/1.5.2/chipdb/chipdb-xc3s250e.bin.gz': sha(`body of ${chipdb}`) };
  assert.equal((await prefetchAssets(urlsOf('15.27.0/'), { scope: s })).fetched, 9);
  const before = [...s.cache.map.keys()].sort();
  // release B: the same Yosys and nextpnr, the device description unchanged, the bit database changed
  bodies['bitdb/t.json'] = 'tiles v2';
  s.SILINX_ASSET_INTEGRITY = { ...release('15.28.0/', { '~devices/a.json.gz': 'graph v1', '~bitdb/t.json': 'tiles v2' }), ...yosysFiles, 'vendor/nextpnr-spartan/1.5.2/chipdb/chipdb-xc3s250e.bin.gz': sha(`body of ${chipdb}`) };
  assert.equal(await pruneAssetCache(root, keepOf('15.28.0/'), { scope: s }), 1, 'the old bit database only');
  assert.equal(s.cache.map.has(assetKey(`${root}15.27.0/bitdb/t.json`, sha('tiles v1'))), false);
  s.requests.length = 0;
  assert.deepEqual(await prefetchAssets(urlsOf('15.28.0/'), { scope: s }), { fetched: 1, bytes: 'tiles v2'.length });
  assert.deepEqual(s.requests.map(([u]) => u), [`${root}15.28.0/bitdb/t.json`], 'only the changed file downloaded again');
  assert.deepEqual([...s.cache.map.keys()].sort(), [...before.filter(k => !k.endsWith('/t.json')), assetKey(`${root}15.28.0/bitdb/t.json`, sha('tiles v2'))].sort());
  // and the flow's own fetches read them with no request: the unchanged device description of A's download under B's URL
  assetFetch(s);
  s.requests.length = 0;
  assert.equal(await (await s.fetch(`${root}15.28.0/devices/a.json.gz`)).text(), 'graph v1');
  assert.equal(await (await s.fetch(`${root}15.28.0/bitdb/t.json`)).text(), 'tiles v2');
  assert.equal(await (await s.fetch(`${yosys}yosys.core.wasm`)).text(), `body of ${yosys}yosys.core.wasm`);
  assert.deepEqual(s.requests, []);
  // release C, with a new Yosys: the old one's files pruned, nextpnr's kept
  s.SILINX_ASSET_INTEGRITY = release('15.29.0/', { '~devices/a.json.gz': 'graph v1', '~bitdb/t.json': 'tiles v2' });
  assert.equal(await pruneAssetCache(root, [`${root}15.29.0/`, `${root}vendor/yowasp-yosys/0.71.0/gen/`, `${root}vendor/nextpnr-spartan/1.5.2/`], { scope: s }), YOSYS_FILES.length);
  assert.deepEqual([...s.cache.map.keys()].sort(), [assetKey(`${root}15.29.0/devices/a.json.gz`, sha('graph v1')), assetKey(`${root}15.29.0/bitdb/t.json`, sha('tiles v2')), chipdb].sort());
});

test('#4628 pruneAssetCache: the edition\'s files an earlier Silinx kept by their URL deleted (their content\'s keys replace them); with no SHA-256 in the page, the content\'s keys kept and the URLs pruned as before', async () => {
  const root = `${SITE}assets/`, keep = [`${root}15.28.0/`, `${root}vendor/yowasp-yosys/0.70.1258/gen/`];
  const s = scope();
  const own = `${root}15.28.0/devices/a.json.gz`, content = assetKey(own, sha('graph')), other = assetKey(own, sha('old graph'));
  const devEd = assetKey(`${SITE}dev/assets/dev-abc1234/devices/a.json.gz`, sha('old graph'));
  for (const u of [own, content, other, devEd, WASM]) s.cache.map.set(u, new Response('x'));
  const t = scope();
  for (const u of [own, content, other, devEd, WASM]) t.cache.map.set(u, new Response('x'));
  // with the page's SHA-256: this version's own file by its URL and the other content deleted
  s.SILINX_ASSET_INTEGRITY = { '15.28.0/devices/a.json.gz': sha('graph') };
  assert.equal(await pruneAssetCache(root, keep, { scope: s }), 2);
  assert.deepEqual([...s.cache.map.keys()].sort(), [content, devEd, WASM].sort());
  // with none (a development page served unbuilt): nothing known of the contents, kept
  assert.equal(await pruneAssetCache(root, keep, { scope: t }), 0);
});

test('#4628 assetFetch by the content\'s key: a corrupt entry is never used (dropped, fetched again, kept anew); in a Yosys worker\'s code the same key', async () => {
  const s = scope();
  s.SILINX_ASSET_INTEGRITY = { [key(GRAPH)]: sha(`body of ${GRAPH}`) };
  const k = assetKey(GRAPH, sha(`body of ${GRAPH}`));
  s.cache.map.set(k, new Response('truncated'));
  assetFetch(s);
  assert.equal(await (await s.fetch(GRAPH)).text(), `body of ${GRAPH}`);
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(await (await s.cache.match(k)).text(), `body of ${GRAPH}`);
  assert.equal(s.cache.map.has(GRAPH), false, 'not by its URL');
  assert.equal(await assetCached(GRAPH, s), true);
  // the worker's code: the same function, its key's too
  const w = scope();
  new Function('self', assetFetchSource({ [key(GRAPH)]: sha(`body of ${GRAPH}`) }))(w);
  await (await w.fetch(GRAPH)).text();
  await settle();
  assert.deepEqual(w.cache.puts, [k]);
});

test('#4628 prefetchAssets: its progress as the bodies come; a metered or slow connection only when forced (the first Implement\'s)', async () => {
  const urls = [GRAPH, WASM];
  const s = scope(), seen = [];
  s.fetch = async (input) => {
    const url = String(input);
    s.requests.push([url, 'GET']);
    const parts = [`part 1 of ${url} `, `part 2 of ${url}`];
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); } }), { status: 200 });
  };
  const r = await prefetchAssets(urls, { scope: s, onProgress: n => seen.push(n) });
  const lengths = urls.flatMap(u => [`part 1 of ${u} `.length, `part 2 of ${u}`.length]);
  assert.deepEqual(seen, lengths);
  assert.deepEqual(r, { fetched: 2, bytes: lengths.reduce((a, b) => a + b) });
  assert.equal(await (await s.cache.match(WASM)).text(), `part 1 of ${WASM} part 2 of ${WASM}`);
  for (const connection of [{ saveData: true }, { effectiveType: '3g' }, { effectiveType: '2g' }, { type: 'cellular', effectiveType: '4g' }]) {
    assert.equal(meteredConnection({ connection }), true, JSON.stringify(connection));
    const t = scope();
    t.navigator = { connection };
    assert.deepEqual(await prefetchAssets(urls, { scope: t }), { fetched: 0, bytes: 0 });
    assert.equal((await prefetchAssets(urls, { scope: t, force: true })).fetched, 2, 'forced');
  }
  for (const nav of [{ connection: { effectiveType: '4g', type: 'wifi' } }, {}, undefined]) assert.equal(meteredConnection(nav), false, JSON.stringify(nav));
});

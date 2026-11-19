// What the browser edition's service worker (web/js/sw.js, #1051) does with a request, as pure functions
// (test/pwa.test.js). The worker's scope is the edition's folder on the site: the stable edition's root
// or dev/ (each its own worker, its own app once installed).
// - 'page': the page (a navigation to the folder or its index.html): the network first, the copy kept for
//   when there is none;
// - 'shell': the manifest and the icons, kept by this build's worker;
// - 'asset': Yosys's and nextpnr's files (web/js/asset-cache.js VENDOR_ASSET, #967), read from their cache: their bundles,
//   which the workers import (an import is not a fetch: assetFetch does not see it), offline too; an edition's device
//   descriptions and bit databases are not (#4628): the flow worker's assetFetch keeps them by their content, a copy by
//   their URL here would be a second one;
// - 'network': everything else, not intercepted (version.json, GitHub's API, the usage counter, the
//   downloaded Silinx.html, the root's dev/: the development edition's own worker).
import { VENDOR_ASSET } from './asset-cache.js';

/** The files the worker keeps beside the page (the site's, scripts/pwa.mjs). */
export const SHELL = ['manifest.webmanifest', 'icons/silinx-192.png', 'icons/silinx-512.png', 'icons/silinx-maskable-512.png'];

/** The worker's cache for an edition (its scope) and a build (its label): the page and SHELL. */
export const pageCacheName = (scope, label) => `silinx-page ${scope} ${label}`;

/** How the worker of scope answers request ({ url, method, mode }): 'page' | 'shell' | 'asset' | 'network'. */
export function route({ url, method = 'GET', mode } = {}, scope) {
  if (method !== 'GET' || !url || !scope || !url.startsWith(scope)) return 'network';
  const rel = url.slice(scope.length).replace(/[?#].*$/, '');
  if (rel.startsWith('dev/')) return 'network';
  if (VENDOR_ASSET.test(url)) return 'asset';
  if (rel === '' || rel === 'index.html') return mode === 'navigate' ? 'page' : 'network';
  return SHELL.includes(rel) ? 'shell' : 'network';
}

/** The caches an update left: this edition's other builds' (another edition's are not touched). */
export const staleCaches = (names, scope, current) => names.filter(n => n.startsWith(`silinx-page ${scope} `) && n !== current);

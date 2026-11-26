// Silinx - the page cross-origin isolated (#5648, part of #5495): the headers that make it so (COOP and COEP), which the
// local server sends with every response (server/server.js) and the browser edition's service worker adds to the page it
// serves (web/js/sw.js: GitHub Pages sends no headers of its own; the page is isolated from its next load on: never
// reloaded under the user's work), and why a page is not isolated. Isolated, a page has
// SharedArrayBuffer and Atomics.wait in its workers: an ESP32 node's Worker + Atomics back end (#5495) needs them.
// What the app loads from other origins is CORS (GitHub's API, raw.githubusercontent.com, npm's registry, the trackers:
// fetch), WebSockets (the relay) and WebRTC: none of them is refused by require-corp; its CSP keeps scripts, styles,
// fonts and images on its own origin.
//
// Isomorphic ES module, no DOM, no imports.

/** The headers of a cross-origin isolated page. */
export const ISOLATION_HEADERS = Object.freeze({ 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });

/** Why the page of `g` (a window's or a worker's global) is not cross-origin isolated, or null when it is. */
export function isolationProblem(g = globalThis) {
  if (g?.crossOriginIsolated) return null;
  if (g?.location?.protocol === 'file:') return 'the page is opened from a file, which cannot be cross-origin isolated: open the site or the local server';
  if (g?.isSecureContext === false) return 'the page is not a secure context (https or localhost), which cannot be cross-origin isolated';
  // (the browser edition's first load, before its service worker added the headers: isolated from the next one on)
  if (g?.navigator?.serviceWorker && !g.navigator.serviceWorker.controller && g?.document?.querySelector?.('link[rel="manifest"]')) return 'the page was loaded before its service worker made it cross-origin isolated: reload it';
  return 'the page is not cross-origin isolated: its server sent no Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy, or the browser refused them';
}

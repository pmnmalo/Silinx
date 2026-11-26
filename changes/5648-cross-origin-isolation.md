In detail:

- **The page cross-origin isolated (#5648, part of #5495):** the local server sends COOP (`same-origin`) and COEP
  (`require-corp`) with every response, and the browser edition's service worker adds them to the page it serves (GitHub
  Pages sends none: the page is isolated from its next load on, never reloaded under the user's work);
  `core/cross-origin.js` says why a page is not isolated. Its workers get SharedArrayBuffer and `Atomics.wait`, which the ESP32 node's Worker + Atomics back end needs.

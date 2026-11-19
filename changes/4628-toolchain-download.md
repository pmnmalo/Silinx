In short:

- **The browser edition opens faster:** the toolchain (Yosys, nextpnr, the device's databases) is no longer downloaded as
  soon as a project opens, but once the page is idle, some seconds later; on a metered or slow connection, by the first
  Implement, the console saying what it downloads, its size and its progress.
- **A new release no longer downloads the toolchain again:** what did not change stays in the browser's cache.

In detail:

- **The toolchain's background download after the opening (#4628):** it starts once the page is loaded, 15 to 45 seconds
  later (at random: a classroom's browsers do not download together) and when the browser is idle
  (`web/js/prefetch-schedule.js`); never on a metered or slow connection (Save-Data, 2G/3G, a cellular one). The first
  Implement or Synthesize downloads what is not kept yet before it runs (`prepareBrowserFlow`, forced), its console saying
  "Downloading the Silinx toolchain for the <part> (<size> MB: once, then kept by this browser)…" and each quarter of it
  (the files' sizes: the build's `sizes`, beside their SHA-256); a download under way is joined, not started again; Stop
  ends the wait.
- **Unchanged assets kept across releases (#4628):** the device descriptions and the bit databases, whose path names the
  release (`assets/<version>/`), are kept in Cache Storage under their SHA-256 (`assetKey`: `assets/sha256/<it>/<name>`), so
  that a release that did not change them finds them; `pruneAssetCache` deletes those whose SHA-256 the page no longer has.
  Yosys and nextpnr, under their own version's path, were already kept by a release that did not update them (now tested).
  A copy that differs from its SHA-256 is never used. The service worker no longer keeps a second copy of them by their URL
  (`sw-policy.js`: Yosys's and nextpnr's files only).

In detail:

- **The browser edition's prefetch test waits for the download to end (#4658):** its files are in the cache a moment
  before it ends, and an Implement started in between joined it, its "Downloading the Silinx toolchain…" lines in the
  run's log; `window.SILINX_PREPARING` (the downloads in progress) says when it has.

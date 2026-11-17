In detail:

- **micro80 routed by router 1 on the Basys 3 runs on Linux only (#4429):** `test/nextpnr-xc7-cyinit.test.js` joins the
  toolchain's heaviest tests (`HEAVY` in `scripts/test-shard.mjs`), which CI runs on Linux: on a slow Windows runner its
  micro80 test reached the 15 minutes a test may take.

In detail:

- **micro80's router 1 test on the Basys 3 in a file of its own, on seed 2 (#5565):** it timed out at its 900 s in
  the silinx-pic24-v0.2.0 tag's CI, router 1 taking most of its time on seed 3 (181 s alone on one computer, far more
  with other heavy files beside it in CI). test/nextpnr-xc7-micro80.test.js, listed in HEAVY (scripts/test-shard.mjs),
  checks the same (router 1, no warning, 100 MHz met by nextpnr's estimate) on seed 2 (40 s; seeds 1-5's times in a
  comment); test/nextpnr-xc7-cyinit.test.js keeps the CYINIT design's two tests; their timings estimated in
  test/timings.json until the next refresh.

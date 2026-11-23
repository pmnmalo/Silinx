In detail:

- **The unit tests on macOS and Windows in four parts, the timings refreshed (#5314):** Windows's third of three unit
  parts was cancelled at CI's 90 minutes (and macOS's took 87): the Zynq-7000 boards' post-place & route tests
  (test/zynq-routed.test.js, test/arty-z7-routed.test.js, about 15 minutes each on Linux) weighed under a second in
  test/timings.json and landed in one part. test/timings.json is refreshed from the scheduled run 45107637824, and
  macOS and Windows run their tests in four parts (.github/workflows/ci.yml): about 38 minutes of Linux's time a
  part, against 50 in three.
- **A pull request's tests in 20 parts at most (#5314):** with the refreshed timings the whole suite measures 539
  minutes, 34 a part in 16, past half the PR tests' 60-minute limit: scripts/related-tests.mjs's MAX_PARTS is 20.

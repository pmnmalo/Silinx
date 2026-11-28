In detail:

- **A pull request's tests in 24 parts at most (#5961):** test/timings.json's unit files refreshed from the CI runs of
  2026-11-26 and 2026-11-27 (806 → 1012 minutes in all); with them the whole suite planned in 20 parts made parts of 32
  minutes, past half the PR tests' 60-minute limit: scripts/related-tests.mjs's MAX_PARTS is 24 (parts of 27), 12 of them
  at once (max-parallel, #5952).

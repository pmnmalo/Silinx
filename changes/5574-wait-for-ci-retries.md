In detail:

- **A release's wait for CI survives a transient error of GitHub's API (#5574):** `scripts/wait-for-ci.mjs` retries
  a 5xx answer or a network error with a backoff (1, 2, 4, 8 minutes; five retries in a row at most, within
  `--timeout`) instead of failing the release while CI still runs; a 4xx still ends the wait. Tests: a fake API that
  answers a 500 then the run's success (the wait ends in success), the backoff, a 4xx, too many errors, the timeout.

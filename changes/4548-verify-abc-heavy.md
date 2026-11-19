In detail:

- **Verify's ABC tests run on Linux only (#4548):** `test/verify-abc.test.js` joins the heaviest tests (`HEAVY` in
  `scripts/test-shard.mjs`), which CI runs on Linux: on a slow Windows runner the mutated stopwatch reached its check's
  120 s limit before ABC's counterexample (30 s on a Mac).

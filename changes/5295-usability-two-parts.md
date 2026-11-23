In detail:

- **The weekly usability tests in two parts a configuration (#5295):** `.github/workflows/usability.yml` runs
  `test/usability/` in two jobs per configuration (Silinx, ISE, Portuguese; six at once), about 7 minutes each
  instead of one of about 14 next to its 15-minute limit; the parts' count in one place of its plan, the files asked
  for by hand still in one job. `test/timings.json` holds the usability files' times (the last run's, the new files'
  estimates) that `scripts/test-shard.mjs --usability` balances the parts by; `--dry-run --list` prints each part's
  files; `scripts/update-test-timings.mjs` reads a Usability run's times too, and a run of either workflow keeps the
  other's files' times. Test: test-shard (the two parts: every file once, each well under the limit; the merge of
  the times).

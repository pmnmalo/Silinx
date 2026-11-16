In detail:

- **The Release waits for CI as long as it takes (#4236):** the Release of v15.26.0 gave up after 150 minutes while
  its CI's second attempt (the failed jobs run again) was still running: the tags' runs go one at a time, so it had
  waited for the toolchain package's tag's run too, and the re-run passed 85 seconds later. `scripts/wait-for-ci.mjs`
  now has no limit of its own while a run is going (`--timeout`, none by default), reports a run's latest attempt
  (`(attempt 2)`), and gives a failed run `--rerun` minutes to be run again before the release fails; both Release
  workflows (the IDE's and silinx-fpga's) wait up to 340 and 345 minutes, a re-run within 30, in jobs of 360 minutes,
  GitHub's limit. Tests: wait-for-ci (the latest attempt, when to stop waiting, v15.26.0's runs replayed minute by
  minute: done at 153 minutes, where the 150 minutes' wait failed), the two Release workflows' limits.

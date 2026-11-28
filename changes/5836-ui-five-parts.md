In detail:

- **The UI tests in five parts per interface (#5836):** CI's UI job runs in five parts of about the same time (about 27
  minutes each by test/timings.json) instead of four, whose parts ran 30 to 40 minutes and four of them were cut off by
  the step's 40 minutes on 2026-11-27, their later files never run; the step's limit stays 40 minutes.
  test/timings.json's UI files refreshed from the CI runs of 2026-11-26 and 2026-11-27 (the unit files' times, which grew,
  are #5961's). scripts/update-test-timings.mjs leaves out a
  part's times file that is not JSON (a part cut off never finishes it) and says so, and a file a run did not measure
  keeps its time of before, as the usability files' did (#5295).

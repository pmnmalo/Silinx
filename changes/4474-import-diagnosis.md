In detail:

- **A UI test's failed import says what was on the screen, and CI keeps the failed tests' screenshots (#4474):** the
  #3538 Import Project test's wait reports the open dialog and the console's last lines; `ci.yml` uploads the harness's
  screenshots of the UI and browser jobs' failed tests as artifacts (14 days).

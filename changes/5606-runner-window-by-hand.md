In detail:

- **The ISE runner's window opened by hand (#5606):** `sudo /Library/Silinx-runner/window.sh open` failed: without
  RUNNER_DIR, then with it through `svc.sh`, which refuses root. `window.sh` no longer needs RUNNER_DIR, and
  `window.mjs` reads the settings launchd gives the tick (RUNNER_DIR, RUNNER_DAEMON, STATE_DIR) from the window's own
  plist beside its folder, so in the `--system` install the opening loads the runner's launchd daemon and keeps the
  window's state where the tick reads it; `svc.sh` is never run as root (a clear error instead). Tests: ise-runner
  (the plist's settings, the environment's own first; `window.sh open` run by hand on a scratch `--system` install
  loads the daemon, which fails on the old code); changelog fragment.

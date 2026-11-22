In detail:

- **CI: the Firefox / WebKit UI tests in a job per browser (#5170):** both browsers in one job took 28 minutes, and
  40 on a slow runner (every test 1.44 times slower, none hanging), past the tests' step limit, failing the release
  silinx-fpga-v0.6.2. The `browsers` job is now a matrix, `browsers (firefox)` and `browsers (webkit)`, each installing
  and caching its own browser, its tests' step limited to 30 minutes (15 normally) and the job to 60.

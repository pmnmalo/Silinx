In short:

- **ISE and Vivado over ssh:** a build whose results could not be copied back from the ssh host fails, instead of
  reporting success and showing (and programming) the previous run's bitstream and reports.

In detail:

- **A failed download of an ssh build's results fails the job (#4721):** `runSsh` (ISE, Vivado and the device report
  over ssh) logged a warning and returned the remote flow's exit code 0 when copying the results back failed, so the
  local `build/` kept the earlier run's `.bit` and reports as this run's. The job now fails with
  `ERROR: downloading results from the ssh host failed (exit code N): the flow ran there, but its results are not here`;
  a flow that failed itself keeps its own exit code, the download's failure a warning.

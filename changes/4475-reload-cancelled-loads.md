In detail:

- **A reload's cancelled requests are not a UI test's errors (#4475):** reloading the page cancels its own requests still
  in flight, which WebKit and Firefox report as failed loads ("access control checks"); the harness drops those
  reported until the new page's load event (`reload` in `test/ui/harness.js`), so the tablet's Tasks test no longer
  fails on them twice in a row.

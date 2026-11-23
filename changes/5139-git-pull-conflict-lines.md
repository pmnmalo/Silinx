In detail:

- **The pull's merge view UI test reads the conflict's error and the merge view's line apart (#5139):**
  test/ui/git-pull-merge.test.js waited for the error, its hint and the merge view's "Merge: 1 conflict(s)…" as three
  lines in a row; the merge view's module is loaded between them, and the watcher's "Changed outside Silinx:
  src/timer.vhd." (the merge git aborted, a pull's changes told to the page, #3195) came in between on a loaded
  runner. The test waits for the error with its hint, then the merge view's line, after it.

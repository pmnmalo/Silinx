In detail:

- **The private-data check of main's history (#4364):** the dummy address in a made-up rate limit's message of
  test/github-checks.test.js, in one commit's version of it only (gone since), is on the allow-list with its reason
  (scripts/check-private-data.mjs). Test: private-data (that file only; another address in it still found).
- **The Circuit editor's UI tests (#4367, #4368):** circuit-look's ⋮ menu ends with the KiCad group (#4282's exports)
  and circuit's Parts panel with the KiCad catalogue (#4305), as intended; their expected lists say so, in English and
  in Portuguese.
- **xc7-timing-vivado on Windows (#4371):** the placement's Tcl test reads tclsh's output and files with LF, as Tcl
  writes CRLF on Windows; its standard output is made CRLF on every system, so the case is tested everywhere, and
  placementCounts on a CRLF report is tested too.

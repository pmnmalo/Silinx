In detail:

- **core/schdoc.js split under the 1000-line limit (#4765):** its HDL text helpers (names, constants, the token stream,
  comments and indentation) and its IR expression printers moved as they were to core/schdoc-text.js, still exported by
  core/schdoc.js (997 -> 710 lines); the same HDL and netlists as before on the repository's schematics.

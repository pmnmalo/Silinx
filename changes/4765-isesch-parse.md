In detail:

- **core/isesch.js split under the 1000-line limit (#4765):** its readers of ISE's schematic and symbol files (`parseXml`,
  `parseIseSch`, `parseIseSym`, the text format of ISE 6) moved as they were to core/isesch-parse.js, still exported by
  core/isesch.js (995 -> 793 lines); the same imports and exports as before on the repository's ISE files and schematics.

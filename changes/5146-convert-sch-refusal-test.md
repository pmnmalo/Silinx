In detail:

- **Convert to Schematic's refusal: its UI test reads the console (#5146):** since #4747 a command's refusal is an
  ERROR line of the console, not a modal box; Convert to Schematic still refuses a module that does not elaborate,
  writing nothing, and `test/ui/convert-sch.test.js` still waited for the box (the release CI of v15.30.0 failed on
  it). It now waits for the one ERROR line, in English and in Portuguese, with no dialog open.

In short:

- The check of an HDL file as one types runs beside the page, in a worker, and parses only what changed: typing stays
  smooth in a big project, and a half-typed line shows its syntax error without a cascade of others.

In detail:

- **The live HDL check in a Web Worker, with kept parses (#4773):** the check of the file being edited
  (`core/hdl-check.js`, shared by Check Syntax) runs in `web/js/hdl-check-worker.js` (embedded in the standalone
  edition, as the toolchain's and the emulator's workers; in the page where no worker starts); `core/compile.js`
  keeps the last 512 files' parses, by their path, text, included texts and package types, so that a key typed
  parses its file only; the file's modules are elaborated once it reads without an error (Check Syntax elaborates
  them still).

In detail:

- **The C interpreter's modules import alone (#4723):** `core/c-interp-lib.js` (imported by itself, as the MCP's HLS
  tools and the C source view do) threw "Cannot access 'exprMethods' before initialization": c-interp-task imported
  c-check for `constValue`, closing the cycle c-interp → c-check → c-const-init → c-interp, whose methods were mixed in
  at load before c-interp-expr had run. `constValue` has a module of its own (`core/c-const-value.js`, c-check
  exporting it as before); a new test imports every module of `core/` alone, each in a fresh worker.

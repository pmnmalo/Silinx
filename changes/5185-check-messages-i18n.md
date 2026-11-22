In short:

- **The Petri net's and the circuit's Check in Portuguese:** their errors and warnings (a deadlock, a transition that
  never fires, a short circuit, a floating input, an IC not powered…) in the console and in its Errors and Warnings
  tabs in the interface's language, as the state diagram's.

In detail:

- **The Petri net's and the circuit's Check messages translated (#5185):** `editorProblems` (`web/js/editor-problems.js`)
  takes `inLanguage`: its Errors and Warnings tabs' messages and Check's console lines through `t()`, the tabs again
  when the language changes (the state diagram's, which did it in `drawings.js`, the Petri net's and the circuit's);
  the Portuguese of every message of `core/circuit-check.js` and its KiCad parts' (`checkModels`), and of
  `core/petri.js` `validatePetri` and `core/petri-analysis.js` `checkPetri` (`web/js/i18n-circuit.js`,
  `web/js/i18n-petri.js`). The MCP server's `check_drawing` says them in English, as before. A condition's own parse
  error stays in English (#5196).

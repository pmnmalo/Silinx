In detail:

- **The files slice (#5668):** `web/js/system-program-ui.js` reads the project's files from `state-files.js`'s
  `filesState`, not through `S`, as `test/web-state.test.js` requires.

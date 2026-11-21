In detail:

- **The page's state, the processes' slice, the last (#4767):** the processes' states, the Errors / Warnings tabs'
  messages, a process running and the tabs' clearings are web/js/state-proc.js's, which their modules read and write;
  web/js/app.js's `S` keeps those four fields as getters and setters onto it, as before, and now holds only the project,
  its devices and its toolchain itself. The earlier slices' fields read in a spread (`...S.docs`, `...S.fileTree`,
  `...S.modules` …: 29 of them, in 14 modules) are read through their slices too.

In detail:

- **The page's state, the compiled design's slice (#4767):** the Design pane's view, the sources, the compiled library
  and its modules, and the drawings' generated HDL and maps (their texts, modules, linked HDL files, symbols, circuits'
  parts, failed drawings) are web/js/state-design.js's, which their 45 modules read and write; web/js/app.js's `S` keeps
  those thirteen fields as getters and setters onto it, as before.

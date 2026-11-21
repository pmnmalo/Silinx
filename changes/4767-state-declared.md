In detail:

- **The page's state declared (#4767, part 1):** web/js/app.js's `S` declares every field the page's modules use (52,
  16 before), grouped by concern (the project and its files, the compiled design, the drawings' HDL, the selection and the
  panes, the documents, the processes, the page's start), each with what it holds and who writes it; the fields first
  set later start undefined, as before. test/web-state.test.js keeps it so.

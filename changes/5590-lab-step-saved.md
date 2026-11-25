In short:

- **Guided labs:** a step chosen and the lab opened again at once opens at that step, not at the one saved before.

In detail:

- **A lab's progress saved one write after another, read after them (#5590):** choosing a step saved
  labs/progress.json without waiting, and the lab opened again at once read the file as it was before
  (web/js/lab-view.js: a project's saves chained, a read after the ones made before it). Test: UI labs (the progress
  file's write held for 1 s, a step chosen, the lab closed and opened again: opened at that step, saved, no warning;
  fails on the old code).

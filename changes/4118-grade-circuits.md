In short:

- **Grading a circuit:** a submission holding a digital circuit (`.circ.json`) is graded with the HDL made from it,
  no longer refused with an Interface Error.

In detail:

- **Grading: a circuit is one of the drawings an exercise allows (#4118):** `circ` joins the drawing kinds of
  `allow.drawings` (core/grade-format.js `DRAWINGS`), which an exercise without its own list allows, as it does the
  schematic, the state machines, the truth table and the Petri net; docs/GRADING.md's example lists it.

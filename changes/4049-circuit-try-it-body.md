In short:

- The circuit editor's Properties panel is a light green while the circuit is tried out, as the other editors' Try it.

In detail:

- **The circuit editor's Try it body (#4049):** while a circuit runs (*Try it*), its Properties panel is the Try it's body,
  the lighter green of #3924 (`try-it-body`), plain again once it stops; `test/ui/try-it-body.test.js` checks it with the
  other editors, in both themes, its text AA.

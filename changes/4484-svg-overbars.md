In short:

- **The Engineering notation's bars drawn cleanly on the drawings:** a state diagram's arcs and an ASM chart's
  decisions draw a NOT as one even bar over exactly its letters, at any zoom and in both themes, a bar over bars above
  them, where each letter carried a bar of its own, broken and uneven.

In detail:

- **An SVG condition's bars drawn as lines (#4484):** the arcs' labels and the decision boxes (#4417) wrote the
  combining overline (U+0305) after each letter, which the fonts drew letter by letter at different heights. They are
  now drawn without it, each bar a line over its characters measured from their cells (web/js/overbar.js
  `drawSvgBarsIn`; core/overline.js `barRuns` and `barLines`: one bar per run of characters under a bar, an outer bar a
  step above the bars under it), in the text's colour, the text as written in its `data-written`; a text not laid out
  yet (its tab hidden) gets its bars once it is. The Properties' list of a state's transitions draws its conditions
  with the HTML bars of #4058. Tests: test/overline-bars.test.js, test/ui/overbar.test.js (the bars measured on the
  screen against the letters, at two zooms, in both themes and interfaces), test/ui/expr-notation.test.js.

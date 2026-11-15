In short:

- **Nested negations readable:** in the Electronics / Engineering notation, a NOT inside a NOT is drawn as a bar above
  the bar under it, instead of overlines on top of each other.

In detail:

- **The Electronics / Engineering notation's bars drawn (#4058, `web/js/overbar.js`):** the truth table's results,
  Quine-McCluskey's steps, the Karnaugh map's groups and a state diagram's transition table draw each NOT as a line over
  its group, the groups nested, each bar above the ones under it (the combining overlines, U+0305, which fonts stacked
  badly). A long barred group is not broken across lines: its line scrolls. The text is unchanged: copied, it is the
  same expression with its overlines, which the parsers read back. No new dependency.

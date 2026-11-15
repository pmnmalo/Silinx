In short:

- **Large truth tables' results, quick:** the MCP server's `related_view` shows a large expression in part, as the
  editor does; a NAND or NOR form of many inputs is no longer megabytes in the editor either.

In detail:

- **Expressions shown in part, in the MCP server too (#4150):** `related_view`'s results write each expression through
  `core/expr-part.js` as the editor does: its first 10 000 operators and literals, then ` (shown in part: N literal(s) in
  all)`. A table of 16 inputs gave 353 million characters in the text notation and ran out of memory in the Electronics
  one; now 2 MB, about a second.
  - A one-input NAND or NOR (its input written twice) gives its input half of the budget left, so that nested ones stay
    within it as written: a NAND form of 16 inputs was 6.5 million characters in the editor too, now about 30 000.

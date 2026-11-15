In detail:

- **An expression shown in part, in `core/` (Part of #4150):** the bound the truth table's results show a large
  expression with (its first 10 000 operators and literals, #3939) moved from `web/js/tt-results.js` to
  `core/expr-part.js` as it was, for the MCP server's `related_view`; no behaviour changed.

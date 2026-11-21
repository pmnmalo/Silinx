In short:

- **A state diagram's tables:** the transition table, the one edited in place, is shown first; a condition with a bar
  (ūp) is centred in its cell as the others, no longer a box at its left.

In detail:

- **A barred text in a table's cell (#5024):** the bars' drawing (`web/js/overbar.js` `drawBars`) gave the cell itself
  the class `ob-text` (an inline box), so the cell was no longer a table cell: drawn at the cell's left, as a box inside
  it. A cell's text is now drawn in a span of its own, the cell staying a cell.
- **The transition table first (#5024):** the Tables panel shows the transition table (edited in place, #4974), then
  the state table and the encoded transition table (`web/js/fsm-bottom.js`; the order of #4966 revised).

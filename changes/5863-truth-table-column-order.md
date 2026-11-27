In short:

- Boolean Algebra: a truth table's columns are reordered by dragging their headers (a mouse, a finger or a pen), or by
  Alt+Shift+← / → on a focused header: an input moved sorts the rows again in the new order, an output moved moves its
  column; the Inputs and Outputs boxes follow (#5863).

In detail:

- Boolean Algebra: an input's header dragged among the inputs changes the variables' order (the first the most
  significant bit): the rows are sorted again in the new binary order, each row's outputs and don't cares kept with its
  input combination; the module's ports, the Karnaugh map and the results follow, a typed expression is kept. An
  output's header dragged among the outputs moves its column. An input never lands among the outputs, nor the reverse.
  One step of the main toolbar's Undo; a read-only table refuses, in the console ("x is read only: its columns are not
  moved."); live sharing pushes it (`core/logic.js` `moveColumn`, `web/js/tt-col-drag.js`, #5863).
- MCP: `set_output_logic`'s `inputs` / `outputs` reorder the columns the same way (#5863).

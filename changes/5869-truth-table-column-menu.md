In short:

- Boolean Algebra: a truth table column's header has a right-click menu (a long press on touch): Rename, Duplicate
  Output, Insert Before / After, Delete, Move Left / Right (#5869).

In detail:

- Boolean Algebra: a column header's right-click menu. Rename Input… / Output… opens a small dialog that says why a
  name is refused (taken, reserved, not valid) and stays open; an input renamed keeps its rows and its name in the
  expressions, an output its column, expression and form. Duplicate Output copies an output after it (f → f2) with its
  column, expression and form. Insert Input / Output Before or After adds a column with the first free name: a new input
  leaves every output independent of it, a new output is 0s. Delete Input keeps the rows where the input is 0; the last
  input or output is not deleted (the console says why). Move Left / Right as Alt+Shift+← / →. Each is one step of the
  main toolbar's Undo, the document's, not a project command; a read-only table has no menu (`core/logic-columns.js`,
  `web/js/tt-col-menu.js`, #5869).
- MCP: `set_output_logic`'s `duplicate` copies an output as Duplicate Output does; renaming, inserting and deleting
  columns are its `inputs` / `outputs` (#5869).

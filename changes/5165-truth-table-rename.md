In short:

- A truth table's input or output renamed in its Inputs or Outputs box keeps its column (an output) or its rows (an
  input), instead of a new one of 0s.

In detail:

- **Truth table: a name changed in the Inputs or Outputs box is a rename (#5165):** the boxes matched the columns by
  name, so a name changed there was one dropped and one added: a renamed output became 64 zeros (the lock's
  `digit_ok`), and a renamed input made every row where it is 1 a copy of its row at 0 (traffic's `lamps`). When the
  list has as many names as before and only one of them is different and new to it, that name is renamed: its column,
  expression, HDL logic and minimal solution (an output), or its rows and its name in the expressions (an input), are
  kept. Two names changed at once, a name added, removed or moved still follow their names. The MCP server's
  `set_output_logic` sets a table's inputs and outputs too (`inputs`, `outputs`), through the same function, with the
  editor's checks and messages.

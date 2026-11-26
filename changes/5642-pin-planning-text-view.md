In short:

- I/O Pin Planning is the only constraints entry of Emulate's and Implement's process trees: its views are Table, Board
  and Text (the constraints file as text), and its Check button checks the constraints. Opened from Emulate, it stays in
  Emulate. A System's FPGA nodes the same.

In detail:

- **I/O Pin Planning alone (#5642):** the User Constraints folder of the process trees (Emulate's and Implement's, the
  ISE style's Implementation view too) is gone, I/O Pin Planning in its place: Edit Constraints (Text) is its new Text
  view (Table | Board | Text, Table first: the constraints file, UCF, PCF, LPF, CST, CCF or XDC, in the text editor, its
  problems shown as it is typed; its edits read into the table, the table's written into it), and Check Constraints its
  Check button, just before Clear All (the same lines in the console). Opened from Emulate (its bar, its tree, the
  Board Emulator's "Pins not set"), it is Emulate's document and the interface stays in Emulate; Implement's before.
  A System's FPGA nodes the same: their User Constraints are their I/O Pin Planning alone (Emulate's, opened there, and
  Implement's trees, the ISE style's node row; the System editor's side panel without its Edit Constraints (Text)
  button), the file made, when the node has none, by its save or its Check.
  The constraints file's own row and the console's errors still open the file in the text editor; the MCP's
  `check_constraints` and `constraints_wizard` are unchanged.

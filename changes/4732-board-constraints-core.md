In short:

- **The MCP server's constraints from the board as the interface's:** `set_top` with `update_constraints` and
  `set_design_properties` give pins to the ports no board name matches (a student's `a`, `b`, `y`: inputs on the
  switches, outputs on the LEDs), as Update Constraints does.

In detail:

- **Constraints from the board and Check Constraints: one implementation (#4732):** `core/board-constraints.js`
  (`ucfPort`, the board of a project, the constraints file from its pins) and `core/constraints-diagnostics.js` (Check
  Constraints of a file in its format), used by the interface (Update Constraints, Check Constraints), the MCP server
  (`check_constraints`) and the server's store (the constraints written on a board change, `set_top
  update_constraints`), which matched the ports to the board by name only.

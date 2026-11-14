In short:

- **State diagrams: conditions in any notation:** a transition's condition may be written C-style (`x && !y`),
  bitwise (`x & ~y`), in words (`x AND NOT y`) or in Boolean algebra (`x.y'`, `x·/y`, `x + y`) or logic's signs (`x ∧ ¬y`, `x ∨ y`); `else` and
  `default` (as `true` and `1`) mark the state's otherwise transition, taken when no other one is. The drawing
  keeps the text as typed; the HDL is the same whatever the notation.

In detail:

- **The logic operators' notations in a condition (#3907):** AND as a point, a middle dot or `∧` (`a.b`, `a·b`), OR as
  `∨` or `+` (but in a comparison's operand, where it adds: `count + 1 >= max`), NOT as a postfix apostrophe (`a'`) or a
  prefix slash (`/a`) or `¬`, besides `&&`, `&`, `AND`, `||`, `|`, `OR`, `!`, `~`, `NOT`; NOT binds first, then AND, then
  OR, comparisons tighter than AND. Bit and based literals (`'1'`, `4'b1010`) and VHDL's `/=` are unchanged; `1.5`,
  a division (`a / b`) and two operands side by side (`a b`) are errors, which now give their column. The state
  diagram's, the ASM chart's and the Petri net's conditions share them (core/asm-expr.js); an action's `+` still
  adds. A transition label's `/` NOT (`/a / z=1`) is told from the outputs' `/`.
- **The otherwise transition (#3907):** `else`, `default`, `true`, `1`, `always` or no condition; kept as typed
  (no longer emptied), taken last wherever it is listed (the HDL's `else`), never reported as overlapping the
  others; two in one state are an error of Check (in Portuguese too). The MCP tools write_file, check_drawing and
  simulate_drawing take the same conditions.

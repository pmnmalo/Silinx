In short:

- **Boolean Notation:** *Settings ▸ Boolean Notation* (*View ▸* in the ISE style interface) chooses how Silinx shows
  Boolean expressions: Electronics / Engineering (`a̅·b + c`, with an overbar: the default), text only (`/a.b + c`),
  logic (`¬a ∧ b ∨ c`), VHDL or Verilog. The truth table's results and Karnaugh map groups and a state diagram's
  transition table follow it; expressions are still typed in any notation, the overbar included.

In detail:

- **The notation of the Boolean expressions shown, part 1 (#3915):** a preference of the viewer, kept in the browser
  (web/js/notation.js), Electronics / Engineering by default; the truth table's results, canonical forms and K-map groups
  and its own notation menu (now that setting: the five notations), and the state diagram's transition table (its
  drawing's conditions shown as typed) use it, and are drawn again when it changes. core/expr-notation.js writes a
  truth table's expressions and a condition in each notation (the overbar a combining overline, U+0305, over each
  character it covers, core/overline.js); the parsers of both read every notation back (an overbar over a name or a
  group is its NOT). The MCP tool set_notation reads or sets the MCP server's notation (config.json's `notation`);
  related_view's results and set_output_logic use it, or the notation a call names. Conversions (an HDL module or a
  chart made a drawing) are part 2.

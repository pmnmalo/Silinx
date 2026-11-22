In short:

- **The HDL editor's indentation:** Enter in a VHDL file indents by VHDL's blocks (one level after `is`, `begin`,
  `then`, `else`, `loop`, `generate`, a `when`; a port continued under the first port), and `end`, `begin`, `elsif`,
  `else`, `when` typed at the start of a line go back to their block's indentation, as Verilog's `end`, `endmodule`,
  `endcase` do; Enter after a keyword typed whole (`is`, `then`, `begin`) makes the new line even with the completion
  list open on it.

In detail:

- **VHDL's indentation (#5218):** the editor's VHDL mode (CodeMirror's legacy one) indented as C does: a line after a
  declaration at column 0, after `end if;` deeper, `end` never brought back. `core/vhdl/indent.js` gives a line the
  indentation of its block (a scan of the lines before it as they are indented: entity, architecture, package,
  function, process, block, component, if, case and its whens, loops, generates, records), a statement continued one
  level deeper, an open `(` under its first item (one level deeper when the `(` ends its line, its `)` back under it),
  `end` back to its block's opening, `begin` to its block's, `elsif` / `else` to their `if`'s, `when` one level under
  its `case`; the editor's indentation service, and its words typed again at the start of a line (indentOnInput). It
  gives the examples' own indentation, but the continued statements aligned by hand. Test: vhdl-indent, the
  usability scenario of the indentation left as the editor gives it.
- **Verilog's closing words brought back (#5219):** the HDL editor had no `indentOnInput()`, so the Verilog mode's
  electric words (`end`, `endmodule`, `endcase`…) stayed where Enter put them; the VHDL and Verilog editors have it,
  Verilog's on its closing words typed at the start of a line only (the legacy mode's also on a bracket typed anywhere
  in a line, which indented again a line the person had indented).
  Test: the usability scenario of Verilog's `end` and `endmodule`.
- **Enter after a word typed whole (#5220):** the completion list open on a word already typed whole (the only or
  first word it offers, `is`, `then`, `begin`) took the Enter, and no new line was made; Enter then closes the list
  and makes the line (a completion that adds something is still taken). Test: the usability scenario of Enter after a
  keyword, and the others' Enter no longer closing the list with Esc first.

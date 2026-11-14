In short:

- **Check Syntax says a drawing's errors.** A drawing with errors and no HDL file yet (a state diagram with two
  states of one name, a new chart with no state) is told by its errors, on the drawing, instead of "top module … not
  found".

In detail:

- **A drawing that makes no module, told by its errors (#3934):** Check Syntax (Check Design in a design and simulation
  project) and the MCP server's `check_syntax` say, for a drawing with errors and no HDL file that the design needs
  (its module the top, or an instance's the elaboration does not find), `ERROR:Silinx - "x.fsm.json": its HDL cannot
  be made: …. Fix x.fsm.json …` (a design project's: its module is not made), in place of "top module … not found";
  one the design does not use says nothing (core/drawing-diags.js `withDrawingErrors`, the same for both).

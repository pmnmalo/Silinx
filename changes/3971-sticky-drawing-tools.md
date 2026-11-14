In short:

- The state diagram and ASM chart editors' toolbars start with a select arrow, as the Petri net editor's, and their add
  tools stay on: pick State (or Decision, Case, …) once, then click the drawing for each state or box, until Escape or
  the arrow.

In detail:

- **A select arrow and add tools that stay on, in the state diagram and ASM chart editors (#3971):** the arrow is the
  toolbar's first icon and the default tool; an add tool stays pressed (`.active`, `aria-pressed`, a crosshair on the
  drawing) and adds an element at each click on the drawing's background, until another tool, the arrow or Escape is
  picked (web/js/editor-tools.js, shared with the Petri net editor). In the ASM chart a click on a box with an add tool
  on adds the new box on that box's free exit (what selecting the box and clicking the tool did); a box with no free
  exit says so in the console. A transition is still drawn from a state's rim, and a port still draws an arrow, with
  any tool; Try it switches the state diagram back to the arrow. The MCP server is unchanged: the tools are the view's
  (its own tools add states and boxes).

In short:

- **A state diagram's conditions in the Boolean notation, edited as text:** each arc's condition (and an ASM chart's
  decision) is drawn in the notation of Settings ▸ Boolean Notation, its bars too, and drawn again when it changes;
  the Properties box and the edit in place always show and take plain text (`/equal`, `!equal`, `equal'`…), never
  e̅q̅u̅a̅l̅.

In detail:

- **A condition drawn in the notation, kept as text (#4417):** the notation is a view. The state diagram's arcs, its
  Properties' list of a state's transitions and the ASM chart's decision boxes draw each condition in the notation
  chosen (web/js/notation.js `drawnCond`; a bar takes no room in a label's width); the Properties' Condition box and
  the edit in place show the text as typed. The conversions (Convert to State Diagram / ASM chart, a diagram made
  again from its HDL, an ASM chart's or a Petri net's state diagram, MCP `convert_module` / `convert_drawing` /
  `related_view`) write the notation's text form (core/cond-notation.js `writeCond`: the Electronics / Engineering
  one's is the text only one's, `/a.b`), where they wrote the overbar characters into the drawing (#3915). A
  condition with bars (a drawing 15.27 saved, a text pasted) is read as the text only notation's NOT
  (`condAsText`, in `normalizeFsm` and `normalizeModel`: the MCP's tools read it so too). Tests:
  test/cond-text.test.js, test/conversion-notation.test.js, test/mcp-notation.test.js, test/ui/expr-notation.test.js
  (the arcs, the Properties box, the edit in place, an ASM chart's decisions, in both interfaces); the UI tests that
  read an arc's label in the tests' text only notation.

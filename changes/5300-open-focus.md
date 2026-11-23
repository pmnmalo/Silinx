In short:

- A file opened from the command palette (Ctrl+K), or by Enter on the Design tree's row of a file with no module yet
  or of a drawing, has the keyboard in its editor: its text, or its drawing.

In detail:

- **A document opened from the keyboard takes the keyboard (#5300):** the command palette's file and Enter on a row of
  the Design tree (`web/js/doc-focus.js` openFocused: the document brought to the front while it opened, its text
  editor focused, else its drawing's canvas: a state diagram's, an ASM chart's, a schematic's, a truth table's) as a
  module's HDL was already; the focus left where it is when the person moved it meanwhile, and a double-click (the
  mouse) keeps it in the tree. Tests: open-focus (UI: the palette's file, the rows of an empty file, a state
  diagram's and a truth table's module, a double-click; no line in the console; both interfaces); usability keyboard
  (#5300's todo a real test; the Tab to the editor after Enter on the file's row, and to the state diagram, dropped).

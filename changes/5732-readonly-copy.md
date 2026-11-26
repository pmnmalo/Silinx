In short:

- A copy from a read-only document pastes into another: a read-only HDL file's text (its context menu's Copy), a
  read-only schematic's selection (Edit ▸ Copy, the toolbar, Ctrl+C).

In detail:

- **A read-only HDL file's copy pasted elsewhere (#5732):** the text editor's context menu's Cut, Copy and Paste go
  through the app's clipboard, as Edit ▸ Cut / Copy / Paste do (#677): a copy from the HDL generated from a drawing
  pastes into another HDL file by Edit ▸ Paste, the toolbar and the context menu's Paste, which no longer refuses it
  with "Use Ctrl+V to paste" when the browser's clipboard cannot be read; its Paste and Cut are disabled when there is
  nothing to paste or the file is read-only.
- **A read-only schematic copied (#5733):** its selection copied by Edit ▸ Copy, the toolbar's Copy and Ctrl+C (a
  drawing saved by a newer Silinx, a followed project's, a truth table's or a state diagram's schematic, a symbol's
  composition); Cut, Paste and Delete still refused there. Tests: the UI test clipboard-readonly, both interfaces.
